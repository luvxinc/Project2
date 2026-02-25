package com.mgmt.modules.sales.application.usecase.report

import com.mgmt.modules.sales.domain.model.CleanedTransaction
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import org.springframework.stereotype.Repository
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

/**
 * ReportDataRepository — Read-only data access for report analyzers.
 *
 * V1 parity:
 *   - ETLRepository.get_transactions_by_date()  → findTransactionsByDateRange()
 *   - InventoryRepository.get_all_cogs()         → findAllCogs()
 *   - InventoryRepository.get_fifo_avg_cost()     → findFifoAvgCost()
 *   - InventoryRepository.get_inventory_latest()  → findLatestInventory()
 *
 * All queries use native SQL via EntityManager for performance
 * (report queries can return 10k+ rows, avoid JPA N+1).
 */
@Repository
class ReportDataRepository {

    @PersistenceContext
    private lateinit var em: EntityManager

    // ═══════════════════════════════════════════════════════
    // Transaction Queries
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: ETLRepository.get_transactions_by_date()
     *   → SELECT * FROM Data_Clean_Log WHERE `order date` BETWEEN :start AND :end
     */
    fun findTransactionsByDateRange(startDate: LocalDate, endDate: LocalDate): List<CleanedTransaction> {
        val start = startDate.atStartOfDay().toInstant(ZoneOffset.UTC)
        val end = endDate.plusDays(1).atStartOfDay().toInstant(ZoneOffset.UTC)
        return em.createQuery(
            "SELECT c FROM CleanedTransaction c WHERE c.orderDate >= :start AND c.orderDate < :end",
            CleanedTransaction::class.java
        ).setParameter("start", start)
         .setParameter("end", end)
         .resultList
    }

