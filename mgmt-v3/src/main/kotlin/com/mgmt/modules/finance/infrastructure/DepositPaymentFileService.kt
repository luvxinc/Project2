package com.mgmt.modules.finance.infrastructure

import com.mgmt.modules.finance.application.dto.FileInfoResponse
import com.mgmt.modules.finance.application.dto.FileItem
import org.springframework.stereotype.Service
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths

/**
 * DepositPaymentFileService — file management for deposit payment records.
 *
 * V1 parity: backend/apps/finance/views/deposit/api.py (file endpoints)
 *
 * Storage path: data/records/finance/deposit/{YYYY}/{pmt_no}/
 * File naming: {pmt_no}_V{02d}.{ext}
 *
 * NOTE: Deposit uses "_V" prefix (e.g. _V01), NOT "_Ver" like logistics.
 * This is a faithful V1 migration — V1 api.py:770 uses _V{next_ver:02d}.
 */
@Service
class DepositPaymentFileService {

    private val baseDir: Path = Paths.get("data", "records", "finance", "deposit")

    private val allowedExtensions = setOf(
        ".pdf", ".jpg", ".jpeg", ".png", ".gif",
        ".heic", ".heif", ".xls", ".xlsx", ".doc", ".docx", ".csv"
    )

    /**
     * Get file info for a deposit payment record.
     * V1 parity: deposit_file_list_api (api.py:911-965)
     */
    fun getFileInfo(paymentNo: String): FileInfoResponse {
        val year = parseYear(paymentNo)
        val dir = baseDir.resolve(year).resolve(paymentNo)

        val files = mutableListOf<FileItem>()
        var hasFile = false
        var latestFile: String? = null

        if (Files.exists(dir)) {
            Files.list(dir)
                .filter { Files.isRegularFile(it) && it.fileName.toString().startsWith(paymentNo) }
                .sorted(Comparator.comparingLong<Path> { Files.getLastModifiedTime(it).toMillis() }.reversed())
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
     * V1 parity: deposit_file_serve_api (api.py:968-1010)
     *
     * Returns null if file doesn't exist or path traversal detected.
     * Security: filename must start with paymentNo (V1: api.py:984).
     */
    fun resolveFilePath(paymentNo: String, filename: String): Path? {
        // Security: filename must start with pmt_no (V1: api.py:984)
        if (!filename.startsWith(paymentNo)) return null

        val year = parseYear(paymentNo)
        val filePath = baseDir.resolve(year).resolve(paymentNo).resolve(filename)

        // Security: prevent path traversal (V1: api.py:1054)
        if (".." in filePath.toString()) return null
        if (!filePath.toAbsolutePath().startsWith(baseDir.toAbsolutePath())) return null
        if (!Files.exists(filePath)) return null

        return filePath
    }

    /**
     * Save an uploaded file with versioning.
     * V1 parity: deposit_receipt_upload_api (api.py:722-784)
     *
     * File naming: {pmt_no}_V{##}.{ext} — V1 uses _V prefix
     *
     * @return the saved filename
     */
    fun saveFile(paymentNo: String, originalFilename: String, bytes: ByteArray): String {
        val year = parseYear(paymentNo)
        val dir = baseDir.resolve(year).resolve(paymentNo)
        Files.createDirectories(dir)

        // Get file extension and validate (V1: api.py:757-759)
        val ext = if ("." in originalFilename) ".${originalFilename.substringAfterLast(".").lowercase()}" else ""
        if (ext.isNotEmpty() && ext !in allowedExtensions) {
            throw IllegalArgumentException("finance.errors.unsupportedFileFormat")
        }

        // Find next version number (V1: api.py:762-769)
        val existingVersions = mutableListOf<Int>()
        if (Files.exists(dir)) {
            Files.list(dir).filter { Files.isRegularFile(it) }.forEach { f ->
                val name = f.fileName.toString()
                val vMatch = Regex("_V(\\d+)").find(name)
                if (vMatch != null) {
                    try {
                        existingVersions.add(vMatch.groupValues[1].toInt())
                    } catch (_: Exception) {}
                }
            }
        }

        val nextVersion = (existingVersions.maxOrNull() ?: 0) + 1
        val filename = "${paymentNo}_V${String.format("%02d", nextVersion)}${ext}"
        val filePath = dir.resolve(filename)

        Files.write(filePath, bytes)
        return filename
    }

    /**
     * Delete a file.
     * V1 parity: deposit_file_delete_api (api.py:1013-1069)
     */
    fun deleteFile(paymentNo: String, filename: String): Boolean {
        val path = resolveFilePath(paymentNo, filename) ?: return false
        Files.deleteIfExists(path)
        return true
    }

    /**
     * Check if a payment has any files.
     */
    fun hasFiles(paymentNo: String): Boolean {
        val year = parseYear(paymentNo)
        val dir = baseDir.resolve(year).resolve(paymentNo)
        if (!Files.exists(dir)) return false
        return Files.list(dir).anyMatch {
            Files.isRegularFile(it) && it.fileName.toString().startsWith(paymentNo)
        }
    }

    /**
     * Parse year from pmt_no.
     * V1 parity: api.py:748 — pmt_no format: DPMT_YYYYMMDD_N## (e.g. DPMT_20260109_N01)
     * Extract YYYY from the 5th-8th characters (after "DPMT_").
     */
    private fun parseYear(paymentNo: String): String {
        val match = Regex("DPMT_(\\d{4})\\d{4}_N\\d+").find(paymentNo)
        return match?.groupValues?.get(1) ?: java.time.Year.now().toString()
    }
}
