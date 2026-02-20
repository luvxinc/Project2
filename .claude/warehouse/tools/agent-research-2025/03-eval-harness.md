---
name: eval-harness
sources:
  - "Anthropic: Demystifying Agent Evals — 2026-01-09"
  - "Anthropic: Effective Harnesses for Agent Testing — 2025-11-26"
  - "Anthropic: Building a C Compiler with Claude — 2026-02-05"
---

# Eval 与 Harness 架构

---

## Eval 指标：pass@k 与 pass^k

### 定义

| 指标 | 定义 | 用法 |
|------|------|------|
| **pass@1** | 单次通过 | 标准验收（我们日常用的） |
| **pass@k** | k 次中至少 1 次通过 | 探索性任务 / 功能验证 |
| **pass^k** | k 次全部通过 | 生产稳定性 / 关键路径 |

### 选择规则

```
新功能开发:
  pass@1 → 验证能做到
  pass@3 → 验证不是偶然

关键业务路径:
  pass^3 → 3 次独立运行全部 PASS = 稳定性信号
  pass^5 → 更高置信度

Bug 修复验证:
  pass@1 → 验证修了
  pass^k (k=3+) → 验证没有回归
```

### Harness 隔离要求

> "Each evaluation trial must run in complete isolation. Shared state between trials pollutes results and makes pass@k meaningless."

```
每次 Eval 必须:
  ✅ 独立数据库状态（不共享 test DB）
  ✅ 独立文件系统（不共享工作目录）
  ✅ 独立环境变量
  ✅ 清理上一次运行的副作用
  ❌ 禁止跨 trial 共享任何状态
```

---

## Harness 架构（Dual-Agent 双 Agent 设计）

**来源**: Anthropic 2025-11-26 "Effective Harnesses"

**问题**: 单 Agent 执行长任务容易 context rot，也难以追踪进度和恢复。

**解决方案**: 双 Agent 架构

```
┌─────────────────────────────────────────────────────┐
│  Harness（任务框架）                                  │
│                                                      │
│  ┌──────────────┐         ┌──────────────────────┐  │
│  │ Initializer  │         │   Coding Agent       │  │
│  │ Agent        │         │                      │  │
│  │              │ init.sh │  执行具体任务          │  │
│  │ 解读任务 →   ├────────►│  写 progress.txt     │  │
│  │ 准备环境 →   │         │  git commit 每步     │  │
│  │ 生成 init.sh │         │  读 progress.txt     │  │
│  └──────────────┘         │  从断点继续           │  │
│                            └──────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**关键机制**:
1. `init.sh` — 环境准备脚本（由 Initializer 生成，Coding Agent 执行）
2. `progress.txt` — 任务状态文件（跨会话恢复的关键）
3. `git commit` — 每个步骤完成后提交（提供回滚点 + 进度记录）

**在我们框架中的对应**:
- Initializer Agent ≈ CTO（任务分解 + 环境检查）
- Coding Agent ≈ 各工程师（具体执行）
- progress.txt ≈ TRACKER.md
- init.sh ≈ environment-check.md 通过的前提条件

---

## Eval 设计原则

```
好的 Eval 是:
  ✅ 快速 — 几分钟内运行完（不是几小时）
  ✅ 确定性 — 相同输入相同输出（非随机）
  ✅ 隔离 — 每次独立，无副作用
  ✅ 可观测 — 失败有清晰错误信息

坏的 Eval 是:
  ❌ 慢 — 每次 30+ 分钟
  ❌ 脆 — 偶尔失败但没有规律
  ❌ 依赖外部 — 需要实际 API / 网络
  ❌ 黑盒 — 失败了不知道为什么
```

---

## C 编译器案例（Anthropic 2026-02）

**结论**: 复杂 Agent 任务（1000+ 步骤、跨会话）的成功关键：

1. **Harness 而非单次提示** — 任务切分成可验证的步骤
2. **测试驱动** — 每个步骤都有对应测试
3. **进度持久化** — progress.txt 让 Agent 知道从哪继续
4. **失败重试策略** — 不是重试同一命令，而是 LOOP_BREAK + 替代路径

---

*Version: 1.0.0 — Anthropic 2025-11 / 2026-01 / 2026-02*
