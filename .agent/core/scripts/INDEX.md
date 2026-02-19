---
name: scripts-index
description: core/scripts/ 脚本目录索引。Use when 需要查找某个脚本的用途、触发条件或引用位置。
---

# Scripts 目录索引

> **共 36 个脚本。按功能分类，标注引用位置与触发条件。**

---

## Hooks 层（平台触发）

| 脚本 | 触发时机 | 引用位置 |
|------|---------|---------|
| `hook-pretool.sh` | 工具调用前 | `rules/common.md §10.1` |
| `hook-posttool.sh` | 工具调用后 | `rules/common.md §10.1` |
| `hook-stop.sh` | Agent 停止时 | `rules/common.md §10.1` |

---

## 文档门禁（交付前必跑）

| 脚本 | 用途 | 触发条件 | 引用位置 |
|------|------|---------|---------|
| `agent-doc-audit.sh` | 检查 .agent 文档引用完整性（无悬空指针） | 交付前 / build.md §8 | `guard.md §8`, `qa-auditor.md §X` |
| `artifact-lifecycle-audit.sh` | 审计 artifact 生命周期合规性 | 任务完成时 | `qa-auditor.md`, `project-structure.md §6` |
| `artifact-trash-purge.sh` | 清理过期 tmp/trash 文件 | 健康检查时 | `project-structure.md §6.3` |
| `delivery-gate-format-audit.sh` | 检查 PM 交付物格式 | 交付前 | `project-manager.md` |

---

## 角色输出格式检查

| 脚本 | 用途 | 引用位置 |
|------|------|---------|
| `cto-format-audit.sh` | 检查 CTO 工单输出格式 | `chief-engineer.md` |
| `engineer-format-audit.sh` | 检查工程师完成报告格式 | 工程师 SOPs |
| `guard-format-audit.sh` | 检查 Guard 审查报告格式 | `guard.md` |
| `qa-format-audit.sh` | 检查 QA 审计报告格式 | `qa-auditor.md` |
| `ship-format-audit.sh` | 检查发布就绪报告格式 | `ship.md` |
| `learn-format-audit.sh` | 检查 learn 入库报告格式 | `learn.md` |

---

## 质量门禁

| 脚本 | 用途 | 引用位置 |
|------|------|---------|
| `qa-gate.sh` | QA 自动化门禁（Build/Test/Security/Diff） | `qa-auditor.md §2` |
| `acceptance-audit.sh` | 验收矩阵检查（验收标准逐条对照） | `qa-gate.sh` L201 |
| `no-guess-audit.sh` | 反猜测审计（检查 Agent 禁止猜测规则） | `qa-gate.sh` L215 |
| `scope-audit.sh` | 范围审计（检查超范围修改） | `qa-gate.sh` L191 |
| `scope-contract-audit.sh` | 范围合约合规检查 | `qa-gate.sh` L189 |
| `qa-gate-chunk.sh` | QA 门禁分块版（大项目局部检查） | `qa-gate.sh` 变体 |
| `refactor-equivalence-audit.sh` | 重构等价性验证（前后行为一致） | `guard.md §2` |
| `security-extra-audit.sh` | SAST/密钥/SBOM/许可证扫描 | `guard.md §3` |
| `safe-exec.sh` | 安全终端执行（超时保护，反死循环） | `guard.md §7` |

---

## 记忆与知识库

| 脚本 | 用途 | 引用位置 |
|------|------|---------|
| `memory-dedupe-audit.sh` | ERROR-BOOK/PROJECT-MEMORY 去重检查 | `memory.md §3.7` |
| `library-ingest.sh` | 知识库入库（/learn 工作流） | `learn.md §2` |
| `library-learn-wrapper.sh` | /learn 命令包装器（调用 ingest） | `learn.md §1` |
| `library-renew.sh` | 知识库增量更新 | `learn.md §3` |
| `library-resolve.sh` | 关键词路由解析 | `learn.md` |
| `library-dedupe-audit.sh` | 检测切片重复 | `learn.md` |
| `library-route-audit.sh` | 验证 catalog/index/meta 一致性 | `learn.md` |
| `context-budgeter.sh` | 上下文 Token 预算统计 | `memory.md §5` |

---

## 范围管理

| 脚本 | 用途 | 引用位置 |
|------|------|---------|
| `scope-contract-init.sh` | 初始化任务范围合约（TASK-SCOPE-XXX） | `chief-engineer.md` |
| `task-state.sh` | 任务状态查询/更新 | `build.md`, `memory.md §1` |

---

## 框架评估工具

| 脚本 | 用途 | 引用位置 |
|------|------|---------|
| `kernel-eval-harness.sh` | 框架整体评估（调用 kernel-audit-json） | `environment-check.md` |
| `kernel-audit-json.sh` | Kernel 审计 JSON 格式化输出 | `kernel-eval-harness.sh` L43 |

---

## ⚠️ 待整合脚本

| 脚本 | 状态 | 建议 |
|------|------|------|
| `anthropic-alignment-audit.sh` | 雏形，未被任何工作流引用 | 待完善后整合至 `guard.md §3`，或删除 |

---

## 配置文件

| 文件 | 用途 |
|------|------|
| `qa-timeout-profile.env` | QA 门禁超时配置（各阶段超时时间） |

---

*Version: 2.0.0*
*Updated: 2026-02-19*
