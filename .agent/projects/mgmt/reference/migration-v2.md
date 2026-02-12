---
description: V2 NestJS → V3 Spring Boot 模块迁移 — 逐模块对照 + 兼容期规则
---

# V2 → V3 模块迁移

> **核心原则**: V2 NestJS 持续运行, 逐模块切换, 前端零感知, 数据零丢失。
> **权威规范**: `core/skills/data.md` + `core/skills/infrastructure.md`

---

## V2 模块现状 (真实代码)

### 后端模块 (`apps/api/src/modules/`)

| V2 模块 | 文件数 | 核心功能 | 复杂度 |
|---------|--------|----------|--------|
| **auth** | 25 | JWT 登录/登出/刷新, bcrypt 密码, L0-L4 安全码验证(SecurityPolicyService), PermissionsGuard, RolesGuard, SecurityLevelGuard | ★★★★★ |
| **users** | 7 | CRUD, 角色分配, 权限配置(JSONB), 单设备登录 | ★★★ |
| **roles** | 4 | 角色 CRUD, 权限模板 | ★★ |
| **products** | 7 | SKU CRUD, COGS 批量更新, BarcodeService (PDF 条码) | ★★★ |
| **logs** | ~12 | 4 表日志 (AuditLog, BusinessLog, AccessLog, ErrorLog), 异步缓冲写入, AlertService (Gmail SMTP) | ★★★★ |
| **vma** | 39 | 已拆分为 5 个子模块 (下方展开) | ★★★★★ |

### VMA 子模块

| 子模块 | Service 大小 | 核心功能 |
|--------|-------------|----------|
| VmaEmployeesModule | 19.6KB | 员工 CRUD, 多部门分配 (多对多), 批量 duty 分配 |
| VmaTrainingModule | 31.5KB | SOP 文档管理, 版本控制, 培训记录生成, PDF 批量打印 |
| VmaInventoryModule | 26.7KB | append-only ledger (收货/出库/回库/使用/移样品), 收货批次, 收货检验 |
| VmaClinicalModule | 17.7KB | 临床案例管理, Case ID 自动生成 (UVP-{Site}-{Patient}), SmartFill 智能填充(30KB!) |
| VmaSiteModule | 1.2KB | 站点 CRUD |

### 公共基础设施 (`apps/api/src/common/`)

| 模块 | 功能 | V3 对应 |
|------|------|---------|
| prisma/ | PrismaService (数据库) | Spring Data JPA |
| redis/ | CacheService (缓存) | Spring Cache + Redis |
| logging/ | LogWriterService (异步4表写入) | SLF4J + Loki (日志) + AuditTrail (审计) |
| alert/ | AlertService (Gmail SMTP 安全告警) | Alertmanager + Slack/PagerDuty |
| guards/ | JwtAuthGuard, PermissionsGuard, RolesGuard, SecurityLevelGuard | Spring Security Filter Chain |
| decorators/ | @RequireSecurityLevel, @CurrentUser | @SecurityLevel 自定义注解, @AuthenticationPrincipal |
| filters/ | 全局异常过滤器 | @ControllerAdvice + @ExceptionHandler |
| interceptors/ | 日志拦截器 | Spring AOP @Around |
| middleware/ | 请求日志中间件 | Spring Filter / HandlerInterceptor |

---

## 迁移顺序 (依赖关系)

```
Phase 1: auth → users/roles (基础, 所有模块依赖)
Phase 2: logs (横切关注点, 所有模块需要审计)
Phase 3: products (独立业务, 相对简单)
Phase 4: vma (最复杂, 5 个子模块)
```

---

## 每个模块的迁移步骤

### Step 1: 分析 V2 NestJS 代码

```
读取:
- {module}.module.ts       → 理解依赖关系
- {module}.controller.ts   → 理解 API 路径和参数
- {module}.service.ts      → 理解业务逻辑
- dto/                     → 理解请求/响应格式
- guards/decorators 使用    → 理解安全要求
```

### Step 2: 创建 V3 Kotlin 模块

参考 `build/kotlin-module.md` 创建 DDD 模块结构。

### Step 3: JPA Entity 映射到现有 PG 表

