package com.mgmt.modules.backup.domain

import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * BackupInfo — Value object representing a backup file's metadata.
 *
 * V1 parity: DatabaseService.parse_filename_to_display()
 * V3 evolution: structured data instead of display string formatting.
 *
 * Filename convention: {yyyyMMdd_HHmmss}_{tag}.pgdump
 * Example: 20260224_201500_Monthly_Auto.pgdump
 */
data class BackupInfo(
    val filename: String,
    val backupTime: Instant,
    val tag: String,
    val sizeBytes: Long,
) {
    companion object {
        private val PACIFIC = ZoneId.of("America/Los_Angeles")
        private val DISPLAY_FORMATTER = DateTimeFormatter.ofPattern("yyyy MM dd")
            .withZone(PACIFIC)
        private val DETAIL_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss")
            .withZone(PACIFIC)
        private val FILENAME_DATE = DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss")
            .withZone(PACIFIC)

        /**
         * Parse a backup filename into BackupInfo.
         *
         * V1 parity: parse_filename_to_display()
         * Input:  20260224_201500_Monthly_Auto.pgdump
         * Output: BackupInfo(backupTime=..., tag="Monthly Auto")
         */
        fun fromFilename(filename: String, sizeBytes: Long): BackupInfo? {
            val clean = filename.removeSuffix(".pgdump")
            val parts = clean.split("_", limit = 3)
            if (parts.size < 2) return null

            val datePart = parts[0]   // 20260224
            val timePart = parts[1]   // 201500
            val tagPart = if (parts.size > 2) parts[2].replace("_", " ") else ""

            if (datePart.length != 8 || timePart.length != 6) return null
            if (!datePart.all { it.isDigit() } || !timePart.all { it.isDigit() }) return null

            return try {
                val dt = java.time.LocalDateTime.parse(
                    "${datePart}${timePart}",
                    java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmmss")
                )
                val instant = dt.atZone(PACIFIC).toInstant()
                BackupInfo(
                    filename = filename,
                    backupTime = instant,
                    tag = tagPart,
                    sizeBytes = sizeBytes,
                )
            } catch (_: Exception) { null }
        }

        /**
         * Generate a filename for a new backup.
         */
        fun generateFilename(tag: String): String {
            val now = Instant.now()
            val timestamp = FILENAME_DATE.format(now)
            val safeTag = tag.trim()
                .replace(Regex("[^a-zA-Z0-9\\u4e00-\\u9fff\\s_-]"), "")
                .replace("\\s+".toRegex(), "_")
            val tagPart = if (safeTag.isNotEmpty()) "_$safeTag" else ""
            return "${timestamp}${tagPart}.pgdump"
        }
    }

    /** Display formatted date for list view: "2026 02 24" */
    val displayDate: String get() = DISPLAY_FORMATTER.format(backupTime)

    /** Full detail date: "2026-02-24 20:15:00" */
    val detailDate: String get() = DETAIL_FORMATTER.format(backupTime)

    /** Human-readable file size */
    val displaySize: String
        get() = when {
            sizeBytes < 1024 -> "${sizeBytes} B"
            sizeBytes < 1024 * 1024 -> "${"%.1f".format(sizeBytes / 1024.0)} KB"
            else -> "${"%.1f".format(sizeBytes / (1024.0 * 1024.0))} MB"
        }
}
