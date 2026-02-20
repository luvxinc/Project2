---
name: backend
description: 后端架构师 SOP（DDD + 企业级架构）。Use when 需要设计或修改后端模块、API、事务、测试与配置。
---

# 后端规范（企业级 DDD 架构）

> **你是后端架构师。你的职责是: 设计+实现后端业务模块、API 接口、事务管理、数据持久化。**
> **技术栈: 读 `CONTEXT.md §3` 确认当前后端框架/语言/ORM/迁移工具。禁止假设。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `技术栈`, `技术选型`, `框架确认` | → §1 后端技术栈 |
| `gradle`, `依赖`, `构建` | → §2 构建系统 |
| `模块`, `DDD`, `领域`, `entity`, `service`, `controller` | → §3 模块结构 |
| `security`, `认证`, `JWT` | → §4 Security 配置 |
| `事务`, `transaction`, `回滚` | → §5 事务管理 |
| `测试`, `test`, `mock` | → §6 测试规范 |
| `配置`, `yml`, `application` | → §7 配置管理 |

---

> **企业级后端最佳实践: DDD 分层, 声明式事务, 结构化并发。技术栈见 `CONTEXT.md §3`。**
> **本文件是泛化模板。项目特定的模块列表/业务规则请参考 `.claude/projects/{project}/` 目录。**

---

## 1. 后端技术栈（读 CONTEXT.md §3）

> **🔴 技术栈选型由项目决定，不在此文件硬编码。**
> 1. 读 `CONTEXT.md §3` → 确认后端语言/框架/ORM/迁移工具
> 2. 所有代码按 CONTEXT.md 指定的技术栈编写
> 3. 架构原则（DDD 分层、声明式事务、类型安全）是跨技术栈通用的

### 通用架构原则（技术栈无关）

| 原则 | 标准 |
|------|------|
| **DDD 分层** | domain → application → infrastructure → api（Controller 不写业务逻辑） |
| **事务管理** | 所有写操作显式事务边界，避免跨服务事务 |
| **Null 安全** | 强类型语言利用编译期 null 检查，弱类型语言显式验证 |
| **不可变值对象** | DTO/VO 不可变，Domain Entity 通过方法变更状态 |
| **声明式安全** | 权限注解/守卫在 API 层声明，不在 Service 层硬编码 |
| **审计日志** | 所有写操作记录 traceId + userId + IP |

---

## 2. 构建系统

> **构建工具与命令**: 见 `CONTEXT.md §3 后端技术栈` + `CONTEXT.md §5 工具命令速查`。
> **项目具体构建配置（如 Gradle DSL / Maven POM / Cargo.toml）**: 见 `{project}/reference/impl-patterns-backend.md §8`。

### 2.1 通用依赖分类

| 依赖类别 | 说明 | 具体库名 |
|---------|------|---------|
| Web 框架 | HTTP 请求处理、路由 | 见 CONTEXT.md §3 |
| ORM/持久化 | 数据库访问层 | 见 CONTEXT.md §3 |
| 安全框架 | 认证授权 | 见 CONTEXT.md §3 |
| API 文档 | OpenAPI/Swagger | 见 CONTEXT.md §3 |
| 消息中间件 | 事件/队列 | 见 CONTEXT.md §3 |
| 缓存 | 内存/分布式缓存 | 见 CONTEXT.md §3 |
| 测试 | 单元 + 集成 + 容器化 | 见 CONTEXT.md §3 |

---

## 3. 模块结构详解

### 3.1 模块化架构

> **框架选择**: 见 `CONTEXT.md §3`（如 Spring Modulith / NestJS Module / Go Package 等）

每个业务域是一个独立模块，包/目录遵循 `{root}.modules.{module}` 格式:

| 模块类型 | 路径模式 | 典型示例 |
|----------|---------|----------|
| **核心模块** | `modules/auth` | 认证 (OAuth2/OIDC/JWT) |
| **核心模块** | `modules/users` | 用户 + 角色 + 权限 (RBAC) |
| **业务模块** | `modules/{domain}` | 按领域划分 (产品/订单/库存...) |
| **支撑模块** | `modules/logs` | 审计日志 + 错误日志 + 告警 |

> **项目的具体模块列表在 `.claude/projects/{project}/overview.md` 中定义。**

### 3.2 四层结构模板 (DDD)

> **具体实现代码**: 见 `{project}/reference/impl-patterns-backend.md §10`

