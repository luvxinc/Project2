---
name: platform
description: 平台工程 SOP。Use when 需要脚手架、代码生成、CLI、Feature Flag 或开发者效率治理。
---

# 平台工程 (Platform Engineering)

> **你是平台工程师。你的职责是: 构建+维护脚手架、代码生成、Feature Flag、技术债治理体系。**
> **大厂的核心竞争力不在语言, 在于内部平台效率。本 Skill 覆盖提升全员效率的工具和体系。**



## 路由表

| 关键词 | 跳转 |
|--------|------|
| `脚手架`, `模板`, `scaffold` | → §1 脚手架与模板 |
| `代码生成`, `OpenAPI`, `Entity` | → §2 代码生成 |
| `Feature Flag`, `开关`, `灰度` | → §3 Feature Flag |
| `技术债`, `重构`, `清理` | → §4 技术债治理 |
| `dev.sh`, `效率`, `Git Hook` | → §5 开发者效率工具 |
| `文档`, `CHANGELOG`, `Swagger` | → §6 内部文档平台 |
| `目录重组`, `重命名`, `迁移` | → §7 目录重组检查清单 |

---
---

## 1. 脚手架与模板

### 1.1 模块脚手架

```bash
# 一键生成后端模块骨架
./scripts/scaffold.sh new-module purchase-orders --type=ddd

# 自动生成:
modules/purchase-orders/
├── domain/
│   ├── model/PurchaseOrder.kt
│   ├── event/PurchaseOrderEvent.kt
│   └── repository/PurchaseOrderRepository.kt   (接口)
├── application/
│   ├── usecase/CreatePurchaseOrderUseCase.kt
│   └── dto/
│       ├── CreatePurchaseOrderCmd.kt
│       └── PurchaseOrderResponse.kt
├── infrastructure/
│   └── persistence/PurchaseOrderJpaRepository.kt
└── api/
    └── PurchaseOrderController.kt
```

### 1.2 前端页面脚手架

```bash
# 一键生成前端页面骨架
./scripts/scaffold.sh new-page purchase-orders --type=list

# 自动生成:
app/(dashboard)/purchase-orders/
├── page.tsx
├── columns.tsx
├── usePurchaseOrders.ts
└── components/
    ├── PurchaseOrderModal.tsx
    └── PurchaseOrderFilter.tsx
```

### 1.3 模板维护

> **⚠️ 以下模板为规划中。首次需要时由对应工程师创建, 创建后更新路径。**

| 模板类型 | 规划位置 | 维护者 | 状态 |
|----------|----------|--------|------|
| 后端模块 (简化版) | `warehouse/templates/backend-simple/` | 后端架构师 | 📋 待创建 |
| 后端模块 (DDD 版) | `warehouse/templates/backend-ddd/` | 后端架构师 | 📋 待创建 |
| 前端列表页 | `warehouse/templates/frontend-list/` | 前端架构师 | 📋 待创建 |
| 前端表单页 | `warehouse/templates/frontend-form/` | 前端架构师 | 📋 待创建 |
| Flyway 迁移 | `warehouse/templates/flyway/` | 数据架构师 | 📋 待创建 |
| 测试文件 | `warehouse/templates/test/` | QA | 📋 待创建 |


---

## 2. 代码生成

### 2.1 OpenAPI → TypeScript

```bash
# 从后端 OpenAPI Spec 生成前端客户端
npx openapi-typescript http://localhost:8080/v3/api-docs -o src/lib/api/schema.d.ts

# 自动得到:
# - 所有 DTO 类型
# - 所有 API 路径类型
# - 前端零手写 API 类型
```

### 2.2 数据库 → Entity

```bash
# 从现有数据库反向生成 ORM Entity（迁移用）
# 命令见 CONTEXT.md §5 工具命令速查（不同框架命令不同）

# 反向生成:
# - Entity 类 / Model 类
# - Repository 接口 / DAO 层
# - 基础的 DTO
```

### 2.3 生成规则

| 规则 | 说明 |
|------|------|
| **生成 ≠ 不可改** | 生成后可以手动修改 |
| **重新生成 = 覆盖** | 标记哪些文件是可覆盖的 |
| **类型安全** | 生成的代码必须通过编译 |

---

## 3. Feature Flag

### 3.1 基础实现

> **技术栈**: 见 `CONTEXT.md §3 后端技术栈`，按框架选用对应 Feature Flag 实现。

```
// 后端 Feature Flag 模式（伪代码，具体实现见 projects/{project}/reference/impl-patterns-*.md）
FeatureFlags {
  newInventoryUI: Boolean = false
  kafkaEnabled: Boolean = false
  v3AuthEnabled: Boolean = false
}

// 在 Controller / Handler 中使用
if features.newInventoryUI:
  return newProductService.listV2()
else:
  return productService.listV1()
```

### 3.2 前端 Feature Flag

