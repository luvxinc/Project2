---
name: integration
description: 集成与接口工程 SOP。Use when 需要 API 契约治理、第三方集成、Webhook、网关策略或版本兼容控制。
---

# 集成与接口工程 (Integration & API Engineering)

> **你是集成架构师。你的职责是: 设计+实现 API 契约、第三方集成、Webhook、契约测试、版本管理。**
> **系统的边界就是接口。内部 API、第三方集成、Webhook — 都在这个 Skill。**


> **⚠️ 本文件 ~9KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `REST`, `API 设计`, `HTTP`, `错误码` | → §1 API 设计标准 |
| `OpenAPI`, `Swagger`, `契约`, `DTO` | → §2 OpenAPI 契约驱动 |
| `版本`, `breaking change`, `兼容` | → §3 API 版本管理 |
| `第三方`, `SDK`, `外部`, `熔断` | → §4 第三方集成 |
| `Webhook`, `回调`, `验签` | → §5 Webhook 设计 |
| `契约测试`, `Pact`, `diff` | → §6 契约测试 |
| `网关`, `灰度`, `限流` | → §7 API 网关 |

---
---

## 1. API 设计标准

### 1.1 RESTful 规范

```
GET    /api/v1/products          # 列表 (分页)
GET    /api/v1/products/{id}     # 详情
POST   /api/v1/products          # 创建
PUT    /api/v1/products/{id}     # 全量更新
PATCH  /api/v1/products/{id}     # 部分更新
DELETE /api/v1/products/{id}     # 删除

# 嵌套资源
GET    /api/v1/orders/{id}/items
POST   /api/v1/orders/{id}/items

# 操作 (非 CRUD)
POST   /api/v1/orders/{id}/submit
POST   /api/v1/orders/{id}/cancel
```

### 1.2 统一响应格式

```json
// 成功
{
  "success": true,
  "data": { ... },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 150
  }
}

// 失败
{
  "success": false,
  "error": {
    "code": "PRODUCT_NOT_FOUND",
    "message": "Product with ID 123 not found",
    "details": [ ... ]
  }
}
```

### 1.3 错误码规范

| HTTP Status | 业务码 | 含义 |
|-------------|--------|------|
| 400 | VALIDATION_ERROR | 参数校验失败 |
| 401 | UNAUTHORIZED | 未认证 |
| 403 | FORBIDDEN | 无权限 |
| 404 | {ENTITY}_NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 数据冲突 (乐观锁) |
| 422 | BUSINESS_ERROR | 业务规则拒绝 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## 2. OpenAPI 契约驱动

### 2.1 流程

```
Spring Boot (后端)
    ↓ springdoc-openapi 自动生成
OpenAPI 3.0 Spec (openapi.json)
    ↓ openapi-typescript 转换
TypeScript Client (前端)
    ↓ 前端 import
React Query Hooks
```

### 2.2 Springdoc 配置

```kotlin
@OpenAPIDefinition(
    info = Info(
        title = "MGMT ERP API",
        version = "3.0.0"
    ),
    security = [SecurityRequirement(name = "bearerAuth")]
)
@Configuration
class OpenApiConfig {
    @Bean
    fun customOpenAPI(): OpenAPI = OpenAPI()
        .components(Components()
            .addSecuritySchemes("bearerAuth",
                SecurityScheme()
                    .type(SecurityScheme.Type.HTTP)
                    .scheme("bearer")
                    .bearerFormat("JWT")
            ))
}
```

### 2.3 DTO 文档化

```kotlin
@Schema(description = "创建产品请求")
data class CreateProductCmd(
    @field:NotBlank
    @Schema(description = "产品名称", example = "P-Valve Model A")
    val name: String,

    @field:NotBlank
    @Schema(description = "SKU", example = "PV-001-A")
    val sku: String,

    @Schema(description = "单价", example = "1500.00")
    val unitPrice: BigDecimal? = null
)
```

---

## 3. API 版本管理

### 3.1 版本策略

| 策略 | 方式 | 适用 |
|------|------|------|
| **URL 路径版本** | `/api/v1/`, `/api/v2/` | 推荐, 最清晰 |
| Header 版本 | `Accept: application/vnd.api.v2+json` | 灵活但隐式 |
| 参数版本 | `/api/products?version=2` | 不推荐 |

### 3.2 版本升级规则

| 变更类型 | 需要新版本? | 示例 |
|----------|------------|------|
| 新增可选字段 | ❌ | 响应增加 `metadata` |
| 新增端点 | ❌ | 新增 `/api/v1/reports` |
| 修改字段类型 | ✅ | `price: string → number` |
| 删除字段 | ✅ | 移除 `legacyId` |
| 修改行为逻辑 | ✅ | 排序规则变更 |

