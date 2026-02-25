package com.mgmt.modules.finance.infrastructure

import com.mgmt.modules.finance.application.dto.FileInfoResponse
import com.mgmt.modules.finance.application.dto.FileItem
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * LogisticPaymentFileService — file management for logistics payment records.
 *
 *
 * Storage path: data/records/finance/logistic/{YYYY}/{pmt_no}/
 * File naming: {pmt_no}_Ver{02d}.{ext}
 */
@Service
class LogisticPaymentFileService {

    private val baseDir: Path = Paths.get("data", "records", "finance", "logistic")

    /**
     * Get file info for a payment record.
     */
    fun getFileInfo(paymentNo: String): FileInfoResponse {
        val year = parseYear(paymentNo)
        val dir = baseDir.resolve(year).resolve(paymentNo)

        val files = mutableListOf<FileItem>()
        var hasFile = false
        var latestFile: String? = null

        if (Files.exists(dir)) {
            Files.list(dir)
                .filter { Files.isRegularFile(it) && !it.fileName.toString().startsWith(".") }
                .sorted(Comparator.reverseOrder())
                .forEach { f ->
                    files.add(FileItem(
                        name = f.fileName.toString(),
                        size = Files.size(f),
                        modified = Files.getLastModifiedTime(f).toMillis(),
                    ))
                    if (latestFile == null) {
                        latestFile = f.fileName.toString()
                        hasFile = true
                    }
                }
        }

        return FileInfoResponse(
            tranNum = paymentNo,
            year = year,
            hasFile = hasFile,
            latestFile = latestFile,
            files = files,
        )
    }

    /**
     * Get the resolved file path for serving/downloading.
     *
     * Returns null if file doesn't exist or path traversal detected.
     */
    fun resolveFilePath(paymentNo: String, filename: String): Path? {
        val year = parseYear(paymentNo)
        val filePath = baseDir.resolve(year).resolve(paymentNo).resolve(filename)

        // Security: prevent path traversal (V1: file_ops.py:196-199)
        if (".." in filePath.toString()) return null
        if (!filePath.toAbsolutePath().startsWith(baseDir.toAbsolutePath())) return null
        if (!Files.exists(filePath)) return null

        return filePath
    }

    /**
     * Save an uploaded file with versioning.
     *
     * @return the saved filename
     */
    fun saveFile(paymentNo: String, originalFilename: String, bytes: ByteArray): String {
        val year = parseYear(paymentNo)
        val dir = baseDir.resolve(year).resolve(paymentNo)
        Files.createDirectories(dir)

        // Get file extension
        val ext = if ("." in originalFilename) ".${originalFilename.substringAfterLast(".")}" else ""

        // Find next version number (V1: file_ops.py:137-148)
        val existingVersions = mutableListOf<Int>()
        if (Files.exists(dir)) {
            Files.list(dir).filter { Files.isRegularFile(it) }.forEach { f ->
                val name = f.fileName.toString().substringBeforeLast(".")
                if ("_Ver" in name) {
                    try {
                        existingVersions.add(name.substringAfterLast("_Ver").toInt())
                    } catch (_: Exception) {}
                }
            }
        }

        val nextVersion = (existingVersions.maxOrNull() ?: 0) + 1
        val filename = "${paymentNo}_Ver${String.format("%02d", nextVersion)}${ext.lowercase()}"
        val filePath = dir.resolve(filename)

        Files.write(filePath, bytes)
        return filename
    }

    /**
     * Delete a file.
     */
    fun deleteFile(paymentNo: String, filename: String): Boolean {
        val path = resolveFilePath(paymentNo, filename) ?: return false
        Files.deleteIfExists(path)
        return true
    }

    /**
     * Parse year from pmt_no.
     * Format: 2026-01-04_S01 -> year = 2026
     */
    private fun parseYear(paymentNo: String): String {
        // pmt_no format: YYYY-MM-DD_S## (e.g. 2026-01-04_S01)
        return if (paymentNo.length >= 4) {
            paymentNo.substring(0, 4)
        } else {
            java.time.Year.now().toString()
        }
    }
}
