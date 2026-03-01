package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.concurrent.CopyOnWriteArrayList

/**
 * SSE 广播器 — 当 eBay 有新订单时, 向所有连接的 Listing 页面推送售出的 itemId。
 *
 * 前端只更新对应的行 (soldQuantity +N, availableQuantity -N), 不刷新全部数据。
 */
@Service
class ListingSaleEventBroadcaster(
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(ListingSaleEventBroadcaster::class.java)
    private val emitters = CopyOnWriteArrayList<SseEmitter>()

    /**
     * 注册一个新的 SSE 连接 (前端 EventSource 连接时调用)。
     */
    fun subscribe(): SseEmitter {
        val emitter = SseEmitter(0L)  // 不超时 (keep forever)
        emitters.add(emitter)

        emitter.onCompletion { emitters.remove(emitter) }
        emitter.onTimeout { emitters.remove(emitter) }
        emitter.onError { emitters.remove(emitter) }

        log.info("📡 SSE client connected — total: {}", emitters.size)

        // 发送初始连接确认
        try {
            emitter.send(
                SseEmitter.event()
                    .name("connected")
                    .data("{\"status\":\"connected\"}")
            )
        } catch (e: Exception) {
            log.debug("Failed to send initial SSE event: {}", e.message)
        }

        return emitter
    }

    /**
     * 广播销售事件: 推送具体售出的 item 信息给所有前端连接。
     *
     * @param soldItems 售出的商品列表 [{itemId, sku, title, quantitySold}]
     */
    fun broadcastSale(soldItems: List<SoldItemInfo>) {
        if (emitters.isEmpty()) {
            log.debug("No SSE clients connected, skipping broadcast")
            return
        }

        val payload = objectMapper.writeValueAsString(mapOf(
            "type" to "ITEM_SOLD",
            "items" to soldItems,
            "timestamp" to System.currentTimeMillis(),
        ))

        val deadEmitters = mutableListOf<SseEmitter>()

        for (emitter in emitters) {
            try {
                emitter.send(
                    SseEmitter.event()
                        .name("sale")
                        .data(payload)
                )
            } catch (e: Exception) {
                deadEmitters.add(emitter)
                log.debug("SSE emitter dead, removing: {}", e.message)
            }
        }

        emitters.removeAll(deadEmitters.toSet())
        log.info("📡 Broadcasted ITEM_SOLD to {} clients: {} items",
            emitters.size, soldItems.size)
    }

    /**
     * 广播 Best Offer 事件: 推送买家发起的 offer 给前端 Offer 页面。
     *
     * @param offer Best Offer 信息
     */
    fun broadcastOffer(offer: OfferEventInfo) {
        if (emitters.isEmpty()) {
            log.debug("No SSE clients connected, skipping offer broadcast")
            return
        }

        val payload = objectMapper.writeValueAsString(mapOf(
            "type" to "BEST_OFFER",
            "offer" to offer,
            "timestamp" to System.currentTimeMillis(),
        ))

        val deadEmitters = mutableListOf<SseEmitter>()

        for (emitter in emitters) {
            try {
                emitter.send(
                    SseEmitter.event()
                        .name("offer")
                        .data(payload)
                )
            } catch (e: Exception) {
                deadEmitters.add(emitter)
                log.debug("SSE emitter dead, removing: {}", e.message)
            }
        }

        emitters.removeAll(deadEmitters.toSet())
        log.info("📡 Broadcasted BEST_OFFER to {} clients: itemId={}, buyer={}",
            emitters.size, offer.itemId, offer.buyerUserId)
    }
}

/**
 * 售出商品的基本信息 — 用于 SSE 推送给前端。
 */
data class SoldItemInfo(
    val itemId: String,          // eBay legacyItemId (listing ID)
    val sku: String?,            // Custom Label / SKU
    val title: String?,          // Item title
    val quantitySold: Int,       // 本次售出数量
    val orderId: String,         // 关联订单号
)

/**
 * Best Offer 事件信息 — 用于 SSE 推送给前端 Offer 页面。
 */
data class OfferEventInfo(
    val itemId: String,          // eBay Item ID
    val itemTitle: String?,      // 商品标题
    val buyerUserId: String?,    // 买家 ID
    val offerPrice: Double?,     // Offer 价格
    val offerCurrency: String?,  // 货币
    val quantity: Int?,          // 数量
    val status: String?,         // Offer 状态
    val bestOfferId: String?,    // Best Offer ID
    val message: String?,        // 买家留言
    val seller: String?,         // 卖家
    val buyItNowPrice: Double?,  // 原价 (BuyItNowPrice)
)
