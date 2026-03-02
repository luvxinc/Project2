package com.mgmt.modules.ebayapi.domain.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "messages", schema = "ebay_api")
class EbayMessage(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    @Column(name = "message_id", unique = true, nullable = false, length = 100)
    var messageId: String = "",
    @Column(name = "sender", nullable = false, length = 20)
    var sender: String = "",
    @Column(name = "sender_username", length = 200)
    var senderUsername: String? = null,
    @Column(name = "recipient_username", length = 200)
    var recipientUsername: String? = null,
    @Column(name = "seller_username", length = 100)
    var sellerUsername: String? = null,
    @Column(name = "item_id", length = 100)
    var itemId: String? = null,
    @Column(name = "item_title", length = 500)
    var itemTitle: String? = null,
    @Column(name = "subject", columnDefinition = "TEXT")
    var subject: String? = null,
    @Column(name = "body", columnDefinition = "TEXT")
    var body: String? = null,
    @Column(name = "message_type", length = 50)
    var messageType: String? = null,
    @Column(name = "folder_id", length = 20)
    var folderId: String? = null,
    @Column(name = "is_read")
    var isRead: Boolean = false,
    @Column(name = "flagged")
    var flagged: Boolean = false,
    @Column(name = "replied")
    var replied: Boolean = false,
    @Column(name = "parent_message_id", length = 100)
    var parentMessageId: String? = null,
    @Column(name = "response_time_seconds")
    var responseTimeSeconds: Long? = null,
    @Column(name = "received_at", nullable = false)
    var receivedAt: Instant = Instant.now(),
    @Column(name = "created_at")
    var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at")
    var updatedAt: Instant = Instant.now(),
)
