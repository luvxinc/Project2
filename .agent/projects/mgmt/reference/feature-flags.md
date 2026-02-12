---
description: 功能开关 — 灰度发布, A/B 测试, 快速回滚, V2/V3 迁移切换
---

# 功能开关 (Feature Flags)

> **技术选型**: **Unleash** (开源, 自托管) 或 **Flagsmith** (开源)
> **核心用途**: 灰度发布、快速回滚、V2/V3 流量切换
> **权威规范**: `core/skills/infrastructure.md`

---

## 1. 用途矩阵

| 场景 | 说明 | Flag 类型 |
|------|------|-----------|
| **灰度发布** | 新模块先对 10% 用户开放 | Percentage Rollout |
| **A/B 测试** | 对比两种 UI 方案 | Experiment |
| **快速回滚** | 不需重新部署, 关闭 flag 即可 | Release Toggle |
| **V2/V3 迁移** | 按模块切换流量 | Ops Toggle |
| **环境差异** | Dev 开启实验功能, Prod 关闭 | Environment |
| **权限控制** | 特定用户/角色才能用的功能 | User Targeting |

---

## 2. Flag 命名规范

```
{module}.{feature}.{variant}

示例:
  purchase.new-approval-flow.enabled      # 新审批流程
  vma.ai-smart-fill.enabled              # AI 智能填充
  migration.v3-sales-module.enabled      # V3 销售模块切换
  ui.dark-mode-v2.enabled               # 新版暗黑模式
  global.maintenance-mode.enabled        # 全局维护模式
```

---

## 3. Spring Boot 集成

### 3.1 依赖

```kotlin
// build.gradle.kts
implementation("io.getunleash:unleash-client-java:9.x.x")
```

### 3.2 配置

```yaml
# application.yml
unleash:
  app-name: mgmt-erp
  instance-id: ${HOSTNAME}
  api-url: http://unleash:4242/api
  api-token: ${UNLEASH_API_TOKEN}
  environment: ${SPRING_PROFILES_ACTIVE}
```

### 3.3 使用

```kotlin
@Service
class FeatureFlagService(private val unleash: Unleash) {

    fun isEnabled(flag: String): Boolean =
        unleash.isEnabled(flag)

    fun isEnabled(flag: String, userId: String): Boolean =
        unleash.isEnabled(flag, UnleashContext.builder().userId(userId).build())
}

// Controller 中使用
@GetMapping("/api/v1/purchase/orders")
fun listOrders(): ResponseEntity<*> {
    return if (featureFlags.isEnabled("purchase.new-approval-flow.enabled")) {
        purchaseServiceV2.listOrders()  // 新流程
    } else {
        purchaseService.listOrders()    // 旧流程
    }
}
```

### 3.4 前端集成

```tsx
// React Hook
import { useFlag } from '@unleash/proxy-client-react';

function PurchaseModule() {
    const newApprovalFlow = useFlag('purchase.new-approval-flow.enabled');

    return newApprovalFlow
        ? <NewApprovalFlow />
        : <LegacyApprovalFlow />;
}
```

---

## 4. V2 → V3 迁移中的 Feature Flags

```
migration.v3-auth.enabled          → V3 认证模块就绪后开启
migration.v3-users.enabled         → V3 用户模块就绪后开启
migration.v3-products.enabled      → V3 产品模块就绪后开启
migration.v3-vma.enabled           → V3 VMA 模块就绪后开启
migration.v3-purchase.enabled      → V3 采购模块就绪后开启
migration.v3-sales.enabled         → V3 销售模块就绪后开启
migration.v3-inventory.enabled     → V3 库存模块就绪后开启
migration.v3-finance.enabled       → V3 财务模块就绪后开启
```

API Gateway 根据 flag 路由流量:
```
if flag ON  → route to Spring Boot (V3)
if flag OFF → route to NestJS (V2)
```

---

## 5. Flag 生命周期管理

| 阶段 | 动作 |
|------|------|
| 创建 | 开发者创建 flag, 默认 OFF |
| 测试 | Dev/Staging 环境开启测试 |
| 灰度 | Prod 环境开启 10% → 50% → 100% |
| 全量 | 100% 流量走新逻辑 |
| 清理 | 删除 flag + 清理代码中的条件分支 (≤ 30 天) |

> **铁律**: 全量发布后 30 天内必须清理 flag 代码, 防止累积技术债。

---

*Version: 1.0.0 — 2026-02-11*
