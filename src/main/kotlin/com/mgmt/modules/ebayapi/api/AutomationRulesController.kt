package com.mgmt.modules.ebayapi.api

import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.web.bind.annotation.*

/**
 * AutomationRulesController — CRUD for automation rules
 * Covers: Restock, Reprice, Ads, Offer Auto-Reply decision tree + leaf strategies
 */
@RestController
@RequestMapping("/automation")
class AutomationRulesController(
    private val jdbc: JdbcTemplate,
) {
    private val log = LoggerFactory.getLogger(javaClass)

    // ══════════════════════════════════════════════════
    // GET /api/v1/automation/rules — Load all rules + tree + strategies
    // ══════════════════════════════════════════════════
    @GetMapping("/rules")
    fun getRules(): ResponseEntity<Map<String, Any>> {
        val rules = jdbc.queryForList(
            "SELECT module, rule_key, rule_value FROM automation_rules ORDER BY module, rule_key"
        )
        val tree = jdbc.queryForList(
            "SELECT id, category_group, level, decision_key, enabled FROM offer_reply_tree ORDER BY category_group, level"
        )
        val strategies = jdbc.queryForList(
            """SELECT id, category_group, path_key, qty_min, qty_max, 
                      discount_type, discount_value, enabled
               FROM offer_reply_strategy 
               ORDER BY category_group, path_key, qty_min"""
        )
        return ResponseEntity.ok(mapOf("rules" to rules, "tree" to tree, "strategies" to strategies))
    }

    // ══════════════════════════════════════════════════
    // PUT /api/v1/automation/rules — Save all rules + tree toggles
    // ══════════════════════════════════════════════════
    @PutMapping("/rules")
    fun saveRules(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        var rulesUpdated = 0
        var treeUpdated = 0

        @Suppress("UNCHECKED_CAST")
        val rulesMap = body["rules"] as? Map<String, String> ?: emptyMap()
        for ((key, value) in rulesMap) {
            val parts = key.split(".", limit = 2)
            if (parts.size != 2) continue
            val (module, ruleKey) = parts
            rulesUpdated += jdbc.update(
                """INSERT INTO automation_rules (module, rule_key, rule_value, updated_at)
                   VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                   ON CONFLICT (module, rule_key) DO UPDATE
                   SET rule_value = EXCLUDED.rule_value, updated_at = CURRENT_TIMESTAMP""",
                module, ruleKey, value
            )
        }

        @Suppress("UNCHECKED_CAST")
        val treeList = body["tree"] as? List<Map<String, Any>> ?: emptyList()
        for (node in treeList) {
            val id = (node["id"] as? Number)?.toLong() ?: continue
            val enabled = node["enabled"] as? Boolean ?: false
            treeUpdated += jdbc.update(
                "UPDATE offer_reply_tree SET enabled = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                enabled, id
            )
        }

        log.info("[OK] Automation rules saved: {} rules, {} tree nodes", rulesUpdated, treeUpdated)
        return ResponseEntity.ok(mapOf("rulesUpdated" to rulesUpdated, "treeUpdated" to treeUpdated))
    }

    // ══════════════════════════════════════════════════
    // PUT /api/v1/automation/strategies — Upsert a leaf strategy tier
    // ══════════════════════════════════════════════════
    @PutMapping("/strategies")
    fun upsertStrategy(@RequestBody body: Map<String, Any?>): ResponseEntity<Map<String, Any>> {
        val categoryGroup = body["category_group"] as? String ?: return ResponseEntity.badRequest().build()
        val pathKey = body["path_key"] as? String ?: return ResponseEntity.badRequest().build()
        val qtyMin = (body["qty_min"] as? Number)?.toInt() ?: 1
        val qtyMax = (body["qty_max"] as? Number)?.toInt()
        val discountType = body["discount_type"] as? String ?: "AMOUNT"
        val discountValue = (body["discount_value"] as? Number)?.toDouble() ?: 0.0
        val id = (body["id"] as? Number)?.toLong()

        if (id != null && id > 0) {
            jdbc.update(
                """UPDATE offer_reply_strategy 
                   SET path_key = ?, qty_min = ?, qty_max = ?, discount_type = ?, discount_value = ?, 
                       updated_at = CURRENT_TIMESTAMP
                   WHERE id = ?""",
                pathKey, qtyMin, qtyMax, discountType, discountValue, id
            )
            return ResponseEntity.ok(mapOf("id" to id, "action" to "updated"))
        } else {
            val newId = jdbc.queryForObject(
                """INSERT INTO offer_reply_strategy 
                   (category_group, path_key, qty_min, qty_max, discount_type, discount_value)
                   VALUES (?, ?, ?, ?, ?, ?) RETURNING id""",
                Long::class.java,
                categoryGroup, pathKey, qtyMin, qtyMax, discountType, discountValue
            )
            return ResponseEntity.ok(mapOf("id" to (newId ?: 0), "action" to "created"))
        }
    }

    // ══════════════════════════════════════════════════
    // DELETE /api/v1/automation/strategies/{id}
    // ══════════════════════════════════════════════════
    @DeleteMapping("/strategies/{id}")
    fun deleteStrategy(@PathVariable id: Long): ResponseEntity<Map<String, Any>> {
        val deleted = jdbc.update("DELETE FROM offer_reply_strategy WHERE id = ?", id)
        return ResponseEntity.ok(mapOf("deleted" to deleted))
    }

    // ══════════════════════════════════════════════════
    // GET /api/v1/automation/sku-meta
    // ══════════════════════════════════════════════════
    @GetMapping("/sku-meta")
    fun getSkuMeta(): ResponseEntity<Map<String, Any>> {
        val adapterThicknesses = jdbc.queryForList(
            "SELECT DISTINCT RIGHT(sku, 2) AS val FROM products WHERE category = 'Wheel Adapter' AND RIGHT(sku, 2) ~ '^[0-9]+$' ORDER BY val",
            String::class.java
        )
        val adapterLugs = jdbc.queryForList(
            "SELECT DISTINCT LEFT(sku, 1) AS val FROM products WHERE category = 'Wheel Adapter' AND LEFT(sku, 1) ~ '^[0-9]$' ORDER BY val",
            String::class.java
        )
        val spacerThicknesses = jdbc.queryForList(
            "SELECT DISTINCT RIGHT(sku, 2) AS val FROM products WHERE category = 'Wheel Spacer' AND RIGHT(sku, 2) ~ '^[0-9]+$' ORDER BY val",
            String::class.java
        )
        return ResponseEntity.ok(mapOf(
            "adapterThicknesses" to adapterThicknesses,
            "adapterLugs" to adapterLugs,
            "spacerThicknesses" to spacerThicknesses,
        ))
    }

    // ══════════════════════════════════════════════════
    // GET /api/v1/automation/sku-categories
    // Returns SKU → category_group mapping for offer auto-reply
    // ══════════════════════════════════════════════════
    @GetMapping("/sku-categories")
    fun getSkuCategories(): ResponseEntity<Map<String, Any>> {
        val rows = jdbc.queryForList(
            "SELECT UPPER(sku) AS sku, category FROM products WHERE sku IS NOT NULL"
        )
        val map = mutableMapOf<String, String>()
        for (row in rows) {
            val sku = row["sku"] as? String ?: continue
            val cat = row["category"] as? String ?: continue
            val group = when (cat) {
                "Wheel Adapter" -> "WHEEL_ADAPTER"
                "Wheel Spacer" -> "WHEEL_SPACER"
                else -> "OTHER"
            }
            map[sku] = group
        }
        return ResponseEntity.ok(mapOf("skuCategories" to map))
    }

    // ══════════════════════════════════════════════════
    // POST /api/v1/automation/dry-run
    // Simulate auto-reply for mock offer data. NO eBay API calls.
    // Input: { "offers": [{ "sku": "5100/5425-5450B32", "buyItNowPrice": 100, "offerPrice": 85, "quantity": 1 }] }
    // ══════════════════════════════════════════════════
    @PostMapping("/dry-run")
    fun dryRunAutoReply(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        @Suppress("UNCHECKED_CAST")
        val offers = body["offers"] as? List<Map<String, Any>> ?: return ResponseEntity.badRequest().body(mapOf("error" to "Missing 'offers' array"))

        // Load decision tree
        val tree = jdbc.queryForList(
            "SELECT category_group, decision_key, enabled FROM offer_reply_tree WHERE enabled = true ORDER BY category_group, level"
        )
        // Load strategies
        val strategies = jdbc.queryForList(
            """SELECT category_group, path_key, qty_min, qty_max, discount_type, discount_value
               FROM offer_reply_strategy WHERE enabled = true 
               ORDER BY category_group, path_key, qty_min"""
        )
        // SKU → category
        val skuCatRows = jdbc.queryForList("SELECT UPPER(sku) AS sku, category FROM products WHERE sku IS NOT NULL")
        val skuCatMap = mutableMapOf<String, String>()
        for (r in skuCatRows) {
            val sku = r["sku"] as? String ?: continue
            val cat = r["category"] as? String ?: continue
            skuCatMap[sku] = when (cat) {
                "Wheel Adapter" -> "WHEEL_ADAPTER"
                "Wheel Spacer" -> "WHEEL_SPACER"
                else -> "OTHER"
            }
        }

        val results = mutableListOf<Map<String, Any?>>()
        for (offer in offers) {
            val rawSku = (offer["sku"] as? String)?.uppercase() ?: ""
            val buyNow = (offer["buyItNowPrice"] as? Number)?.toDouble() ?: 0.0
            val offerPrice = (offer["offerPrice"] as? Number)?.toDouble() ?: 0.0
            val qty = (offer["quantity"] as? Number)?.toInt() ?: 1

            // 1. Determine category
            var categoryGroup = "OTHER"
            for ((sku, group) in skuCatMap) {
                if (rawSku.startsWith(sku) || sku.startsWith(rawSku)) {
                    categoryGroup = group
                    break
                }
            }

            // 2. Parse SKU dimensions
            val lug = if (rawSku.isNotEmpty()) rawSku[0].toString() else ""
            val thickness = if (rawSku.length >= 2) rawSku.takeLast(2) else ""

            // 3. Build path_key from enabled tree dimensions
            val enabledDims = tree.filter { it["category_group"] == categoryGroup }
            val pathParts = mutableListOf<String>()
            for (dim in enabledDims) {
                when (dim["decision_key"]) {
                    "by_lug" -> pathParts.add("lug:$lug")
                    "by_thickness" -> pathParts.add("thickness:$thickness")
                    "by_piece_count" -> pathParts.add("piece_count:4") // default
                }
            }
            val pathKey = if (pathParts.isNotEmpty()) pathParts.joinToString("|") else "*"

            // 4. Find matching strategy
            var matched = strategies.filter {
                it["category_group"] == categoryGroup &&
                it["path_key"] == pathKey &&
                (it["qty_min"] as? Number)?.toInt()?.let { min -> qty >= min } ?: true &&
                ((it["qty_max"] as? Number)?.toInt()?.let { max -> qty <= max } ?: true)
            }
            if (matched.isEmpty()) {
                // Fallback to universal (*)
                matched = strategies.filter {
                    it["category_group"] == categoryGroup &&
                    it["path_key"] == "*" &&
                    (it["qty_min"] as? Number)?.toInt()?.let { min -> qty >= min } ?: true &&
                    ((it["qty_max"] as? Number)?.toInt()?.let { max -> qty <= max } ?: true)
                }
            }

            // 5. Compute action
            if (matched.isEmpty() || buyNow <= 0) {
                results.add(mapOf(
                    "sku" to rawSku, "categoryGroup" to categoryGroup, "pathKey" to pathKey,
                    "buyItNowPrice" to buyNow, "offerPrice" to offerPrice, "quantity" to qty,
                    "action" to "Decline", "reason" to "no matching strategy",
                    "matchedStrategy" to null
                ))
                continue
            }

            val strat = matched[0]
            val discountType = strat["discount_type"] as String
            val discountValue = (strat["discount_value"] as Number).toDouble()
            val rawCounterPrice = if (discountType == "PERCENT") {
                buyNow * (1 - discountValue / 100)
            } else {
                buyNow - discountValue
            }.let { Math.max(0.0, Math.round(it * 100) / 100.0) }

            val action = if (offerPrice >= rawCounterPrice) "Accept" else "Counter"
            // Normalize counter offer to .99 pricing (e.g. $31.48 → $30.99)
            val counterPrice = if (action == "Counter") {
                Math.max(0.99, Math.floor(rawCounterPrice) - 0.01)
            } else rawCounterPrice

            results.add(mapOf(
                "sku" to rawSku, "categoryGroup" to categoryGroup, "pathKey" to pathKey,
                "buyItNowPrice" to buyNow, "offerPrice" to offerPrice, "quantity" to qty,
                "counterPrice" to counterPrice, "action" to action,
                "matchedStrategy" to mapOf(
                    "discount_type" to discountType,
                    "discount_value" to discountValue,
                    "qty_min" to strat["qty_min"],
                    "qty_max" to strat["qty_max"],
                    "path_key" to strat["path_key"],
                ),
                "reason" to if (action == "Accept") "offerPrice($offerPrice) >= counterPrice($counterPrice)" else "offerPrice($offerPrice) < counterPrice($counterPrice)"
            ))
        }

        return ResponseEntity.ok(mapOf(
            "dryRun" to true,
            "totalOffers" to results.size,
            "accept" to results.count { it["action"] == "Accept" },
            "counter" to results.count { it["action"] == "Counter" },
            "decline" to results.count { it["action"] == "Decline" },
            "results" to results,
        ))
    }

    // ══════════════════════════════════════════════════
    // GET /api/v1/automation/auto-ops — Get auto-ops toggle status
    // ══════════════════════════════════════════════════
    @GetMapping("/auto-ops")
    fun getAutoOps(): ResponseEntity<Map<String, Any>> {
        val enabled = try {
            val value = jdbc.queryForObject(
                "SELECT rule_value FROM automation_rules WHERE module = 'SYSTEM' AND rule_key = 'auto_ops_enabled'",
                String::class.java,
            )
            value?.lowercase() == "true"
        } catch (_: Exception) { false }
        return ResponseEntity.ok(mapOf("enabled" to enabled))
    }

    // ══════════════════════════════════════════════════
    // PUT /api/v1/automation/auto-ops — Toggle auto-ops on/off
    // ══════════════════════════════════════════════════
    @PutMapping("/auto-ops")
    fun setAutoOps(@RequestBody body: Map<String, Any>): ResponseEntity<Map<String, Any>> {
        val enabled = body["enabled"] as? Boolean ?: false
        jdbc.update(
            """INSERT INTO automation_rules (module, rule_key, rule_value, updated_at)
               VALUES ('SYSTEM', 'auto_ops_enabled', ?, CURRENT_TIMESTAMP)
               ON CONFLICT (module, rule_key) DO UPDATE
               SET rule_value = EXCLUDED.rule_value, updated_at = CURRENT_TIMESTAMP""",
            enabled.toString()
        )
        log.info("[AutoOps] Auto-ops toggled: enabled={}", enabled)
        return ResponseEntity.ok(mapOf("enabled" to enabled))
    }
}
