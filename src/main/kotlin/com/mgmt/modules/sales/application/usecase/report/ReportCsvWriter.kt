package com.mgmt.modules.sales.application.usecase.report

import org.slf4j.LoggerFactory
import java.io.BufferedWriter
import java.io.OutputStreamWriter
import java.math.BigDecimal
import java.math.RoundingMode
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption

/**
 * ReportCsvWriter — Atomic CSV writer with multi-table and footer support.
 *
 * V1 parity: DataProcessingService.save_csv_atomic() + ProfitAnalyzerBase.save_multi_table_csv()
 *
 * Features:
 * - Atomic write: tmp file → rename (prevents partial writes)
 * - User-isolated output directory
 * - Multi-table CSV (multiple named DataFrames in one file)
 * - Footer lines (report explanations)
 * - UTF-8 BOM for Excel compatibility
 */
class ReportCsvWriter(private val outputDir: Path) {

    private val log = LoggerFactory.getLogger(javaClass)

    init {
        if (!Files.exists(outputDir)) {
            Files.createDirectories(outputDir)
        }
    }

    /**
     * Save a single table to CSV.
     * V1 parity: save_csv_atomic()
     */
    fun saveCsv(
        headers: List<String>,
        rows: List<List<Any?>>,
        filename: String,
        footer: List<String>? = null
    ): String? {
        val savePath = outputDir.resolve(filename)
        val tmpPath = outputDir.resolve("$filename.tmp")

        return try {
            BufferedWriter(OutputStreamWriter(Files.newOutputStream(tmpPath), Charsets.UTF_8)).use { w ->
                // UTF-8 BOM
                w.write("\uFEFF")
                // Header
                w.write(headers.joinToString(",") { escapeCsv(it) })
                w.newLine()
                // Rows
                for (row in rows) {
                    w.write(row.joinToString(",") { escapeCsv(formatValue(it)) })
                    w.newLine()
                }
                // Footer
                if (!footer.isNullOrEmpty()) {
                    w.newLine()
                    for (line in footer) {
                        w.write(line)
                        w.newLine()
                    }
                }
            }
            Files.move(tmpPath, savePath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            log.info("💾 [${rows.size} ROWS] Exported: $filename")
            savePath.toString()
        } catch (e: Exception) {
            log.error("❌ Save Failed [$filename]: ${e.message}", e)
            try { Files.deleteIfExists(tmpPath) } catch (_: Exception) {}
            null
        }
    }

    /**
     * Save multiple named tables to a single CSV file.
     * V1 parity: save_multi_table_csv()
     */
    fun saveMultiTableCsv(
        filename: String,
        tables: List<Pair<String, CsvTable>>,
        footer: List<String>? = null
    ): String? {
        val savePath = outputDir.resolve(filename)
        val tmpPath = outputDir.resolve("$filename.tmp")

        return try {
            BufferedWriter(OutputStreamWriter(Files.newOutputStream(tmpPath), Charsets.UTF_8)).use { w ->
                w.write("\uFEFF")
                for ((name, table) in tables) {
                    w.write("=== $name ===")
                    w.newLine()
                    // Headers
                    w.write(table.headers.joinToString(",") { escapeCsv(it) })
                    w.newLine()
                    // Rows
                    for (row in table.rows) {
                        w.write(row.joinToString(",") { escapeCsv(formatValue(it)) })
                        w.newLine()
                    }
                    w.newLine()
                    w.newLine()
                }
                if (!footer.isNullOrEmpty()) {
                    w.newLine()
                    for (line in footer) {
                        w.write(line)
                        w.newLine()
                    }
                }
            }
            Files.move(tmpPath, savePath, StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE)
            log.info("💾 [MULTI-TABLE] Exported: $filename")
            savePath.toString()
        } catch (e: Exception) {
            log.error("❌ Save Failed [$filename]: ${e.message}", e)
            try { Files.deleteIfExists(tmpPath) } catch (_: Exception) {}
            null
        }
    }

    private fun escapeCsv(value: String): String {
        return if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            "\"${value.replace("\"", "\"\"")}\""
        } else {
            value
        }
    }

    private fun formatValue(value: Any?): String {
        return when (value) {
            null -> ""
            is BigDecimal -> value.setScale(2, RoundingMode.HALF_UP).toPlainString()
            is Double -> BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).toPlainString()
            is Float -> BigDecimal.valueOf(value.toDouble()).setScale(2, RoundingMode.HALF_UP).toPlainString()
            else -> value.toString()
        }
    }
}

/**
 * Simple table representation for CSV export.
 */
data class CsvTable(
    val headers: List<String>,
    val rows: List<List<Any?>>
)
