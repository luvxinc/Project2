# MGMT ERP — 项目约定

> **MGMT 特有的技术约定。泛化工程规范在 `core/skills/` 中。**

---

## 1. 日志四表架构 (V2)

| 表 | 用途 | 写入频率 |
|----|------|----------|
| `access_logs` | API 访问日志 | 每次请求 |
| `business_logs` | 业务操作日志 | 写操作时 |
| `error_logs` | 错误/异常日志 | 异常时 |
| `audit_logs` | 安全审计日志 | 敏感操作时 |

> V3 将迁移到 OTel + Prometheus + Loki, 但 PG 审计表保留用于合规。

---

## 2. i18n 规范

| 约定 | 值 |
|------|-----|
| 库 | `next-intl` |
| 主要语言 | English + 中文 |
| 越南语 (VI) | **只在 VMA 模块维护**, 其他模块自动 fallback 到 EN (铁律 R5) |
| 命名空间 | 按模块划分 (`users`, `products`, `vma`, ...) |
| 公共命名空间 | `common` (按钮/状态/确认等通用文本) |
| 注入规则 | 子组件必须通过 props 接收 `t()` 或独立 `useTranslations` |
| 文件位置 | `packages/shared/i18n/locales/{lang}/{namespace}.json` |
| 新建模块 | 只需创建 `en/` + `zh/`, **不需要** `vi/` (VI 自动走 EN) |

---

## 3. 主题约定

| 约定 | 值 |
|------|-----|
| 设计风格 | Apple iOS/macOS |
| 主题引擎 | `ThemeContext.tsx` (语义化) |
| CSS 变量 | 全局 Token (见 `core/workflows/ui.md`) |
| 暗色模式 | 强制支持 |
| 毛玻璃 | `backdrop-filter: blur(20px)` |
| 厂商 Logo | 例外协议 — TruValve/P-Valve 使用原始 PNG |

---

## 4. 密码/安全码策略

> ⚠️ 生产环境密码和安全码不允许在代码中硬编码。
> 存储在数据库中, 受 L4 保护。

| 项目 | 管理方式 |
|------|----------|
| 用户密码 | bcrypt hash, 数据库存储 |
| L1-L4 安全码 | 数据库 `security_codes` 表 |
| 密码重置 | 仅 Superuser 通过 L4 操作 |
| 锁定策略 | Redis 计数器, 5 次失败锁定 15 分钟 |

---

## 5. 代码组织约定

| 约定 | V2 (当前) | V3 (目标) |
|------|----------|----------|
| 后端入口 | `apps/api/src/` | `apps/api-v3/src/` |
| 前端入口 | `apps/web/src/` | `apps/web/src/` (保留) |
| 共享包 | `packages/shared/` | `packages/shared/` (保留) |
| Schema | `prisma/schema/` | `db/migration/` |
| Agent 配置 | `.claude/` | `.claude/` (本文件所在) |

---

## 6. 铁律清单

| 编号 | 铁律 | 严重级 |
|------|------|--------|
| R0 | **数据保护**: 任何可能导致数据库数据丢失的操作, 禁止自动执行 | 🔴 |
| R1 | **太平洋时区**: 全项目 `America/Los_Angeles` | 🔴 |
| R2 | **最小修改**: 只修用户要求的, 超出范围先问 | 🔴 |
| R3 | **身份保护**: 不允许更改项目品牌/Logo/名称 | 🔴 |
| R4 | **日志优先**: 所有写操作必须有审计日志 | 🟡 |
| R5 | **越南语 Fallback**: VI 只在 VMA 模块维护, 其他 VI→EN | 🔴 |
| R6 | **Agent 行为**: 遵循 `core/skills/agent-mastery.md` 验证循环 | 🟡 |

---

*MGMT ERP Project Spec — Last Updated: 2026-02-11*
