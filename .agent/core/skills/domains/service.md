---
name: service-engineering
description: 服务工程域 — 后端业务逻辑/数据持久化/安全/API 契约/消息队列/第三方集成。
---

# 服务工程部

> **CTO 路由到此文件后, 按关键词选择加载对应工程师 SOP 的对应 section。**
> **禁止全部加载。只加载命中的。**

## 部门职能总览

```
服务工程部
├── 后端架构师 ─── backend.md
│   ├── 构建系统 ─────── §2 Gradle/Kotlin
│   ├── 模块结构 ─────── §3 DDD 分层
│   ├── 安全配置 ─────── §4 Spring Security
│   ├── 事务管理 ─────── §5 UseCase + @Transactional
│   ├── 测试规范 ─────── §6 JUnit + Testcontainers
│   └── 配置管理 ─────── §7 profiles + Vault
│
├── 数据架构师 ─── data.md
│   ├── PostgreSQL ───── §2 OLTP 唯一真相源
│   ├── Redis ──────────── §3 缓存 + Session + 分布式锁
│   ├── Kafka ─────────── §4 事件驱动
│   ├── OpenSearch ────── §5 全文搜索
│   ├── ClickHouse ────── §6 OLAP/报表
│   └── 数据一致性 ────── §7 跨存储一致性保障
│
├── 安全架构师 ─── security.md
│   ├── 认证 ──────────── §2 OAuth2/OIDC/JWT
│   ├── 授权 ──────────── §3 4 级安全模型
│   ├── 密钥管理 ──────── §4 HashiCorp Vault
│   ├── 数据加密 ──────── §5 传输 + 静态加密
│   ├── 审计合规 ──────── §6 SOX/SOC2
│   └── API 安全 ──────── §7 速率限制/CORS/CSRF
│
├── 集成工程师 ─── integration.md
│   ├── API 设计 ──────── §1 RESTful 规范
│   ├── OpenAPI 契约 ──── §2 Swagger 自动生成
│   ├── API 版本 ──────── §3 版本管理策略
│   ├── 第三方集成 ────── §4 SDK/重试/熔断
│   ├── Webhook ────────── §5 验签/幂等/异步
│   ├── 契约测试 ──────── §6 Pact/OpenAPI diff
│   └── API 网关 ──────── §7 路由/限流/灰度
│
└── 消息工程师 ─── messaging.md
    ├── 消息架构 ──────── §1 同步 vs 异步选型
    ├── Kafka 深入 ────── §2 Topic/Producer/Consumer
    ├── 消息模式 ──────── §3 Saga/幂等/死信/Outbox
    ├── 事件溯源 ──────── §4 Event Sourcing
    └── 异步模式 ──────── §5 CQRS/延迟/批量
```

## 工程师索引 (按职能精准跳转)

### 后端核心

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `Kotlin`, `Spring Boot`, `模块` | 后端架构师 | `backend.md` §3 | DDD 分层/Controller/Service/Repository |
| `构建`, `Gradle`, `依赖` | 后端架构师 | `backend.md` §2 | 多模块构建/依赖管理 |
| `事务`, `Transaction`, `UseCase` | 后端架构师 | `backend.md` §5 | 事务边界/回滚/嵌套事务 |
| `JUnit`, `测试`, `Testcontainers` | 后端架构师 | `backend.md` §6 | 单元/集成/E2E 测试规范 |
| `配置`, `profiles`, `环境` | 后端架构师 | `backend.md` §7 | 多环境配置/密钥注入 |

### 数据层

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `PostgreSQL`, `Schema`, `迁移`, `Flyway` | 数据架构师 | `data.md` §2 | 表设计/索引/迁移策略 |
| `Redis`, `缓存`, `Session`, `锁` | 数据架构师 | `data.md` §3 | 缓存模式/分布式锁/Session |
| `Kafka`, `事件`, `Topic` | 数据架构师 | `data.md` §4 | 事件驱动数据流 |
| `OpenSearch`, `搜索`, `全文` | 数据架构师 | `data.md` §5 | 全文搜索/索引同步 |
| `ClickHouse`, `报表`, `OLAP` | 数据架构师 | `data.md` §6 | 分析型查询/数仓 |
| `一致性`, `CAP`, `最终一致` | 数据架构师 | `data.md` §7 | 跨存储数据一致性 |

