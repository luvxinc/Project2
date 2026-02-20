---
name: agent-mastery
description: Agent 行为优化 SOP。Use when 需要渐进检索、上下文加载纪律和执行习惯优化。
---

# Agent 行为精通

> 🔴 编码规范/验证循环/反模式已迁移到 `core/rules/` 目录（强制规则）。本文件保留 Agent 行为优化。

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `验证`, `检查` | → `core/rules/common.md` §5 验证循环 |
| `检索`, `搜索`, `查找` | → §1 渐进检索 |
| `编码`, `规范` | → `core/rules/common.md` §1 代码风格 |
| `上下文`, `按需加载` | → §2 加载纪律 |
| `错误`, `卡死`, `进程` | → §3 错误/进程管理 |
| `学习`, `经验` | → `skills/continuous-learning.md` |

---

## 1. 渐进检索 (Iterative Retrieval)

用 4 阶段循环逐步精炼上下文，最多 3 轮：

| 阶段 | 行为 | 标准 |
|------|------|------|
| **DISPATCH** | 广泛搜索候选文件 | grep + find 扫描目标模块 |
| **EVALUATE** | 评估相关性 (0-1 分) | ≥ 0.7 保留，< 0.2 排除 |
| **REFINE** | 发现缺失，调整搜索 | 加入新关键词/路径 |
| **LOOP** | 重复（最多 3 轮） | 3 个高相关优于 10 个平庸 |

检索轮次：第 1 轮目标模块 + 相关 Skill → 第 2 轮依赖模块 + 共享类型 → 第 3 轮测试/迁移约束。

---

## 2. 加载纪律

> **按需加载，不重复读取。只加载当前所需，完成后不再引用。**

规则：
- 每次任务最多加载 2 个 Skill 文件
- 优先读 SKILL.md 索引，再按指引加载具体 Skill
- 不得一次性加载所有 Skills

分阶段加载：需求 → PM SOP → 分配 → CTO SOP + 域索引 → 执行 → 工程师 SOP → 审核 → QA SOP → 交付 → PM 交付 section。

| 信号 | 行动 |
|------|------|
| 对话轮次 > 20 | 检查是否需要保存检查点（`skills/handoff.md`） |
| 同一文件被读 > 2 次 | 保存关键点到检查点 |
| 上下文 > 70% | 准备保存检查点 |
| 上下文 > 85% | 立即保存，结束会话 |

---

## 3. 错误处理与进程管理

错误处理：禁止静默吞异常；禁止 catch-all 不记日志；用户侧友好消息，服务端记详细堆栈；使用结构化错误码。

| 进程信号 | 判定 | 行动 |
|---------|------|------|
| 命令运行 > 30s 无输出 | 可能卡死 | Terminate + 重新执行 |
| 命令运行 > 60s（非编译） | 确认卡死 | Terminate + 重新执行 |
| `command_status` 连续 3 次 RUNNING 无输出 | 确认卡死 | Terminate + 重新执行 |

恢复流程：Terminate → 等 1s → 重新执行相同命令 → 再次卡死则拆分为小命令。

### Auto-Run 策略 (SafeToAutoRun)

> 只有涉及数据库数据丢失/生产环境变更才需要用户确认。

| 操作类型 | SafeToAutoRun |
|----------|:-------------:|
| 只读命令（ls/cat/grep/find） | ✅ |
| 创建/删除文档、源码文件 | ✅ |
| 编译/测试命令 | ✅ |
| SQL 写操作（INSERT/UPDATE/DELETE） | ❌ |
| DROP TABLE / TRUNCATE | ❌ |
| 生产服务器操作 | ❌ |
| 安装系统级依赖 | ❌ |

---

## 4. Skill Seekers

本地路径：`/Users/aaron/Library/Python/3.12/bin/skill-seekers`
核心命令：`skill-seekers -u <URL>` 将文档/网页转为 AI Skill。
详细参考：`warehouse/tools/skill-seekers/01-commands-modules.md`

---

*Version: 3.0.0 — Phase 1 瘦身 (释放伪概念删除 + 持续学习外迁 + 压缩)*
*Updated: 2026-02-19*