**关键: V2 和 V3 共用同一个 PostgreSQL, 表已存在, JPA Entity 必须精确映射。**

```kotlin
// V2 Prisma: model User { id @id @default(uuid()) ... @@map("users") }
// V3 JPA:
@Entity @Table(name = "users")
class UserEntity(
    @Id val id: UUID,           // 已存在, 不自动生成
    @Column(unique = true) val username: String,
    @Column(name = "password_hash") val passwordHash: String,
    @Column(name = "display_name") val displayName: String?,
    @Enumerated(EnumType.STRING) val status: UserStatus,
    @Column(columnDefinition = "jsonb") val permissions: String,  // JSONB
    // ...
)
```

### Step 4: 保持 URL 一致

V2 API 前缀: `/api/v1/`。V3 Controller **必须保持完全一致**。

```
V2: GET  /api/v1/products         → V3: GET  /api/v1/products
V2: POST /api/v1/auth/login       → V3: POST /api/v1/auth/login
V2: GET  /api/v1/vma/employees    → V3: GET  /api/v1/vma/employees
```

### Step 5: 安全层迁移对照

| V2 NestJS | V3 Spring Boot |
|-----------|---------------|
| `@UseGuards(JwtAuthGuard)` | `SecurityFilterChain` 全局 JWT 验证 |
| `@UseGuards(RolesGuard)` + `@Roles('admin')` | `@PreAuthorize("hasRole('ADMIN')")` |
| `@UseGuards(SecurityLevelGuard)` + `@RequireSecurityLevel('L2')` | `@SecurityLevel(2)` 自定义注解 + AOP |
| `@UseGuards(PermissionsGuard)` | `@PreAuthorize("hasAuthority('module.users.list.read')")` |
| SecurityPolicyService (L0-L4, DB 验证 bcrypt hash) | 保持相同逻辑, 改用 Kotlin 实现 |

**关键**: V2 安全码存在 `security_codes` 表中 (bcrypt hash), V3 必须读取同一张表, 使用相同的验证逻辑。

### Step 6: Token 兼容

V2 JWT 结构:
```json
{
  "sub": "user-uuid",
  "username": "admin",
  "roles": ["superuser"],
  "permissions": ["module.users.list.read", ...],
  "iat": 1700000000,
  "exp": 1700003600
}
```

V3 Spring Security JWT Decoder **必须能验证 V2 发出的 Token**:
- 相同的 `JWT_SECRET` (从 .env / Vault)
- 相同的 claims 解析方式
- 迁移期双向兼容

### Step 7: 流量切换 (API Gateway)

```
V2 运行: localhost:3001/api/v1/*
V3 运行: localhost:8080/api/v1/*
前端:    localhost:3000 → 代理到 API

阶段 1: 前端 → V2 (100%)
阶段 2: 前端 → Gateway → V3 auth/users (100%) + V2 其余 (100%)
阶段 3: 前端 → Gateway → V3 (100%)
阶段 4: 停掉 V2 NestJS
```

### Step 8: 验证

- [ ] API 响应格式与 V2 完全一致 (JSON 结构/字段名)
- [ ] 安全码验证通过 (L1-L4)
- [ ] JWT Token 双向兼容
- [ ] 数据库操作正确 (共用同一个 PG)
- [ ] 日志系统工作 (审计/业务/访问)
- [ ] 前端无需修改任何代码

---

## 特殊注意: VMA SmartFill

VMA 的 `smart-fill.service.ts` (30KB) 是全系统最复杂的业务逻辑, 包含:
- 临床案例智能填充
- 产品规格自动匹配
- 库存余量动态计算

迁移此服务时需要:
1. 完整的单元测试覆盖 (输入→输出 对照)
2. 集成测试 (Testcontainers + 真实数据子集)
3. 双跑验证 (V2 和 V3 并行, 比较输出)

---

## 禁止事项

- ❌ 禁止删除 V2 NestJS 代码, 直到该模块 V3 验证通过 + 14 天冷却
- ❌ 禁止修改现有 PG 表结构 (用 Flyway 新增字段可以, 删改不行)
- ❌ 禁止在 V3 中使用不同的 JWT Secret
- ❌ 禁止在 V3 中使用不同的 API 路径前缀