    // ═══════════════════════════════════════════════════════
    // Cost Queries (FIFO + COGS)
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: ProfitAnalyzerBase._load_basics() → FIFO landed_price
     *
     * Returns: Map<SKU, avgLandedCost>
     * V1 SQL: SELECT f.sku, SUM(f.qty_remaining * COALESCE(p.landed_price_usd, f.unit_cost)) / SUM(f.qty_remaining)
     *         FROM in_dynamic_fifo_layers f LEFT JOIN in_dynamic_landed_price p ...
     *         WHERE f.qty_remaining > 0 GROUP BY f.sku
     *
     * V3: fifo_layers table has landed_cost column (merged from V1's two tables)
     */
    fun findFifoAvgCost(): Map<String, BigDecimal> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT sku,
                   CASE WHEN SUM(qty_remaining) > 0
                        THEN SUM(qty_remaining * COALESCE(landed_cost, unit_cost)) / SUM(qty_remaining)
                        ELSE 0 END as avg_cost
            FROM fifo_layers
            WHERE qty_remaining > 0
            GROUP BY sku
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            val cost = (row[1] as Number).toDouble().toBigDecimal()
            sku to cost
        }
    }

    /**
     * V1 parity: InventoryRepository.get_all_cogs() → SELECT * FROM Data_COGS
     *
     * V3: products table has sku + cog columns.
     * Returns: Map<SKU, cog>
     */
    fun findAllCogs(): Map<String, BigDecimal> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT sku, COALESCE(cogs, 0) FROM products WHERE sku IS NOT NULL
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            val cog = (row[1] as Number).toDouble().toBigDecimal()
            sku to cog
        }
    }

    /**
     * Build the merged cost map: FIFO first, COGS fallback.
     *
     * V1 parity: ProfitAnalyzerBase._load_basics() L140-155
     *   "FIFO优先, DATA_COGS 回退"
     */
    fun buildSkuCostMap(): Map<String, BigDecimal> {
        val fifoCosts = findFifoAvgCost()
        val cogsCosts = findAllCogs()
        val merged = mutableMapOf<String, BigDecimal>()

        for (sku in fifoCosts.keys + cogsCosts.keys) {
            val fifoCost = fifoCosts[sku]
            if (fifoCost != null && fifoCost > BigDecimal.ZERO) {
                merged[sku] = fifoCost
            } else {
                val cogsCost = cogsCosts[sku]
                if (cogsCost != null) {
                    merged[sku] = cogsCost
                }
            }
        }
        return merged
    }

    // ═══════════════════════════════════════════════════════
    // Inventory Queries
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: InventoryRepository.get_inventory_latest()
     *
     * V3: inventory_transactions → compute current stock per SKU.
     *     SUM(qty where action='in') - SUM(qty where action='out')
     */
    fun findCurrentInventory(): Map<String, Int> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT sku,
                   SUM(CASE WHEN action = 'in' THEN quantity ELSE -quantity END) as qty
            FROM fifo_transactions
            GROUP BY sku
            HAVING SUM(CASE WHEN action = 'in' THEN quantity ELSE -quantity END) > 0
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            val qty = (row[1] as Number).toInt()
            sku to qty
        }
    }

    // ═══════════════════════════════════════════════════════
    // Inventory Snapshot Queries
    // ═══════════════════════════════════════════════════════

    data class ProductMeta(val sku: String, val category: String?)

    /**
     * V1 parity: inventory_snapshot.py L31-32
     * SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU
     */
    fun findAllProductsMeta(): List<ProductMeta> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT sku, category FROM products WHERE sku IS NOT NULL ORDER BY sku
        """).resultList as List<Array<Any?>>

        return rows.map { row ->
            ProductMeta(
                sku = (row[0] as String).trim().uppercase(),
                category = row[1] as? String,
            )
        }
    }

    data class FifoInventoryRow(val qty: Int, val value: BigDecimal)

    /**
     * V1 parity: inventory_snapshot.py L46-80
     * FIFO理论库存数量和价值
     */
    fun findFifoInventoryData(): Map<String, FifoInventoryRow> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT sku,
                   SUM(qty_remaining) as qty,
                   SUM(qty_remaining * COALESCE(landed_cost, unit_cost)) as value
            FROM fifo_layers
            WHERE qty_remaining > 0
            GROUP BY sku
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            FifoInventoryRow(
                qty = (row[1] as Number).toInt(),
                value = (row[2] as Number).toDouble().toBigDecimal(),
            ) .let { sku to it }
        }
    }

    data class SupplyChainRow(
        val orderQty: Int = 0,
        val orderValue: BigDecimal = BigDecimal.ZERO,
        val transitQty: Int = 0,
        val transitValue: BigDecimal = BigDecimal.ZERO,
    )

    /**
     * V1 parity: inventory_snapshot.py L82-220
     * 下订数 = PO qty - Shipped qty
     * 在途数 = Shipped qty - Received qty
     *
     * V3 tables:
     *   purchase_order_items (po_id, sku, quantity, unit_price)
     *   shipment_items (shipment_id, sku, quantity)
     *   receives (shipment_id, sku, receive_quantity)
     */
    fun findSupplyChainData(): Map<String, SupplyChainRow> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            WITH po_data AS (
                SELECT sku, SUM(quantity) as qty, AVG(unit_price) as avg_price
                FROM purchase_order_items
                WHERE deleted_at IS NULL
                GROUP BY sku
            ),
            sent_data AS (
                SELECT sku, SUM(quantity) as qty
                FROM shipment_items
                WHERE deleted_at IS NULL
                GROUP BY sku
            ),
            recv_data AS (
                SELECT sku, SUM(receive_quantity) as qty
                FROM receives
                WHERE deleted_at IS NULL
                GROUP BY sku
            )
            SELECT
                p.sku,
                GREATEST(0, COALESCE(p.qty, 0) - COALESCE(s.qty, 0)) as order_qty,
                GREATEST(0, COALESCE(s.qty, 0) - COALESCE(r.qty, 0)) as transit_qty,
                COALESCE(p.avg_price, 0) as avg_price
            FROM po_data p
            LEFT JOIN sent_data s ON UPPER(p.sku) = UPPER(s.sku)
            LEFT JOIN recv_data r ON UPPER(p.sku) = UPPER(r.sku)
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            val orderQty = (row[1] as Number).toInt()
            val transitQty = (row[2] as Number).toInt()
            val avgPrice = (row[3] as Number).toDouble().toBigDecimal()

            sku to SupplyChainRow(
                orderQty = orderQty,
                orderValue = avgPrice * BigDecimal.valueOf(orderQty.toLong()),
                transitQty = transitQty,
                transitValue = avgPrice * BigDecimal.valueOf(transitQty.toLong()),
            )
        }
    }

    // ═══════════════════════════════════════════════════════
    // Ordering Queries (MOQ + Volatility)
    // ═══════════════════════════════════════════════════════

    /**
     * V1 parity: InventoryRepository.get_sku_moq()
     * → SELECT SKU, COALESCE(MOQ, 100) as MOQ FROM Data_COGS
     */
    fun findSkuMoq(): Map<String, Int> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            SELECT sku, COALESCE(moq, 100) FROM products WHERE sku IS NOT NULL
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            val moq = (row[1] as Number).toInt()
            sku to moq
        }
    }

    /**
     * V1 parity: InventoryRepository.get_historical_volatility(months=12)
     *
     * 计算每个 SKU 的月销量标准差（用于安全库存计算）。
     * Returns: Map<SKU, stddev>
     */
    fun findHistoricalVolatility(): Map<String, Double> {
        @Suppress("UNCHECKED_CAST")
        val rows = em.createNativeQuery("""
            WITH monthly AS (
                SELECT sku1 as sku,
                       TO_CHAR(order_date, 'YYYY-MM') as month,
                       SUM(quantity) as qty
                FROM cleaned_transactions
                WHERE order_date >= CURRENT_DATE - INTERVAL '12 months'
                  AND action = 'NN'
                  AND sku1 IS NOT NULL
                GROUP BY sku1, TO_CHAR(order_date, 'YYYY-MM')
            )
            SELECT sku, COALESCE(STDDEV(qty), 0) as vol
            FROM monthly
            GROUP BY sku
        """).resultList as List<Array<Any>>

        return rows.associate { row ->
            val sku = (row[0] as String).trim().uppercase()
            val vol = (row[1] as Number).toDouble()
            sku to vol
        }
    }
}
