---
description: 企业通知系统 — 多通道 (Email/WebSocket/站内/Slack/SMS), 模板引擎, 用户偏好
---

# 通知系统 (Notification System)

> **核心原则**: 通知是事件驱动的, 通过 Kafka 解耦, 支持多通道策略模式。
> **权威规范**: `core/skills/messaging.md`

---

## 1. 架构

```
业务模块 (任意)
    │ 发布事件到 Kafka
    ▼
erp.notification.events (Kafka Topic)
    │
    ▼
NotificationConsumer
    │
    ├── 查询用户通知偏好 (notification_preferences 表)
    │
    ├── 渲染模板 (Thymeleaf, 支持 i18n)
    │
    └── 分发到通道
        ├── EmailChannel      → Spring Mail + SMTP
        ├── WebSocketChannel  → STOMP /topic/notifications/{userId}
        ├── InAppChannel      → INSERT INTO notifications 表
        ├── SlackChannel      → Slack Webhook API
        └── SMSChannel        → Twilio / AWS SNS (可选)
```

---

## 2. 数据模型

```sql
-- 通知记录表
CREATE TABLE notifications (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    type        VARCHAR(50) NOT NULL,     -- 'PO_APPROVED', 'INVENTORY_LOW', 'SECURITY_ALERT'
    title       VARCHAR(255) NOT NULL,
    body        TEXT NOT NULL,
    channel     VARCHAR(20) NOT NULL,     -- 'EMAIL', 'IN_APP', 'WEBSOCKET', 'SLACK', 'SMS'
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING', -- 'PENDING', 'SENT', 'FAILED', 'READ'
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at     TIMESTAMPTZ,
    sent_at     TIMESTAMPTZ
);

-- 用户通知偏好表
CREATE TABLE notification_preferences (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) UNIQUE,
    email_enabled   BOOLEAN NOT NULL DEFAULT true,
    in_app_enabled  BOOLEAN NOT NULL DEFAULT true,
    slack_enabled   BOOLEAN NOT NULL DEFAULT false,
    sms_enabled     BOOLEAN NOT NULL DEFAULT false,
    quiet_hours     JSONB,    -- {"start": "22:00", "end": "07:00", "timezone": "America/Los_Angeles"}
    preferences     JSONB     -- {"PO_APPROVED": ["EMAIL", "IN_APP"], "SECURITY_ALERT": ["EMAIL", "SMS"]}
);
```

---

## 3. Kafka 事件格式

```json
{
  "eventId": "uuid-v7",
  "eventType": "NOTIFICATION_REQUESTED",
  "timestamp": "2026-02-11T13:00:00Z",
  "payload": {
    "recipientUserId": "user-uuid",
    "notificationType": "PO_APPROVED",
    "templateKey": "purchase.po.approved",
    "templateData": {
      "poNumber": "PO-2026-0042",
      "amount": "$12,500.00",
      "approvedBy": "admin"
    },
    "channels": ["EMAIL", "IN_APP"],
    "priority": "NORMAL"
  }
}
```

---

## 4. 通道实现

### 4.1 Email (Spring Mail + Thymeleaf)

```kotlin
@Service
class EmailChannel(
    private val mailSender: JavaMailSender,
    private val templateEngine: SpringTemplateEngine,
) : NotificationChannel {
    override fun send(notification: NotificationMessage) {
        val context = Context().apply {
            setVariable("title", notification.title)
            setVariable("body", notification.body)
            setVariable("data", notification.templateData)
            locale = notification.locale
        }
        val html = templateEngine.process("email/${notification.templateKey}", context)

        val message = mailSender.createMimeMessage()
        val helper = MimeMessageHelper(message, true, "UTF-8")
        helper.setTo(notification.recipientEmail)
        helper.setSubject(notification.title)
        helper.setText(html, true)
        mailSender.send(message)
    }
}
```

### 4.2 WebSocket (STOMP)

```kotlin
@Service
class WebSocketChannel(
    private val messagingTemplate: SimpMessagingTemplate,
) : NotificationChannel {
    override fun send(notification: NotificationMessage) {
        messagingTemplate.convertAndSendToUser(
            notification.recipientUserId,
            "/queue/notifications",
            NotificationPayload(
                id = notification.id,
                type = notification.type,
                title = notification.title,
                body = notification.body,
                createdAt = notification.createdAt,
            )
        )
    }
}
```

### 4.3 In-App (数据库)

```kotlin
@Service
class InAppChannel(
    private val notificationRepository: NotificationRepository,
) : NotificationChannel {
    override fun send(notification: NotificationMessage) {
        notificationRepository.save(NotificationEntity(
            userId = notification.recipientUserId,
            type = notification.type,
            title = notification.title,
            body = notification.body,
            channel = "IN_APP",
            status = "SENT",
        ))
    }
}
```

---

## 5. 前端集成

```tsx
// React Hook: useNotifications
const { notifications, unreadCount, markAsRead } = useNotifications();

// WebSocket 连接
useEffect(() => {
  const client = new Client({ brokerURL: 'ws://api/ws' });
  client.subscribe(`/user/queue/notifications`, (msg) => {
    const notification = JSON.parse(msg.body);
    showToast(notification);       // Sonner toast
    addToNotificationList(notification);
  });
  client.activate();
}, []);
```

---

## 6. 通知类型注册

| 类型 | 默认通道 | 优先级 |
|------|----------|--------|
| `PO_APPROVED` | EMAIL + IN_APP | NORMAL |
| `PO_REJECTED` | EMAIL + IN_APP | HIGH |
| `INVENTORY_LOW` | IN_APP + SLACK | NORMAL |
| `SECURITY_ALERT` | EMAIL + SMS + SLACK | CRITICAL |
| `TRAINING_DUE` | EMAIL + IN_APP | NORMAL |
| `REPORT_READY` | IN_APP | LOW |
| `SYSTEM_MAINTENANCE` | EMAIL + SLACK | HIGH |

---

*Version: 1.0.0 — 2026-02-11*
