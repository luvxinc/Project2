---
name: architecture-gate-template
description: 架构合规门禁模板。项目使用时复制到 {project}/reference/architecture-gate.md 并填入具体规则。
---

# 架构合规门禁（通用模板）

> **真相源**: `{project}/reference/architecture-gate.md`（此文件是 L1 模板，L4 才是执行文件）
> **用途**: 所有工作流（build/guard/ship）共享的架构合规入口

---

## 使用方式

1. 复制本文件到 `.claude/projects/{project}/reference/architecture-gate.md`
2. 替换所有 `{placeholder}` 为项目具体值
3. 在 `CONTEXT.md §4 全局约束` 中引用此门禁文件

---

## 文档索引（在 L4 文件中填写）

| 文档 | 用途 |
|------|------|
| `{project}/reference/{architecture}.md` | 技术栈/架构规范/API规范/数据库/SLA（主文件） |
| `{project}/data/audits/BASELINE-{arch}-audit.md` | 架构 GAP 基线报告 |
| `{project}/reference/{testing-strategy}.md` | 测试策略 |

---

## 架构合规铁律（在 L4 文件中填写项目规则）

| 规则 | 不合规后果 |
|------|----------|
| `{RULE_1}` | Block |
| `{RULE_2}` | Block |
| `{RULE_3}` | Warning |

**规则设计原则：**
- Block 级：偏离会导致数据错误/安全漏洞/无法部署的规则
- Warning 级：偏离会导致质量下降但不会直接破坏功能的规则

---

## 各工作流合规重点（在 L4 文件中填写）

| 工作流 | 关注重点 |
|--------|---------|
| **build** | {build_focus} |
| **guard** | {guard_focus} |
| **ship** | {ship_focus} |

---

*Version: 1.0.0 — L1 通用模板，不含项目特定规则*
*Created: 2026-02-19*
