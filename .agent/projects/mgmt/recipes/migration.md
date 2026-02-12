# 菜谱: V2→V3 迁移

> **L1 食材 → MGMT 迁移的烹饪指南**
> **Phase 7 启动时加载本菜谱**

---

## 1. 迁移全景

```
V2 (NestJS + Prisma)  ──→  V3 (Kotlin/Spring Boot + JPA/Flyway)
                       │
                       │  前端保持不变 (Next.js 16)
                       │  数据库保持不变 (PostgreSQL)
                       │  只换后端框架
```

### 核心原则

| 原则 | 说明 |
|------|------|
| **前端不动** | Next.js 通过 OpenAPI 契约与后端解耦, 后端换掉前端无感 |
| **数据库共用** | V2 和 V3 共用同一 PG, Prisma schema 导出为 Flyway 基线 |
| **模块逐个切** | 不做 Big Bang, 一个模块一个模块迁移 |
| **并行运行** | V2 NestJS 和 V3 Spring Boot 可同时运行一段时间 |
| **灰度切换** | API Gateway 做流量 10% → 50% → 100% |

---

## 2. 用 L1 食材的方式

### backend.md → V3 后端搭建

| L1 泛化 | MGMT 具体用法 |
|---------|-------------|
| Kotlin + Spring Boot | `apps/api-v3/`, 包: `com.mgmt.erp` |
| Spring Modulith | 模块: auth → users → logs → products → vma |
| DDD 分层 | VMA 用完整版 (domain/application/infrastructure/api) |
| 事务管理 | `@Transactional` 替代 Prisma `$transaction` |
| 批处理 | Spring Batch 替代手写 ETL (Sales 大批量) |

### data.md → 数据迁移

| L1 泛化 | MGMT 具体用法 |
|---------|-------------|
| Flyway | `V1__baseline.sql` = Prisma schema pg_dump |
| PostgreSQL | 保留 V2 现有 PG (不换数据库) |
| Redis | 保留 V2 现有 Redis (Session + 锁定) |
| Kafka | V3 新增 — 模块间事件解耦 (→ `reference/kafka-design.md`) |
| OpenSearch | V3 新增 — 订单/SKU 全文搜索 (→ `reference/search-analytics.md`) |

### infrastructure.md → 部署

| L1 泛化 | MGMT 具体用法 |
|---------|-------------|
| Docker | V3 API 多阶段构建: Gradle builder → JRE alpine |
| Kubernetes | V3 部署到 K8s (V2 目前是 Docker 单机) |
| Terraform | V3 基础设施代码化 |
| CI/CD | GitHub Actions: 构建 + 测试 + 推镜像 + K8s 部署 |

---

## 3. 迁移顺序

```
Priority: Auth → Users → Logs → Products → VMA → Purchase → Sales → Inventory → Finance
```

| 顺序 | 模块 | 原因 | 复杂度 | 参考 |
|------|------|------|--------|------|
| 1 | Auth | 基础依赖 | ★★ | — |
| 2 | Users | RBAC 核心 | ★★★ | `recipes/security.md` |
| 3 | Logs | 横切关注点 | ★★ | — |
| 4 | Products | 核心实体, 相对独立 | ★★★ | — |
| 5 | VMA | 最复杂的业务模块 | ★★★★ | `recipes/vma.md` |
| 6+ | 辅助模块 | Purchase/Sales/Inventory/Finance | ★★★ | — |

---

## 4. Prisma → Flyway 关键步骤

```bash
# 1. 导出当前 PG schema
pg_dump --schema-only -d mgmt_erp > V1__baseline.sql

# 2. 配置 Flyway
# application.yml
spring:
  flyway:
    baseline-on-migrate: true
    baseline-version: 1
    locations: classpath:db/migration

# 3. 后续变更只写新迁移
# V2__add_employee_duties_table.sql
# V3__create_kafka_outbox.sql
```

---

## 5. 陷阱和注意事项

| 陷阱 | 说明 | 怎么避免 |
|------|------|----------|
| **Prisma 枚举** | Prisma Enum → PG Enum, JPA 映射需要 `@Enumerated(EnumType.STRING)` | 逐个检查 Enum 映射 |
| **日期时区** | Prisma DateTime 默认 UTC, Spring Boot 需要显式配置 PST | `reference/conventions.md` R1 |
| **JSON 字段** | Prisma `Json` 类型 → JPA 需要自定义 converter | 用 `@Type(JsonType::class)` |
| **软删除** | V2 没有统一软删除, V3 可以用 `@Where` + `@SQLDelete` | 迁移时统一加 |

---

*Migration Recipe v1.0 — Phase 7 启动时使用*