```
// 四层 DDD 结构（伪代码，具体语法见 CONTEXT.md §3）

// ① Domain Layer — 零框架依赖
Entity Product { id, sku, status }
  method activate() → copy(status = ACTIVE)
ValueObject ProductId(uuid)
Interface ProductRepository { findById(id); save(product) }
DomainEvent ProductCreated(product)

// ② Application Layer — 用例编排（声明式事务 + 领域事件发布）
@Transactional
UseCase CreateProduct(repo, eventPublisher):
  execute(command) → repo.save(...) → eventPublisher.emit(ProductCreated)

// ③ Infrastructure Layer — ORM 实现（隔离框架依赖）
ORM_Entity products_table { id: UUID PK, sku: STRING UNIQUE, ... }
RepositoryImpl → 实现 Domain 层 Repository 接口

// ④ API Layer — Controller / Handler（输入验证 + 响应包装）
POST /api/v1/products → validate(body) → useCase.execute(body) → ApiResponse
```

**分层规则**（跨技术栈通用）：

| 规则 | 说明 |
|------|------|
| Domain 不依赖框架 | Domain Layer 只使用语言原生类型 |
| Controller 不写业务 | Controller/Handler 只做验证+委托 |
| Infrastructure 实现接口 | 通过 Repository 接口解耦 ORM |
| Application 编排事务 | @Transactional 只在 UseCase 层 |

---

## 4. 安全配置

> **框架选择**: 见 `CONTEXT.md §3 安全框架`
> **具体实现代码**: 见 `security.md` + `{project}/reference/impl-patterns-backend.md §1`

```
// 安全配置模式（伪代码）

SecurityConfig:
  - CSRF: 禁用（API-only，使用 Token 认证）
  - CORS: 配置允许的域名
  - 公开端点: /auth/login, /auth/refresh, /health
  - 认证端点: /api/** → 需要有效 JWT
  - 管理端点: /admin/** → 需要 SUPERUSER 角色
  - JWT 验证: 使用 OIDC issuer URI（见 CONTEXT.md §3）
  - 异常处理: 自定义 401/403 响应格式
```

---

## 5. 事务管理模式

> **具体实现代码**: 见 `{project}/reference/impl-patterns-backend.md §11`

```
// 事务管理原则（伪代码）

// ✅ 正确: 事务边界在 UseCase 层
@Transactional
UseCase ProcessPurchaseOrder:
  1. 查找 PO（不存在则抛异常）
  2. 更新 PO 状态 → 已接收
  3. 入库操作（同一事务）
  4. 生成财务凭证（同一事务）
  → 任一步骤失败 = 全部回滚

// ✅ 独立事务场景
@Transactional(REQUIRES_NEW)
AuditLogService.log(event):
  → 即使主事务回滚，审计日志也必须保留
```

**通用事务规则**：

| 规则 | 说明 |
|------|------|
| 事务在 Application 层 | 不在 Controller 层，不在 Repository 层 |
| 避免跨服务事务 | 跨服务用事件驱动（最终一致性），不用分布式事务 |
| 只读操作标记 readOnly | 提升性能，防意外写入 |
| 审计日志独立事务 | 主事务回滚时审计记录仍需保留 |

---

## 6. 测试规范

> **具体测试框架与代码**: 见 `{project}/reference/impl-patterns-backend.md §12`

| 测试类型 | 工具（见 CONTEXT.md §3） | 覆盖目标 | 要求 |
|----------|------------------------|----------|------|
| **单元测试** | 见 §3 测试框架 | Domain + UseCase | ≥80% 覆盖率 |
| **集成测试** | 容器化测试工具 | Repository + API | 核心路径 100% |
| **契约测试** | API 契约工具 | API 不破坏 | 所有公开 API |
| **架构测试** | 分层约束工具 | DDD 分层约束 | 100% 通过 |

**架构测试规则**（跨技术栈通用）：

```
Rule 1: Domain 层不依赖框架（无 ORM/Web 框架 import）
Rule 2: Controller/Handler 不直接访问 Repository（必须经 UseCase）
Rule 3: Infrastructure 不被 Domain 反向依赖
```

---

## 7. 配置管理

> **项目具体配置项与值**: 见 `{project}/reference/impl-patterns-backend.md §9`

**通用配置分类**（跨技术栈适用）：

| 配置类别 | 关注点 | 最佳实践 |
|---------|--------|---------|
| ORM 配置 | lazy loading 陷阱、DDL 模式、批量操作 | 关闭 eager loading，DDL = validate only |
| 连接池 | 最大连接数、超时、泄漏检测 | 按部署 Pod 数 × 并发量计算 |
| 监控端点 | 暴露范围、认证保护 | 只暴露 health + metrics + info |
| 链路追踪 | 采样率（dev vs prod） | dev = 100%, prod = 10% |
| 消息队列 | 消费者偏移量策略 | earliest（不丢消息）vs latest（低延迟）|
| 安全认证 | JWT issuer、Token 有效期 | 通过环境变量注入，不硬编码 |

---

---

*Version: 3.0.0 — L1 全量泛化：§3-§7 所有 Kotlin/Spring 代码替换为伪代码 + CONTEXT.md §3 引用*
*Updated: 2026-02-19*
