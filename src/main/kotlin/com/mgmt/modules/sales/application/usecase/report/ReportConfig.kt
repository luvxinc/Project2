package com.mgmt.modules.sales.application.usecase.report

import java.math.BigDecimal
import java.time.LocalDate

/**
 * Report generation configuration — passed from Controller to all analyzers.
 *
 */
data class ReportConfig(
    val startDate: LocalDate,
    val endDate: LocalDate,
    val fileSuffix: String = "${startDate}_${endDate}",

    // Loss rates: settings.LOSS_RATES (settings.py L157)
    // V1 值: {"CASE": 0.6, "REQUEST": 0.5, "RETURN": 0.3, "DISPUTE": 1.0}
    val lrCase: Double = 0.6,
    val lrRequest: Double = 0.5,
    val lrReturn: Double = 0.3,
    val lrDispute: Double = 1.0,

    // Supply chain params — V3 强制要求 (与 V1 不同: V1 LEAD_MONTH=2.0)
    val leadTime: Double = 3.0,       // V3: 3 个月 (V1 was 2.0)
    val safetyStock: Double = 1.0,    // V3: 1 个月 (same as V1)

    // Output directory (resolved by controller)
    val outputDir: java.nio.file.Path? = null,
    val username: String = "system",
)

/**
 * Special SKU mapping — V1: SPECIAL_SOURCE_SKUS → SPECIAL_TARGET_SKU
 * When NU1C8E51C or NU1C8E51K is present, add NU1C8SKT7 × 2 units.
 */
object SpecialSkuRules {
    val SOURCE_SKUS = setOf("NU1C8E51C", "NU1C8E51K")
    const val TARGET_SKU = "NU1C8SKT7"
    const val TARGET_QTY = 2
}

/**
 * Result of a single analyzer run.
 */
data class AnalyzerResult(
    val name: String,
    val success: Boolean,
    val fileCount: Int = 0,
    val filenames: List<String> = emptyList(),
    val error: String? = null,
)
