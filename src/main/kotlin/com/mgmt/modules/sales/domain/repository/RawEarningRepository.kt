package com.mgmt.modules.sales.domain.repository

import com.mgmt.modules.sales.domain.model.RawEarning
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface RawEarningRepository : JpaRepository<RawEarning, Long> {
    fun findByRowHash(rowHash: String): RawEarning?
    fun findAllByUploadBatchId(batchId: String): List<RawEarning>
    fun countByUploadBatchId(batchId: String): Long
    fun findAllByOrderNumber(orderNumber: String): List<RawEarning>

    /** P13: Working Set — find all unsynced (Processed_E=0 equivalent) */
    fun findAllBySyncedFalse(): List<RawEarning>

    /** P13: Working Set — fetch all raw earnings for a set of order numbers */
    fun findAllByOrderNumberIn(orderNumbers: List<String>): List<RawEarning>

    /** V1 parity: upsert — 覆盖模式, 更新全部字段 (V1: DELETE+INSERT) */
    @Modifying
    @Query(
        value = """
            INSERT INTO raw_earnings (upload_batch_id, seller, order_number, item_id, order_date,
                buyer_name, custom_label, item_title, shipping_labels, row_hash, created_at)
            VALUES (:#{#e.uploadBatchId}, :#{#e.seller}, :#{#e.orderNumber}, :#{#e.itemId}, :#{#e.orderDate},
                :#{#e.buyerName}, :#{#e.customLabel}, :#{#e.itemTitle}, :#{#e.shippingLabels}, :#{#e.rowHash}, NOW())
            ON CONFLICT (row_hash) DO UPDATE SET
                upload_batch_id = EXCLUDED.upload_batch_id,
                seller = EXCLUDED.seller,
                order_number = EXCLUDED.order_number,
                item_id = EXCLUDED.item_id,
                order_date = EXCLUDED.order_date,
                buyer_name = EXCLUDED.buyer_name,
                custom_label = EXCLUDED.custom_label,
                item_title = EXCLUDED.item_title,
                shipping_labels = EXCLUDED.shipping_labels
        """,
        nativeQuery = true
    )
    fun upsert(e: RawEarning)
}
