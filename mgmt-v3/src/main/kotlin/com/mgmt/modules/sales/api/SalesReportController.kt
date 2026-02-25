package com.mgmt.modules.sales.api

import com.mgmt.common.logging.AuditLog
import com.mgmt.common.response.ApiResponse
import com.mgmt.common.security.RequirePermission
import com.mgmt.common.security.SecurityLevel
import com.mgmt.modules.sales.application.usecase.report.ReportGeneratorUseCase
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.ResponseEntity
import org.springframework.security.core.Authentication
import org.springframework.web.bind.annotation.*
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * SalesReportController — Report Center & Generator API.
 *
 * V1 parity: backend/apps/reports/views.py (602 lines)
 *
 * ⚠️ V3 变更: 报表生成 100% Kotlin 原生实现，不再调用 Python subprocess。
 *   所有 9 个分析器已用 Kotlin 重写并通过 ReportGeneratorUseCase 协调。
 *
 * Endpoints:
 *   GET  /sales/reports/files                  — List generated report files
 *   POST /sales/reports/generate               — Start report generation (native Kotlin)
 *   POST /sales/reports/clear                  — Clear all report files
 *   GET  /sales/reports/download/{filename}    — Download single file
 *   GET  /sales/reports/download-zip           — Download all as ZIP
 *   GET  /sales/reports/preview/{filename}     — Preview CSV file content
 *   POST /sales/reports/api/profit             — Generate SKU profit report
 */