---

## 4. 第三方集成

### 4.1 集成模式

```
直接调用:  我方 ──HTTP──→ 第三方 API
Webhook:  第三方 ──HTTP──→ 我方回调 URL
SDK 封装: 第三方 SDK → 我方 Adapter → 业务代码
消息队列: 第三方 → MQ → 我方消费
```

### 4.2 第三方调用规范

```kotlin
// ✅ 标准封装: 超时 + 重试 + 熔断 + 日志
@Component
class ExternalPaymentClient(
    private val restTemplate: RestTemplate
) {
    @Retryable(maxAttempts = 3, backoff = Backoff(delay = 1000))
    @CircuitBreaker(name = "payment", fallbackMethod = "paymentFallback")
    fun processPayment(request: PaymentRequest): PaymentResponse {
        log.info("Calling payment API: {}", request.orderId)
        return restTemplate.postForObject(
            "${config.paymentUrl}/api/charge",
            request,
            PaymentResponse::class.java
        )!!
    }

    fun paymentFallback(request: PaymentRequest, ex: Exception): PaymentResponse {
        log.error("Payment API unavailable, queuing for retry", ex)
        return PaymentResponse(status = "PENDING")
    }
}
```

### 4.3 第三方集成清单

| 检查项 | 说明 |
|--------|------|
| 超时设置 | 连接 5s, 读取 30s (可配置) |
| 重试策略 | 指数退避, 最多 3 次 |
| 熔断器 | 连续失败 5 次 → 断开 30s |
| 降级方案 | 第三方不可用时的 fallback |
| 密钥管理 | API Key 不硬编码, 用 Vault |
| 日志脱敏 | 不打印完整请求体 (含敏感数据) |
| 速率限制 | 尊重第三方 Rate Limit |
| 监控 | 调用成功率 + 延迟告警 |

---

## 5. Webhook 设计

### 5.1 接收 Webhook

```kotlin
@PostMapping("/webhooks/{provider}")
fun receiveWebhook(
    @PathVariable provider: String,
    @RequestHeader("X-Signature") signature: String,
    @RequestBody payload: String
): ResponseEntity<Void> {
    // 1. 验签
    if (!webhookVerifier.verify(provider, payload, signature)) {
        return ResponseEntity.status(401).build()
    }
    // 2. 幂等检查
    val eventId = extractEventId(payload)
    if (webhookEventRepo.existsById(eventId)) {
        return ResponseEntity.ok().build()  // 已处理
    }
    // 3. 异步处理 (快速返回 200)
    webhookProcessor.processAsync(provider, payload)
    return ResponseEntity.ok().build()
}
```

### 5.2 Webhook 铁律

| 规则 | 说明 |
|------|------|
| **快速返回** | 收到后 200, 异步处理 |
| **验签** | 必须验证签名 |
| **幂等** | 同一事件可能送多次 |
| **重试** | 对方可能重发, 做好去重 |

---

## 6. 契约测试 (Contract Testing)

### 6.1 目的

```
前端改了不告诉后端 → 上线炸
后端改了不告诉前端 → 上线炸

契约测试: 双方共同维护一份"合同", 任何一方违反合同 → CI 挂
```

### 6.2 实现方式

| 方式 | 工具 | 适用 |
|------|------|------|
| **Provider-Driven** | Spring Cloud Contract | 后端定义契约 |
| **Consumer-Driven** | Pact | 前端定义期望 |
| **Schema-Driven** | OpenAPI diff | 检测 breaking changes |

### 6.3 OpenAPI Diff (最轻量)

```bash
# CI 中检测 API 变更
npx openapi-diff old-spec.json new-spec.json --check
# 输出: Breaking changes detected!
# - Removed path: /api/v1/legacy
# - Changed type: price (string → number)
```

---

## 7. API 网关

```
客户端 → API Gateway → 后端服务
           │
           ├── 路由: 历史旧路由（已退役，禁止新增依赖）
           ├── 路由: /api/v3/* → V3 Spring Boot
           ├── 认证: JWT 验证
           ├── 限流: 100 req/s per client
           ├── 日志: 请求/响应日志
           └── 灰度: 10% → V3, 90% → V2
```

---

## 8. L3 工具库引用 (按需加载)

| 场景 | 工具 | 路径 | 说明 |
|------|------|------|------|
| API 设计审查 | ECC: Review | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | API 反模式检查 |
| 编码规范 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | 接口设计强制规则 |
| API 文档模板 | Anthropic Spec | `warehouse/tools/anthropic-skills/01-spec-template.md` | Spec 文档格式参考 |

---

*Version: 1.1.0 — 含路由表 + L3 工具引用*
