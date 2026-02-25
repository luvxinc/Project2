package com.mgmt.modules.sales.infrastructure.csv

import com.mgmt.modules.sales.domain.model.SkuCorrection
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Component

/**
 * EbayCSVParser — eBay Custom Label → SKU 解析引擎。
 *
 *   Pattern1: 单品 (P_Flag=1)
 *   Pattern2: 双品 (P_Flag=2)
 *   Complex:  兜底分割 (P_Flag=5)
 *
 * 不变量: 正则表达式和分割逻辑完全复刻 V1。
 */
@Component
class EbayCSVParser {

    private val log = LoggerFactory.getLogger(EbayCSVParser::class.java)

    // ── pat1 (single SKU) ──
    // ^(?:[A-Za-z]{1}[A-Za-z0-9]{0,2}\.)?(?P<SKU>[A-Za-z0-9\-_/]{7,})\.(?P<Quantity>\d{1,3})(?P<QuantityKey>\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$
    private val pat1 = Regex(
        """^(?:[A-Za-z][A-Za-z0-9]{0,2}\.)?([A-Za-z0-9\-_/]{7,})\.(\d{1,3})(\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$"""
    )

    // ── pat2 (dual SKU) ──
    // ^(?:[A-Za-z]{1}[A-Za-z0-9]{0,2}\.)?(?P<S1>[A-Za-z0-9/\-_]{7,})\.(?P<Q1>\d{1,3})(?P<K1>\+2K)?[\+\.](?P<S2>[A-Za-z0-9/\-_]{7,})\.(?P<Q2>\d{1,3})(?P<K2>\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$
    private val pat2 = Regex(
        """^(?:[A-Za-z][A-Za-z0-9]{0,2}\.)?([A-Za-z0-9/\-_]{7,})\.(\d{1,3})(\+2K)?[+.]([A-Za-z0-9/\-_]{7,})\.(\d{1,3})(\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$"""
    )

    private val prefixPattern = Regex("""^(?:[A-Za-z][A-Za-z0-9]{0,2}\.)?(.+?)(?:\.[A-Za-z0-9_]*)?$""")
    private val junkValues = setOf("--", "-", "N/A", "NULL", "NONE", "", "NAN")

    data class ParseResult(
        val flag: Int,        // 0=unparsed, 1=single, 2=dual, 5=complex
        val skus: List<String>,
        val quantities: List<String>,
        val key: Int = 0,     // +2K indicator
    )

    /**
     * Parse a Custom Label into SKU + Quantity pairs.
     *
     * @param customLabel the raw Custom Label string from eBay CSV
     * @param corrections map of (badSku → SkuCorrection) for fast-fix during complex parse
     * @param validSkus set of known valid SKUs for fast-fix validation
     */
    fun parse(
        customLabel: String?,
        corrections: Map<String, SkuCorrection> = emptyMap(),
        validSkus: Set<String> = emptySet(),
    ): ParseResult {
        if (customLabel.isNullOrBlank()) return ParseResult(0, emptyList(), emptyList())
        val label = customLabel.trim()

        // Stage 1: try Pattern1 first (single): parser.py tries pat1 before pat2
        pat1.matchEntire(label)?.let { m ->
            val sku = m.groupValues[1]
            val qty = m.groupValues[2]
            val key = if (m.groupValues[3].isNotEmpty()) 2 else 0
            return ParseResult(1, listOf(sku), listOf(qty), key)
        }

        // Stage 2: try Pattern2 (dual) — only for rows not matched by pat1
        pat2.matchEntire(label)?.let { m ->
            val s1 = m.groupValues[1]
            val q1 = m.groupValues[2]
            val k1 = if (m.groupValues[3].isNotEmpty()) 2 else 0
            val s2 = m.groupValues[4]
            val q2 = m.groupValues[5]
            val k2 = if (m.groupValues[6].isNotEmpty()) 2 else 0
            return ParseResult(2, listOf(s1, s2), listOf(q1, q2), k1 + k2)
        }

        // Stage 3: Complex fallback (split on '+')
        return parseComplex(label, corrections, validSkus)
    }

    /**
     * Strip optional prefix, split on '+', each segment split on '.' for code.qty
     */
    private fun parseComplex(
        label: String,
        corrections: Map<String, SkuCorrection>,
        validSkus: Set<String>,
    ): ParseResult {
        val mainPart = prefixPattern.matchEntire(label)?.groupValues?.get(1) ?: label

        val parts = mainPart.split("+")
        var pKey = 0
        val skus = mutableListOf<String>()
        val qtys = mutableListOf<String>()

        for (seg in parts) {
            val trimmed = seg.trim()
            if (trimmed.isEmpty() || trimmed.uppercase() in junkValues) continue
            if (trimmed.uppercase() == "2K") {
                pKey += 2
                continue
            }

            var segment = trimmed
            if ("+2K" in segment) {
                pKey += 2
                segment = segment.replace("+2K", "")
            }

            val arr = segment.split(".")
            var code = arr[0].uppercase().trim()
            val qty = if (arr.size > 1) arr[1] else "1"

            if (code.uppercase() in junkValues) continue

            // Fast-fix from correction memory
            if (validSkus.isNotEmpty() && code !in validSkus) {
                corrections[code]?.let { fix ->
                    code = fix.correctSku.uppercase()
                }
            }

            skus.add(code)
            qtys.add(qty)
        }

        return if (skus.isNotEmpty()) {
            val limit = minOf(skus.size, 10)
            ParseResult(5, skus.take(limit), qtys.take(limit), pKey)
        } else {
            ParseResult(0, emptyList(), emptyList())
        }
    }

    /**
     * Compute MD5 hash of all values joined with '|' separator.
     */
    fun computeRowHashFull(values: List<String>): String {
        val content = values.joinToString("|") { it.trim() }
        val md = java.security.MessageDigest.getInstance("MD5")
        return md.digest(content.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    /**
     * Compute MD5 hash of 7 business key columns for Earning dedup.
     * Keys: order_creation_date, order_number, item_id, item_title, buyer_name, custom_label, seller
     */
    fun computeEarningHash(vararg keyValues: String?): String {
        val content = keyValues.joinToString("|") { (it ?: "").trim() }
        val md = java.security.MessageDigest.getInstance("MD5")
        return md.digest(content.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
    }

    /**
     * Levenshtein distance for fuzzy SKU matching.
     */
    fun findSimilarSkus(target: String, validSkus: Set<String>, limit: Int = 5): List<String> {
        val upper = target.uppercase()
        // 1. Contains match
        val contains = validSkus.filter { upper in it }
        // 2. Levenshtein
        val fuzzy = validSkus
            .map { it to levenshteinRatio(upper, it) }
            .filter { it.second >= 0.4 }
            .sortedByDescending { it.second }
            .map { it.first }

        return (contains + fuzzy).distinct().take(limit).sorted()
    }

    private fun levenshteinRatio(s1: String, s2: String): Double {
        val maxLen = maxOf(s1.length, s2.length)
        if (maxLen == 0) return 1.0
        return 1.0 - levenshteinDistance(s1, s2).toDouble() / maxLen
    }

    private fun levenshteinDistance(s1: String, s2: String): Int {
        val dp = Array(s1.length + 1) { IntArray(s2.length + 1) }
        for (i in 0..s1.length) dp[i][0] = i
        for (j in 0..s2.length) dp[0][j] = j
        for (i in 1..s1.length) {
            for (j in 1..s2.length) {
                val cost = if (s1[i - 1] == s2[j - 1]) 0 else 1
                dp[i][j] = minOf(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
            }
        }
        return dp[s1.length][s2.length]
    }
}