@RestController
@RequestMapping("/sales/reports")
class SalesReportController(
    @Value("\${app.output-dir:output}") private val outputDirBase: String,
    private val reportGenerator: ReportGeneratorUseCase,
) {
    data class ReportFileDto(
        val name: String,
        val size: Long,
        val sizeDisplay: String,
        val modified: String,
        val fileType: String,
    )

    data class GenerateRequest(
        val startDate: String,
        val endDate: String,
        // V1 parity: settings.LOSS_RATES (settings.py L157)
        val lrCase: Double? = 0.6,
        val lrRequest: Double? = 0.5,
        val lrReturn: Double? = 0.3,
        val lrDispute: Double? = 1.0,
        val leadTime: Double? = 3.0,
        val safetyStock: Double? = 1.0,
    )

    data class GenerateResult(
        val success: Boolean,
        val successCount: Int,
        val totalTasks: Int,
        val fileCount: Int,
        val errors: List<String>,
    )

    data class PreviewTable(
        val title: String,
        val rows: Int,
        val columns: List<String>,
        val data: List<List<String>>,
    )

    data class ProfitReportRequest(
        val startDate: String? = null,
        val endDate: String? = null,
    )

    // ═══ Helpers ═══

    private fun getUserDir(username: String): Path {
        val sanitized = username.replace(Regex("[^a-zA-Z0-9_]"), "_").ifEmpty { "unknown" }
        val dir = Path.of(outputDirBase, sanitized)
        if (!Files.exists(dir)) Files.createDirectories(dir)
        return dir
    }

    private fun formatSize(bytes: Long): String = when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
        else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
    }

    private fun getUsername(auth: Authentication?): String {
        return auth?.name ?: "default"
    }

    private fun getFileType(filename: String): String {
        val ext = filename.substringAfterLast('.', "").lowercase()
        return when (ext) {
            "pdf" -> "pdf"
            "png", "jpg", "jpeg", "gif", "webp", "bmp" -> "image"
            "csv", "html", "htm", "xlsx", "xls" -> "table"
            else -> "table"
        }
    }

    private fun isValidFilename(filename: String): Boolean {
        if (".." in filename || "/" in filename || "\\" in filename) return false
        val ext = filename.substringAfterLast('.', "").lowercase()
        return ext in setOf("csv", "html", "htm", "xlsx", "xls", "pdf", "png", "jpg", "jpeg", "gif")
    }

    private fun parseAndValidateDate(dateStr: String): LocalDate? {
        return try {
            LocalDate.parse(dateStr, DateTimeFormatter.ISO_LOCAL_DATE)
        } catch (e: Exception) {
            null
        }
    }

    private fun listReportFiles(dir: Path): List<ReportFileDto> {
        val supportedExtensions = setOf("csv", "html", "htm", "xlsx", "xls", "pdf", "png", "jpg", "jpeg", "gif")
        return dir.toFile().listFiles()
            ?.filter { f ->
                f.isFile && f.name.substringAfterLast('.', "").lowercase() in supportedExtensions
            }
            ?.sortedByDescending { it.lastModified() }
            ?.map { f ->
                val modified = Instant.ofEpochMilli(f.lastModified())
                    .atZone(ZoneId.of("America/Los_Angeles"))
                    .format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm"))
                ReportFileDto(
                    name = f.name,
                    size = f.length(),
                    sizeDisplay = formatSize(f.length()),
                    modified = modified,
                    fileType = getFileType(f.name),
                )
            } ?: emptyList()
    }

    // ═══ List Files ═══

    @GetMapping("/files")
    @RequirePermission("module.sales.reports.center")
    fun listFiles(auth: Authentication?): ResponseEntity<Any> {
        val username = getUsername(auth)
        val dir = getUserDir(username)
        val files = listReportFiles(dir)
        return ResponseEntity.ok(ApiResponse.ok(files))
    }

    // ═══ Generate Reports (native Kotlin — no Python subprocess) ═══

    @PostMapping("/generate")
    @RequirePermission("module.sales.reports.generate")
    @SecurityLevel(level = "L2", actionKey = "btn_generate_report")
    @AuditLog(module = "SALES", action = "GENERATE_REPORT")
    fun generateReports(
        @RequestBody body: GenerateRequest,
        auth: Authentication?,
    ): ResponseEntity<Any> {
        val username = getUsername(auth)
        val dir = getUserDir(username)

        // ═══ Input Validation ═══
        val startDate = parseAndValidateDate(body.startDate)
            ?: return ResponseEntity.badRequest().body(
                ApiResponse.error<Any>("Invalid start date format. Use YYYY-MM-DD.")
            )
        val endDate = parseAndValidateDate(body.endDate)
            ?: return ResponseEntity.badRequest().body(
                ApiResponse.error<Any>("Invalid end date format. Use YYYY-MM-DD.")
            )
        if (startDate.isAfter(endDate)) {
            return ResponseEntity.badRequest().body(
                ApiResponse.error<Any>("Start date must be before end date.")
            )
        }

        // Clear existing files
        dir.toFile().listFiles()?.forEach { it.delete() }

        // ═══ V3: Native Kotlin report generation ═══
        try {
            val results = reportGenerator.generateAll(
                startDate = body.startDate,
                endDate = body.endDate,
                username = username,
                outputDir = dir,
                lrCase = body.lrCase,
                lrRequest = body.lrRequest,
                lrReturn = body.lrReturn,
                lrDispute = body.lrDispute,
                leadTime = body.leadTime,
                safetyStock = body.safetyStock,
            )

            val successCount = results.count { it.success }
            val fileCount = results.sumOf { it.fileCount }
            val errors = results.filter { !it.success && it.error != null }.map { "${it.name}: ${it.error}" }

            return ResponseEntity.ok(ApiResponse.ok(GenerateResult(
                success = errors.isEmpty(),
                successCount = successCount,
                totalTasks = 9,
                fileCount = fileCount,
                errors = errors,
            )))
        } catch (e: Exception) {
            return ResponseEntity.ok(ApiResponse.ok(GenerateResult(
                success = false,
                successCount = 0,
                totalTasks = 9,
                fileCount = 0,
                errors = listOf("Report generation failed: ${e.message}"),
            )))
        }
    }

    // ═══ Clear Files ═══

    @PostMapping("/clear")
    @RequirePermission("module.sales.reports.center")
    @AuditLog(module = "SALES", action = "CLEAR_REPORTS")
    fun clearFiles(auth: Authentication?): ResponseEntity<Any> {
        val username = getUsername(auth)
        val dir = getUserDir(username)
        val fileCount = dir.toFile().listFiles()?.count { it.isFile } ?: 0
        dir.toFile().listFiles()?.forEach { it.delete() }
        return ResponseEntity.ok(ApiResponse.ok(mapOf("cleared" to true, "deletedCount" to fileCount)))
    }

    // ═══ Download Single File ═══

    @GetMapping("/download/{filename}")
    @RequirePermission("module.sales.reports.center")
    @AuditLog(module = "SALES", action = "DOWNLOAD_REPORT")
    fun downloadFile(
        @PathVariable filename: String,
        auth: Authentication?,
    ): ResponseEntity<Any> {
        if (!isValidFilename(filename)) {
            return ResponseEntity.badRequest().body(ApiResponse.error<Any>("Invalid filename"))
        }

        val username = getUsername(auth)
        val file = getUserDir(username).resolve(filename).toFile()

        if (!file.exists()) {
            return ResponseEntity.notFound().build()
        }

        val contentType = when (getFileType(filename)) {
            "pdf" -> "application/pdf"
            "image" -> {
                val ext = filename.substringAfterLast('.', "").lowercase()
                when (ext) {
                    "png" -> "image/png"
                    "jpg", "jpeg" -> "image/jpeg"
                    "gif" -> "image/gif"
                    else -> "application/octet-stream"
                }
            }
            else -> when (filename.substringAfterLast('.', "").lowercase()) {
                "csv" -> "text/csv"
                "html", "htm" -> "text/html"
                "xlsx" -> "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                "xls" -> "application/vnd.ms-excel"
                else -> "application/octet-stream"
            }
        }

        val resource = org.springframework.core.io.FileSystemResource(file)
        return ResponseEntity.ok()
            .header("Content-Disposition", "attachment; filename=\"${file.name}\"")
            .header("Content-Type", contentType)
            .body(resource as Any)
    }

    // ═══ Download ZIP ═══

    @GetMapping("/download-zip")
    @RequirePermission("module.sales.reports.center")
    @AuditLog(module = "SALES", action = "DOWNLOAD_REPORT_ZIP")
    fun downloadZip(auth: Authentication?): ResponseEntity<ByteArray> {
        val username = getUsername(auth)
        val dir = getUserDir(username)
        val files = dir.toFile().listFiles()?.filter { it.isFile } ?: emptyList()

        val baos = java.io.ByteArrayOutputStream()
        java.util.zip.ZipOutputStream(baos).use { zos ->
            for (file in files) {
                zos.putNextEntry(java.util.zip.ZipEntry(file.name))
                file.inputStream().use { it.copyTo(zos) }
                zos.closeEntry()
            }
        }

        val timestamp = java.time.LocalDateTime.now(ZoneId.of("America/Los_Angeles"))
            .format(DateTimeFormatter.ofPattern("yyyyMMdd_HHmm"))

        return ResponseEntity.ok()
            .header("Content-Disposition", "attachment; filename=\"Reports_All_${timestamp}.zip\"")
            .header("Content-Type", "application/zip")
            .body(baos.toByteArray())
    }

    // ═══ Preview CSV File ═══

    @GetMapping("/preview/{filename}")
    @RequirePermission("module.sales.reports.center")
    @AuditLog(module = "SALES", action = "VIEW_REPORT")
    fun previewFile(
        @PathVariable filename: String,
        auth: Authentication?,
    ): ResponseEntity<Any> {
        if (!isValidFilename(filename)) {
            return ResponseEntity.badRequest().body(ApiResponse.error<Any>("Invalid filename"))
        }

        val username = getUsername(auth)
        val file = getUserDir(username).resolve(filename).toFile()

        if (!file.exists()) {
            return ResponseEntity.notFound().build()
        }

        val fileType = getFileType(filename)

        if (fileType != "table") {
            return ResponseEntity.ok(ApiResponse.ok(mapOf(
                "fileType" to fileType,
                "filename" to filename,
                "previewAvailable" to false,
                "message" to "Preview not available for $fileType files. Use download instead.",
            )))
        }

        val tables = mutableListOf<PreviewTable>()
        try {
            val ext = filename.substringAfterLast('.', "").lowercase()
            if (ext == "csv") {
                val lines = file.readLines()
                if (lines.isNotEmpty()) {
                    val headers = lines.first().split(",").map { it.trim().removeSurrounding("\"") }
                    val dataRows = lines.drop(1).take(100).map { line ->
                        line.split(",").map { it.trim().removeSurrounding("\"") }
                    }
                    tables.add(PreviewTable(
                        title = filename.removeSuffix(".csv"),
                        rows = lines.size - 1,
                        columns = headers,
                        data = dataRows,
                    ))
                }
            }
        } catch (e: Exception) {
            return ResponseEntity.ok(ApiResponse.ok(mapOf(
                "fileType" to fileType,
                "filename" to filename,
                "previewAvailable" to false,
                "message" to "Failed to parse file: ${e.message}",
            )))
        }

        return ResponseEntity.ok(ApiResponse.ok(mapOf(
            "fileType" to fileType,
            "filename" to filename,
            "previewAvailable" to true,
            "tables" to tables,
        )))
    }

    // ═══ REST API: Generate SKU Profit Report ═══

    @PostMapping("/api/profit")
    @RequirePermission("module.sales.reports.generate")
    @AuditLog(module = "SALES", action = "GENERATE_PROFIT_REPORT")
    fun generateProfitReport(
        @RequestBody body: ProfitReportRequest,
        auth: Authentication?,
    ): ResponseEntity<Any> {
        val username = getUsername(auth)

        val today = LocalDate.now(ZoneId.of("America/Los_Angeles"))
        val firstCurr = today.withDayOfMonth(1)
        val lastPrev = firstCurr.minusDays(1)
        val firstPrev = lastPrev.withDayOfMonth(1)

        val startDate = if (body.startDate != null) parseAndValidateDate(body.startDate) else firstPrev
        val endDate = if (body.endDate != null) parseAndValidateDate(body.endDate) else lastPrev

        if (startDate == null || endDate == null) {
            return ResponseEntity.badRequest().body(
                ApiResponse.error<Any>("Invalid date format. Use YYYY-MM-DD.")
            )
        }

        if (startDate.isAfter(endDate)) {
            return ResponseEntity.badRequest().body(
                ApiResponse.error<Any>("Start date must be before end date.")
            )
        }

        val dir = getUserDir(username)
        dir.toFile().listFiles()?.forEach { it.delete() }

        // ═══ V3: Native Kotlin — no Python subprocess ═══
        try {
            val results = reportGenerator.generateAll(
                startDate = startDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                endDate = endDate.format(DateTimeFormatter.ISO_LOCAL_DATE),
                username = username,
            )

            val successCount = results.count { it.success }
            val allFiles = results.flatMap { it.filenames }

            if (allFiles.isEmpty()) {
                return ResponseEntity.ok(ApiResponse.ok(mapOf(
                    "status" to "warning",
                    "message" to "Analysis completed but no files were generated (No Data?).",
                )))
            }

            return ResponseEntity.ok(ApiResponse.ok(mapOf(
                "status" to "success",
                "message" to "Report generated successfully ($successCount/9 analyzers).",
                "data" to mapOf(
                    "files" to allFiles,
                    "range" to "$startDate to $endDate",
                ),
            )))
        } catch (e: Exception) {
            return ResponseEntity.internalServerError().body(
                ApiResponse.error<Any>("Analysis Engine Error: ${e.message}")
            )
        }
    }
}