### 安全层

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `登录`, `认证`, `OAuth2`, `JWT` | 安全架构师 | `security.md` §2 | 认证流程/Token 管理 |
| `权限`, `RBAC`, `授权`, `L1-L4` | 安全架构师 | `security.md` §3 | 4 级安全模型/角色矩阵 |
| `密钥`, `Vault`, `Secret` | 安全架构师 | `security.md` §4 | 密钥轮换/注入/加密 |
| `加密`, `TLS`, `哈希` | 安全架构师 | `security.md` §5 | 传输加密/静态加密 |
| `审计`, `合规`, `SOX` | 安全架构师 | `security.md` §6 | 审计日志/合规检查 |
| `CORS`, `CSRF`, `速率限制` | 安全架构师 | `security.md` §7 | API 安全防护 |

### 接口层

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `REST`, `API 设计`, `HTTP 状态码` | 集成工程师 | `integration.md` §1 | RESTful 设计/错误码规范 |
| `OpenAPI`, `Swagger`, `DTO` | 集成工程师 | `integration.md` §2 | 契约自动生成/文档化 |
| `版本`, `breaking change` | 集成工程师 | `integration.md` §3 | 版本策略/升级规则 |
| `第三方`, `SDK`, `熔断`, `重试` | 集成工程师 | `integration.md` §4 | 外部 API 封装/降级 |
| `Webhook`, `回调`, `验签` | 集成工程师 | `integration.md` §5 | Webhook 接收/幂等 |
| `契约测试`, `Pact`, `diff` | 集成工程师 | `integration.md` §6 | 前后端契约保护 |

### 消息层

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `同步异步`, `消息选型` | 消息工程师 | `messaging.md` §1 | 场景判断: HTTP vs MQ |
| `Kafka`, `Topic`, `Producer` | 消息工程师 | `messaging.md` §2 | Topic 设计/Producer/Consumer |
| `Saga`, `幂等`, `死信`, `Outbox` | 消息工程师 | `messaging.md` §3 | 长事务/去重/可靠投递 |
| `事件溯源`, `重放` | 消息工程师 | `messaging.md` §4 | Event Sourcing 模式 |
| `CQRS`, `延迟消息`, `批量` | 消息工程师 | `messaging.md` §5 | 读写分离/异步模式 |

## 域内协调规则

```
执行顺序 (有依赖时):
  1. 数据架构师 — Schema/迁移先行 (data.md §2)
  2. 后端架构师 — 业务逻辑 + API (backend.md §3)
  3. 安全架构师 — 权限 + 审计日志 (security.md §2-§3)
  4. 集成工程师 — API 契约文档发布 (integration.md §2)
  5. 消息工程师 — 异步事件 (如需要) (messaging.md §2-§3)

如果任务只涉及其中一个: 直接加载该工程师 SOP, 不需要读其他。

跨域场景:
  - 需要前端对接 → 先定义 API 契约 (integration.md §2)
  - 需要性能优化 → 联动平台工程域 (performance.md)
```

## L3 工具 (域级推荐)

| 场景 | 工具 | 路径 | 何时加载 |
|------|------|------|---------|
| 后端代码审查 | ECC: Review §3 | `warehouse/tools/everything-claude-code/01-agents-review.md` | N+1/未验证输入/缺超时 |
| 编码规范 | ECC: Rules §1 | `warehouse/tools/everything-claude-code/02-rules-hooks.md` | 不可变性/错误处理/文件组织 |
| TDD 流程 | ECC: Testing | `warehouse/tools/everything-claude-code/02-rules-hooks.md` | RED→GREEN→REFACTOR |
| Spec 模板 | Anthropic Skills | `warehouse/tools/anthropic-skills/01-spec-template.md` | API Spec 文档格式 |

---

*Version: 2.0.0 — 职能细分 (5 工程师 × 精准 section 索引)*
