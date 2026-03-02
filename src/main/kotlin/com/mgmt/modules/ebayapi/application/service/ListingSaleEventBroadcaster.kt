package com.mgmt.modules.ebayapi.application.service

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList

/**
 * SSE 广播器 — 当 eBay 有新订单时, 向所有连接的 Listing 页面推送售出的 itemId。
 *
 * 前端只更新对应的行 (soldQuantity +N, availableQuantity -N), 不刷新全部数据。
 * Emitters are keyed by seller username. Clients subscribing with "all" receive all events.
 */
@Service
class ListingSaleEventBroadcaster(
    private val objectMapper: ObjectMapper,
) {
    private val log = LoggerFactory.getLogger(ListingSaleEventBroadcaster::class.java)
    private val emittersBySeller = ConcurrentHashMap<String, CopyOnWriteArrayList<SseEmitter>>()

    /**
     * 注册一个新的 SSE 连接 (前端 EventSource 连接时调用)。
     * @param seller seller username to filter events, or "all" to receive everything
     */
    fun subscribe(seller: String = "all"): SseEmitter {
        val emitter = SseEmitter(0L)  // 不超时 (keep forever)
        val list = emittersBySeller.computeIfAbsent(seller) { CopyOnWriteArrayList() }
        list.add(emitter)

        val removeEmitter = {
            list.remove(emitter)
            if (list.isEmpty()) emittersBySeller.remove(seller, list)
        }
        emitter.onCompletion { removeEmitter() }
        emitter.onTimeout { removeEmitter() }
        emitter.onError { removeEmitter() }

        log.info("SSE client connected for seller={} — total: {}", seller, totalEmitterCount())

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
     * 广播销售事件: 推送具体售出的 item 信息给匹配的前端连接。
     *
     * @param seller the seller this sale belongs to
     * @param soldItems 售出的商品列表 [{itemId, sku, title, quantitySold}]
     */
    fun broadcastSale(seller: String, soldItems: List<SoldItemInfo>) {
        val targets = collectTargetEmitters(seller)
        if (targets.isEmpty()) {
            log.debug("No SSE clients connected for seller={}, skipping broadcast", seller)
            return
        }

        val payload = objectMapper.writeValueAsString(mapOf(
            "type" to "ITEM_SOLD",
            "items" to soldItems,
            "timestamp" to System.currentTimeMillis(),
        ))

        sendToEmitters(targets, "sale", payload)
        log.info("Broadcasted ITEM_SOLD to {} clients for seller={}: {} items",
            targets.size, seller, soldItems.size)
    }

    /**
     * 广播 Best Offer 事件: 推送买家发起的 offer 给前端 Offer 页面。
     *
     * @param offer Best Offer 信息 (seller is extracted from offer.seller)
     */
    fun broadcastOffer(offer: OfferEventInfo) {
        val seller = offer.seller ?: "unknown"
        val targets = collectTargetEmitters(seller)
        if (targets.isEmpty()) {
            log.debug("No SSE clients connected for seller={}, skipping offer broadcast", seller)
            return
        }

        val payload = objectMapper.writeValueAsString(mapOf(
            "type" to "BEST_OFFER",
            "offer" to offer,
            "timestamp" to System.currentTimeMillis(),
        ))

        sendToEmitters(targets, "offer", payload)
        log.info("Broadcasted BEST_OFFER to {} clients for seller={}: itemId={}, buyer={}",
            targets.size, seller, offer.itemId, offer.buyerUserId)
    }

    /**
     * Collect emitters that should receive events for the given seller:
     * emitters registered for that specific seller + emitters registered for "all".
     */
    private fun collectTargetEmitters(seller: String): List<SseEmitter> {
        val result = mutableListOf<SseEmitter>()
        emittersBySeller["all"]?.let { result.addAll(it) }
        if (seller != "all") {
            emittersBySeller[seller]?.let { result.addAll(it) }
        }
        return result
    }

    private fun sendToEmitters(emitters: List<SseEmitter>, eventName: String, payload: String) {
        val deadEmitters = mutableListOf<SseEmitter>()
        for (emitter in emitters) {
            try {
                emitter.send(SseEmitter.event().name(eventName).data(payload))
            } catch (e: Exception) {
                deadEmitters.add(emitter)
                log.debug("SSE emitter dead, removing: {}", e.message)
            }
        }
        // Clean up dead emitters from all seller lists
        if (deadEmitters.isNotEmpty()) {
            val deadSet = deadEmitters.toSet()
            for ((key, list) in emittersBySeller) {
                list.removeAll(deadSet)
                if (list.isEmpty()) emittersBySeller.remove(key, list)
            }
        }
    }

    fun broadcastAfterSales(event: AfterSalesEventInfo) {
        val seller = event.seller ?: "unknown"
        val targets = collectTargetEmitters(seller)
        if (targets.isEmpty()) return
        val payload = objectMapper.writeValueAsString(mapOf(
            "type" to "AFTER_SALES",
            "event" to event,
            "timestamp" to System.currentTimeMillis(),
        ))
        sendToEmitters(targets, "after-sales", payload)
        log.info("Broadcasted AFTER_SALES to {} clients: {}", targets.size, event.eventId)
    }

    fun broadcastMessage(event: MessageEventInfo) {
        val seller = event.seller ?: "unknown"
        val targets = collectTargetEmitters(seller)
        if (targets.isEmpty()) return
        val payload = objectMapper.writeValueAsString(mapOf(
            "type" to "NEW_MESSAGE",
            "message" to event,
            "timestamp" to System.currentTimeMillis(),
        ))
        sendToEmitters(targets, "message", payload)
        log.info("Broadcasted NEW_MESSAGE to {} clients: {}", targets.size, event.messageId)
    }

    private fun totalEmitterCount(): Int = emittersBySeller.values.sumOf { it.size }
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

data class AfterSalesEventInfo(
    val eventType: String,
    val eventId: String,
    val orderId: String?,
    val buyerUsername: String?,
    val status: String?,
    val seller: String?,
)

data class MessageEventInfo(
    val messageId: String,
    val sender: String,
    val senderUsername: String?,
    val itemId: String?,
    val subject: String?,
    val seller: String?,
)
