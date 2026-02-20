---
name: integration
description: 集成与接口工程 SOP。Use when 需要 API 契约治理、第三方集成、Webhook、网关策略或版本兼容控制。
---

# 集成与接口工程 (Integration & API Engineering)

> **你是集成架构师。你的职责是: 设计+实现 API 契约、第三方集成、Webhook、契约测试、版本管理。**
> **系统的边界就是接口。内部 API、第三方集成、Webhook — 都在这个 Skill。**



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

后端 API 定义 → `openapi.json` → 客户端代码生成 → 前端 HTTP Client。见 `CONTEXT.md §3` 获取当前 OpenAPI 工具链（springdoc-openapi / swagger-jsdoc / fastapi 等）。

### 2.2 OpenAPI 全局配置模式

> **OpenAPI 库**: 见 `CONTEXT.md §3 后端技术栈`，按当前框架使用对应 OpenAPI 库。

```
核心配置:
  API 元信息: title, version, description
  安全方案: Bearer Auth (JWT) — bearerAuth scheme
  全局安全要求: 所有端点默认需要 bearerAuth
  例外路径: /auth/**, /health → 无需认证
```

### 2.3 DTO 文档化模式

> **Schema 注解**: 见 `CONTEXT.md §3`（@Schema / @OpenApiModel / Pydantic Field 等）。

```
DTO 文档化规范:
  请求 DTO:
    - @Description("操作说明")
    - 每个字段: description + example + 校验规则
  响应 DTO:
    - 每个字段: description（可选 example）
  枚举类型:
    - 列出所有可能值及含义
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

```
// ✅ 标准封装模式（伪代码）: 超时 + 重试 + 熔断 + 日志
// 具体框架实现见 CONTEXT.md §3（Resilience4j / Polly / retry 库等）

class ExternalApiClient {
  @RetryPolicy(maxAttempts=3, backoff=exponential(1s))
  @CircuitBreaker(name="{service}", fallback="serviceUnavailableFallback")
  fun callExternalApi(request) {
    log.info("Calling {service} API: {request.key_id}")
    response = httpClient.post("{config.serviceUrl}/endpoint", request, timeout=30s)
    return parseResponse(response)
  }

  fun serviceUnavailableFallback(request, exception) {
    log.error("External API unavailable", exception)
    return FallbackResponse(status = "PENDING")
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

```
// Webhook 接收处理模式（伪代码）
// 见 CONTEXT.md §3 后端框架实现

POST /webhooks/{provider}
  1. 验签: webhookVerifier.verify(provider, payload, signature)
     失败 → 返回 401

  2. 幂等检查: eventRepo.exists(extractEventId(payload))
     已存在 → 返回 200 (已处理，直接忽略)

  3. 异步处理: taskQueue.enqueue(provider, payload)
     → 立即返回 200（不等待处理完成）
     → 后台处理失败 → 重试 + 告警
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

双方共同维护 API 契约，任何一方违反 → CI 挂。

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

`客户端 → API Gateway → 后端服务`，网关职责：路由（`/api/v*/...` → 当前版本服务，见 `CONTEXT.md §3`）、JWT 验证、限流（100 req/s per client）、请求/响应日志、灰度发布（Canary / Blue-Green）。

---

---

*Version: 2.1.0 — L1 泛化：移除 Springdoc/Kotlin 特定代码，改为伪代码模式 + CONTEXT.md §3 引用*
*Updated: 2026-02-19*
