package com.mgmt.modules.ebayapi.application.service

import com.mgmt.modules.ebayapi.domain.model.EbayMessage
import com.mgmt.modules.ebayapi.domain.repository.EbayMessageRepository
import com.mgmt.modules.ebayapi.infrastructure.EbayApiUtils
import org.slf4j.LoggerFactory
import org.springframework.http.*
import org.springframework.stereotype.Service
import org.springframework.web.client.RestTemplate
import org.w3c.dom.Element
import org.w3c.dom.NodeList
import java.io.ByteArrayInputStream
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import javax.xml.parsers.DocumentBuilderFactory

/**
 * EbayMessageSyncService — Trading API GetMyMessages 拉取消息 + 计算响应时间。
 *
 * - FolderID=0 (Inbox=买家消息) + FolderID=1 (Sent=卖家回复)
 * - DetailLevel=ReturnMessages 返回正文
 * - XML 解析: JDK DocumentBuilderFactory
 * - 响应时间: 按 ItemID 分组, 卖家回复 - 最近买家消息
 */
@Service
class EbayMessageSyncService(
    private val oauthService: EbayOAuthService,
    private val messageRepo: EbayMessageRepository,
    private val actionLog: SalesActionLogService,
    private val saleBroadcaster: ListingSaleEventBroadcaster,
) {
    private val log = LoggerFactory.getLogger(EbayMessageSyncService::class.java)
    private val restTemplate = RestTemplate()
    private val PST = ZoneId.of("America/Los_Angeles")

    companion object {
        private const val TRADING_API_URL = "https://api.ebay.com/ws/api.dll"
        private val ISO_FORMATTER = DateTimeFormatter.ISO_INSTANT
    }

    data class SyncResult(val fetched: Int, val upserted: Int, val responseTimesCalculated: Int)

    /**
     * 同步指定卖家在日期范围内的所有消息。
     */
    fun syncDateRange(seller: String, fromDate: LocalDate, toDate: LocalDate): SyncResult {
        val accessToken = oauthService.getValidAccessToken(seller)
        val startMs = System.currentTimeMillis()

        val fromIso = fromDate.atStartOfDay(PST).toInstant().toString()
        val toIso = toDate.plusDays(1).atStartOfDay(PST).toInstant().toString()

        // 1. Fetch Inbox (buyer messages — sender=BUYER)
        val inboxMessages = fetchMessages(seller, accessToken, fromIso, toIso, folderId = "0")
        log.info("[MessageSync] {} inbox: {} messages fetched", seller, inboxMessages.size)

        // 2. Fetch Sent (seller replies — sender=SELLER)
        val sentMessages = fetchMessages(seller, accessToken, fromIso, toIso, folderId = "1")
        log.info("[MessageSync] {} sent: {} messages fetched", seller, sentMessages.size)

        // 3. Upsert all messages
        val allMessages = inboxMessages + sentMessages
        var upserted = 0
        for (msg in allMessages) {
            val existing = messageRepo.findByMessageId(msg.messageId)
            if (existing != null) {
                existing.isRead = msg.isRead
                existing.flagged = msg.flagged
                existing.replied = msg.replied
                existing.updatedAt = Instant.now()
                messageRepo.save(existing)
            } else {
                messageRepo.save(msg)

                // SSE broadcast new buyer message to frontend (skip seller-sent)
                if (msg.sender == "BUYER") {
                    saleBroadcaster.broadcastMessage(MessageEventInfo(
                        messageId = msg.messageId,
                        sender = msg.sender,
                        senderUsername = msg.senderUsername,
                        itemId = msg.itemId,
                        subject = msg.subject,
                        seller = msg.sellerUsername,
                    ))
                }
            }
            upserted++
        }

        // 4. Calculate response times (pair buyer msg → seller reply by ItemID)
        val responseTimesCalculated = calculateResponseTimes(seller, inboxMessages, sentMessages)

        val durationMs = System.currentTimeMillis() - startMs
        log.info("[MessageSync] {} done: fetched={}, upserted={}, responseTimes={}, duration={}ms",
            seller, allMessages.size, upserted, responseTimesCalculated, durationMs)

        actionLog.log(
            module = "MESSAGES",
            actionType = "SYNC",
            triggerType = "MANUAL",
            seller = seller,
            summary = "Message sync: ${allMessages.size} fetched (${inboxMessages.size} buyer + ${sentMessages.size} seller), $upserted upserted",
            totalCount = allMessages.size,
            successCount = upserted,
            durationMs = durationMs,
        )

        return SyncResult(allMessages.size, upserted, responseTimesCalculated)
    }

    // ═══════════════════════════════════════════════
    // GetMyMessages XML
    // ═══════════════════════════════════════════════

    private fun fetchMessages(
        seller: String,
        accessToken: String,
        fromIso: String,
        toIso: String,
        folderId: String,
    ): List<EbayMessage> {
        // Step 1: Get message headers (ReturnHeaders — no MessageIDs needed)
        val messages = mutableListOf<EbayMessage>()
        var pageNumber = 1
        var hasMore = true

        while (hasMore) {
            val xmlBody = buildHeadersXml(fromIso, toIso, folderId, pageNumber)
            val responseBody = callGetMyMessages(accessToken, xmlBody)
            val parsed = parseGetMyMessagesResponse(responseBody, seller, folderId)
            messages.addAll(parsed)
            hasMore = parsed.size >= 200
            pageNumber++
        }

        if (messages.isEmpty()) return emptyList()

        // Step 2: Batch-fetch message bodies (ReturnMessages + MessageIDs, max 10/call)
        val idBatches = messages.map { it.messageId }.chunked(10)
        val bodyMap = mutableMapOf<String, String>()

        for (batch in idBatches) {
            try {
                val xmlBody = buildMessagesXml(batch)
                val responseBody = callGetMyMessages(accessToken, xmlBody)
                val bodies = parseMessageBodies(responseBody)
                bodyMap.putAll(bodies)
            } catch (e: Exception) {
                log.warn("[MessageSync] Failed to fetch message bodies for batch: {}", e.message)
            }
        }

        // Merge bodies into messages
        for (msg in messages) {
            bodyMap[msg.messageId]?.let { msg.body = it }
        }

        return messages
    }

    private fun callGetMyMessages(accessToken: String, xmlBody: String): String {
        val headers = HttpHeaders().apply {
            contentType = MediaType.TEXT_XML
            set("X-EBAY-API-SITEID", "0")
            set("X-EBAY-API-COMPATIBILITY-LEVEL", "1271")
            set("X-EBAY-API-CALL-NAME", "GetMyMessages")
            set("X-EBAY-API-IAF-TOKEN", accessToken)
        }

        val response = EbayApiUtils.callWithRetry(label = "GetMyMessages") {
            restTemplate.exchange(
                java.net.URI.create(TRADING_API_URL),
                HttpMethod.POST,
                HttpEntity(xmlBody, headers),
                String::class.java,
            )
        }
        return response.body ?: ""
    }

    /** Step 1 XML: ReturnHeaders — list messages by date range (no MessageIDs needed) */
    private fun buildHeadersXml(from: String, to: String, folderId: String, page: Int): String {
        return """<?xml version="1.0" encoding="utf-8"?>
<GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnHeaders</DetailLevel>
  <FolderID>$folderId</FolderID>
  <StartCreationTime>$from</StartCreationTime>
  <EndCreationTime>$to</EndCreationTime>
  <Pagination>
    <EntriesPerPage>200</EntriesPerPage>
    <PageNumber>$page</PageNumber>
  </Pagination>
</GetMyMessagesRequest>"""
    }

    /** Step 2 XML: ReturnMessages — fetch body text by MessageIDs (max 10) */
    private fun buildMessagesXml(messageIds: List<String>): String {
        val idsXml = messageIds.joinToString("\n") { "  <MessageID>$it</MessageID>" }
        return """<?xml version="1.0" encoding="utf-8"?>
<GetMyMessagesRequest xmlns="urn:ebay:apis:eBLBaseComponents">
  <DetailLevel>ReturnMessages</DetailLevel>
  <MessageIDs>
$idsXml
  </MessageIDs>
</GetMyMessagesRequest>"""
    }

    /** Parse body text from ReturnMessages response → Map<MessageID, Text> */
    private fun parseMessageBodies(xml: String): Map<String, String> {
        val result = mutableMapOf<String, String>()
        try {
            val factory = DocumentBuilderFactory.newInstance()
            factory.isNamespaceAware = false
            val builder = factory.newDocumentBuilder()
            val doc = builder.parse(ByteArrayInputStream(xml.toByteArray()))

            val ack = getTagText(doc.documentElement, "Ack") ?: ""
            if (ack == "Failure") return emptyMap()

            val messageNodes = doc.getElementsByTagName("Message")
            for (i in 0 until messageNodes.length) {
                val node = messageNodes.item(i) as? Element ?: continue
                val msgId = getTagText(node, "MessageID") ?: continue
                val text = getTagText(node, "Text") ?: continue
                result[msgId] = text
            }
        } catch (e: Exception) {
            log.warn("[MessageSync] Failed to parse message bodies: {}", e.message)
        }
        return result
    }

    private fun parseGetMyMessagesResponse(xml: String, seller: String, folderId: String): List<EbayMessage> {
        val messages = mutableListOf<EbayMessage>()

        try {
            val factory = DocumentBuilderFactory.newInstance()
            factory.isNamespaceAware = false
            val builder = factory.newDocumentBuilder()
            val doc = builder.parse(ByteArrayInputStream(xml.toByteArray()))

            // Check for errors
            val ack = getTagText(doc.documentElement, "Ack") ?: ""
            if (ack == "Failure") {
                val errorMsg = getTagText(doc.documentElement, "ShortMessage") ?: "Unknown error"
                log.warn("[MessageSync] GetMyMessages failed: {}", errorMsg)
                return emptyList()
            }

            val messageNodes = doc.getElementsByTagName("Message")
            for (i in 0 until messageNodes.length) {
                val node = messageNodes.item(i) as? Element ?: continue

                val messageId = getTagText(node, "MessageID") ?: continue
                val senderText = getTagText(node, "Sender") ?: ""
                val recipientId = getTagText(node, "RecipientUserID") ?: ""
                val subject = getTagText(node, "Subject")
                val body = getTagText(node, "Text")
                val itemId = getTagText(node, "ItemID")
                val itemTitle = getTagText(node, "ItemTitle")
                val messageType = getTagText(node, "MessageType")
                val isReadStr = getTagText(node, "Read") ?: "false"
                val flaggedStr = getTagText(node, "Flagged") ?: "false"
                val repliedStr = getTagText(node, "Replied") ?: "false"
                val receivedDateStr = getTagText(node, "ReceiveDate")
                val externalMessageId = getTagText(node, "ExternalMessageID")

                val receivedAt = receivedDateStr?.let { parseEbayDate(it) } ?: Instant.now()
                val senderType = if (folderId == "1") "SELLER" else "BUYER"

                messages.add(EbayMessage(
                    messageId = messageId,
                    sender = senderType,
                    senderUsername = if (senderType == "BUYER") senderText else seller,
                    recipientUsername = if (senderType == "BUYER") seller else recipientId,
                    sellerUsername = seller,
                    itemId = itemId,
                    itemTitle = itemTitle,
                    subject = subject,
                    body = body,
                    messageType = messageType,
                    folderId = folderId,
                    isRead = isReadStr.equals("true", ignoreCase = true),
                    flagged = flaggedStr.equals("true", ignoreCase = true),
                    replied = repliedStr.equals("true", ignoreCase = true),
                    parentMessageId = externalMessageId,
                    receivedAt = receivedAt,
                ))
            }
        } catch (e: Exception) {
            log.error("[MessageSync] Failed to parse GetMyMessages XML: {}", e.message, e)
        }

        return messages
    }

    // ═══════════════════════════════════════════════
    // Response time calculation
    // ═══════════════════════════════════════════════

    /**
     * 按 ItemID 分组, 对每条 Sent 消息找同 ItemID 最近的买家消息,
     * 计算 responseSeconds = reply.receivedAt - buyerMsg.receivedAt
     */
    private fun calculateResponseTimes(
        @Suppress("unused") seller: String,
        inboxMessages: List<EbayMessage>,
        sentMessages: List<EbayMessage>,
    ): Int {
        var count = 0

        // Group inbox messages by itemId, sorted by receivedAt
        // Exclude eBay system messages (senderUsername = "eBay") from pairing
        val inboxByItem = inboxMessages
            .filter { it.itemId != null && !it.senderUsername.equals("eBay", ignoreCase = true) }
            .groupBy { it.itemId!! }
            .mapValues { (_, msgs) -> msgs.sortedBy { it.receivedAt } }

        for (sentMsg in sentMessages) {
            val itemId = sentMsg.itemId ?: continue
            val buyerMessages = inboxByItem[itemId] ?: continue

            // Find the most recent buyer message BEFORE this reply
            val nearestBuyer = buyerMessages
                .filter { it.receivedAt.isBefore(sentMsg.receivedAt) }
                .maxByOrNull { it.receivedAt }
                ?: continue

            val responseSeconds = java.time.Duration.between(nearestBuyer.receivedAt, sentMsg.receivedAt).seconds

            // Update the sent message with response time
            val existing = messageRepo.findByMessageId(sentMsg.messageId)
            if (existing != null) {
                existing.responseTimeSeconds = responseSeconds
                existing.updatedAt = Instant.now()
                messageRepo.save(existing)
                count++
            }
        }

        return count
    }

    // ═══════════════════════════════════════════════
    // XML helpers
    // ═══════════════════════════════════════════════

    private fun getTagText(parent: Element, tagName: String): String? {
        val nodes = parent.getElementsByTagName(tagName)
        if (nodes.length == 0) return null
        return nodes.item(0)?.textContent?.trim()?.ifBlank { null }
    }

    private fun parseEbayDate(dateStr: String): Instant {
        return try {
            Instant.parse(dateStr)
        } catch (e: Exception) {
            try {
                ZonedDateTime.parse(dateStr, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toInstant()
            } catch (e2: Exception) {
                log.debug("Could not parse date: {}", dateStr)
                Instant.now()
            }
        }
    }
}