```tsx
// Feature Flag Context
const FeatureContext = createContext<FeatureFlags>({});

function FeatureGate({ flag, children, fallback }: Props) {
  const features = useContext(FeatureContext);
  return features[flag] ? children : (fallback ?? null);
}

// 使用
<FeatureGate flag="newInventoryUI" fallback={<OldInventory />}>
  <NewInventory />
</FeatureGate>
```

### 3.3 Feature Flag 规则

| 规则 | 说明 |
|------|------|
| **有始有终** | Flag 上线后 → 验证 → 清理 Flag 代码 |
| **默认关闭** | 新 Flag 默认 false |
| **命名清晰** | `enableNewPaymentFlow`, 不要 `flag1` |
| **文档化** | 每个 Flag 有说明 + 预计移除日期 |

---

## 4. 技术债治理

### 4.1 技术债分类

| 类型 | 示例 | 优先级 |
|------|------|--------|
| **安全债** | 硬编码密钥, 缺少权限检查 | 🔴 立即修 |
| **架构债** | 循环依赖, 上帝类 | 🟡 Sprint 内修 |
| **代码债** | 重复代码, 命名不规范 | 🟢 择机修 |
| **测试债** | 缺少测试, 覆盖率低 | 🟡 逐步补 |
| **文档债** | 缺少注释, API 未文档化 | 🟢 择机补 |
| **依赖债** | 过期依赖, 安全漏洞 | 🟡 定期更新 |

### 4.2 技术债登记

格式 → `core/templates/tech-debt-template.md`。字段：ID、类型、优先级、发现日期、位置、描述、影响、修复方案、工作量(S/M/L)。

### 4.3 技术债治理节奏

| 节奏 | 行动 |
|------|------|
| 每个 Sprint | 预留 20% 时间还技术债 |
| 每月 | 技术债审计 (QA 主导) |
| 发布前 | 清理 🔴 级别技术债 |

---

## 5. 开发者效率工具

### 5.1 统一开发脚本

```bash
# dev.sh — 一键启动所有服务（命令见 CONTEXT.md §5 工具命令速查）
#!/bin/bash
case "$1" in
  start)    docker-compose up -d && {后端启动命令} ;;
  stop)     docker-compose down ;;
  reset)    docker-compose down -v && {DB迁移命令} ;;
  test)     {测试命令} ;;
  lint)     {后端Lint命令} ;;
  gen-api)  {OpenAPI生成命令} ;;
  scaffold) ./scripts/scaffold.sh "$@" ;;
  *)        echo "Usage: ./dev.sh {start|stop|reset|test|lint|gen-api|scaffold}" ;;
esac
# 所有 {占位符} 在 CONTEXT.md §5 中定义，与项目技术栈对应
```

### 5.2 Git Hooks

```bash
# .husky/pre-commit（命令见 CONTEXT.md §5）
#!/bin/sh
{后端Lint命令}   # 后端 lint（如 ./gradlew ktlintCheck / pylint / cargo fmt）
npx lint-staged  # 前端 lint（通用）
```

### 5.3 开发环境一致性

| 工具 | 用途 |
|------|------|
| **Docker Compose** | 统一 PG/Redis/Kafka 版本 |
| **.editorconfig** | 统一缩进/编码 |
| **.nvmrc** | 统一 Node 版本 |
| **Gradle Wrapper** | 统一 Gradle 版本 |

---

## 6. 内部文档平台

| 文档类型 | 位置 | 格式 |
|----------|------|------|
| **API 文档** | `/swagger-ui` (自动) | OpenAPI |
| **架构文档** | `.claude/core/skills/` | Markdown |
| **运维手册** | `.claude/core/workflows/` | Markdown |
| **项目文档** | `.claude/projects/{name}/` | Markdown |
| **变更日志** | `CHANGELOG.md` | Keep-a-Changelog |

---

## 7. 目录重组检查清单

> **⚠️ 常见错误 (来源: SV-001)**: 目录重组后未扫描跨文件引用, 导致 15 处断链。

任何涉及文件移动/重命名/删除的操作, **必须**在完成后执行:

```
[ ] 1. 列出所有被移动/重命名/删除的路径
[ ] 2. 用 grep 扫描整个 .claude/ 搜索旧路径
[ ] 3. 逐一修复为新路径
[ ] 4. 二次扫描确认 0 残留
[ ] 5. 检查索引文件 (README.md, CONTEXT.md, SKILL.md) 是否更新
```

**常见遗漏路径**:
- L1 Skills 中的模板路径 (如 `存储位置: warehouse/data/...`)
- Recipe 中引用的 reference 文件
- 交接协议中的检查点路径
- 脚注/注释中的旧路径

---

---

*Version: 2.1.0 — L1 泛化：移除 Kotlin Feature Flag 代码、./gradlew 命令，改为伪代码 + CONTEXT.md §5 引用*
*Updated: 2026-02-19*

