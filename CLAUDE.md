# MGMT ERP

医疗器械企业级管理系统。V3 (Kotlin/Spring Boot + Next.js) 是唯一运行栈。V2 不存在——禁止引用。

## Agent 框架

核心入口：@.claude/core/SKILL.md
项目上下文：@.claude/projects/mgmt/CONTEXT.md
已知陷阱：@.claude/projects/mgmt/data/errors/ERROR-BOOK.md

## 铁律（始终生效）

- **R0 数据保护**: DROP/TRUNCATE/DELETE/migrate reset 禁止自动执行，必须先确认
- **R1 太平洋时区**: 所有日期 `America/Los_Angeles`，后端日期加 `T12:00:00.000Z`
- **R2 最小修改**: 只改用户要求的，禁止顺手修整。需扩范围先征得确认

完整铁律（含 R5-R7 项目特定规则）：@.claude/projects/mgmt/reference/iron-laws.md

## 技术栈

- 后端: Kotlin 2.0 / Spring Boot 3.3 / JVM 21 / PostgreSQL 16 / Redis / Flyway
- 前端: Next.js 16 (App Router) / React 19 / TailwindCSS 4 / shadcn/ui
- 国际化: next-intl 4 (EN/ZH/VI) · 架构: DDD 分层 · 包管理: pnpm 10 + Turborepo

## 入口

| 命令 | 用途 | 何时用 |
|------|------|--------|
| `/start` | PM 分诊 → 路由到子工作流 | 首次交互，不确定用哪个命令 |
| `/team` | 蜂群模式 — Lead + Workers 并行 | 跨域大任务（≥2 域 + 可并行） |

## 工作流

| 命令 | 用途 |
|------|------|
| `/build` | 功能开发全生命周期 |
| `/guard` | Bug 修复 / 调试 / 事故响应 |
| `/ship` | 部署 / CI-CD / 发布 |
| `/ui` | 前端设计 / 主题 / 动画 |
| `/migrate` | V1→V3 忠实迁移 |
| `/vma` | VMA 模块开发 |

## 工具

| 命令 | 用途 |
|------|------|
| `/review` | 代码审查（注入 git diff） |
| `/qa-gate` | 6 阶段质量门禁 |
| `/env-check` | 环境预检 |
| `/error-book` | 查看/搜索错题本 |
| `/status` | 项目状态概览 |
| `/learn` | 学习外部知识库 |
