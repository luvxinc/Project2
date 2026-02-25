package com.mgmt.modules.finance.infrastructure

import com.mgmt.modules.finance.application.dto.FileInfoResponse
import com.mgmt.modules.finance.application.dto.FileItem
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * PrepaymentFileService — file management for prepayment records.
 *
 *   - file_info_api (api.py L836-886)
 *   - serve_file_api (api.py L891-952)
 *   - upload_file_api (api.py L957-1028)
 *   - delete_file_api (api.py L1033-1078)
 *
 * Storage path: data/records/finance/prepay/{YYYY}/{tran_num}/
 * File naming: {tran_num}_V01.{ext}, _V02, ...
 */
@Service
class PrepaymentFileService {

    private val baseDir: Path = Paths.get("data", "records", "finance", "prepay")

    /**
     * Get file info for a prepayment record.
     */
    fun getFileInfo(paymentNo: String): FileInfoResponse {
        val year = parseYear(paymentNo)
        val dir = baseDir.resolve(year).resolve(paymentNo)

        val files = mutableListOf<FileItem>()
        var hasFile = false
        var latestFile: String? = null

        if (Files.exists(dir)) {
            Files.list(dir)
                .filter { Files.isRegularFile(it) }
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

        // Security: prevent path traversal (V1: api.py L921-922)
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

        // Find next version number (V1: api.py L998-1012)
        val existingVersions = mutableListOf<Int>()
        if (Files.exists(dir)) {
            Files.list(dir).filter { Files.isRegularFile(it) }.forEach { f ->
                val name = f.fileName.toString().substringBeforeLast(".")
                if ("_V" in name) {
                    try {
                        existingVersions.add(name.substringAfterLast("_V").toInt())
                    } catch (_: Exception) {}
                }
            }
        }

        val nextVersion = (existingVersions.maxOrNull() ?: 0) + 1
        val filename = "${paymentNo}_V${String.format("%02d", nextVersion)}${ext.lowercase()}"
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
     * Check if a file is HEIC/HEIF format (needs conversion).
     */
    fun isHeicFormat(filename: String): Boolean {
        val ext = filename.substringAfterLast(".").lowercase()
        return ext in listOf("heic", "heif")
    }

    /**
     * Parse year from payment_no (tran_num).
     * V1 format: XX_20260104_in_01 → year = 2026
     * V1 logic: api.py L848-853
     */
    private fun parseYear(paymentNo: String): String {
        val parts = paymentNo.split("_")
        return if (parts.size >= 2) {
            val datePart = parts[1]
            if (datePart.length >= 4) datePart.substring(0, 4)
            else java.time.Year.now().toString()
        } else java.time.Year.now().toString()
    }
}
