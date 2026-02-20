---
name: context-engineering
source: Anthropic Engineering Blog — 2025-09-29
---

# Context Engineering — Agent 上下文设计原则

> **来源**: "Context Engineering for Agents" — Anthropic 2025-09-29

---

## 核心定义

> "Context is the only thing that determines what an AI can and cannot do in any given moment. It is the agent's entire world."

**Context ≠ Prompt Engineering**
- Prompt Engineering = 如何措辞
- Context Engineering = 什么信息放入上下文，怎么排列，保持多少

---

## Context Rot（上下文腐化）

**问题**:
- Transformer 注意力机制是 O(n²) 复杂度
- Context 中每一个旧 token 都会干扰新 token 的注意力分配
- 随着会话增长，早期错误信息/废弃代码/无关输出持续污染注意力

**症状**:
- Agent 开始复读已废弃的代码模式
- 更容易犯之前已修正过的错误
- 在长会话末尾工作质量下降

**治疗**:
```
1. 完成阶段后 Compact（保留结论，丢弃过程）
2. 不要将失败尝试保留在 context 中
3. 用文件系统持久化，而非 context 积累
4. 定期从干净状态重启
```

---

## JIT 加载（Just-In-Time Retrieval）

**原则**: 遇到需要时才加载，而不是预先加载所有可能需要的信息。

```
反模式 ❌: 任务开始时一次性读取所有相关文件
正确模式 ✅:
  遇到问题 → 搜索相关文件 → 读取需要的 section → 解决问题 → 继续
```

**优势**:
- 减少 context pollution
- 每个工具 SOP 只在真正需要时出现在 context 中
- Agent 的注意力集中在当前问题上

---

## Progressive Disclosure（渐进式披露）

三层架构：

```
Level 1: 元数据层（几行）
  - 文件名、描述、何时加载
  - 路由表（关键词 → 跳转位置）
  例: SKILL.md 的路由表、每个 Skill 的 frontmatter

Level 2: 摘要层（几十行）
  - SOP 的核心步骤
  - 规则表格
  - 不包含完整代码示例
  例: 各 Skill 的 § sections

Level 3: 完整实现层（按需）
  - 完整代码模板
  - 详细配置示例
  - 只在真正需要实现时加载
  例: MGMT reference/impl-patterns-*.md
```

**加载决策**:
1. 先读 Level 1（路由表）→ 判断是否相关
2. 相关 → 读 Level 2（按需 section）→ 判断是否需要实现
3. 需要实现 → 读 Level 3（完整模板）

---

## Context Budget（上下文预算）

**SKILL.md 中的预算表**:
| 路径类型 | 典型场景 | Token | 占 200K 窗口 |
|----------|---------|-------|----------|
| 最轻 | 简单问答 | ~1.7K | 0.8% |
| 典型 | 单域任务 | ~10-13K | 5-6% |
| 重型 | 全栈建设 | ~22K | 11% |
| 极端 | 全域全角色 | ~28K | 14% |

**预算纪律**:
- 单次加载上限 ≤ 30KB（~7.5K tok）
- 用完大文件 (>10KB) 释放上下文
- 不要因为"可能会用到"而加载文件

---

## Compaction 策略

当 context 变长时，Compact 的方式：

```
保留:
  ✅ 最终决策和结论
  ✅ 当前任务状态
  ✅ 已验证的代码（不要 context 积累，用文件持久化）
  ✅ 错误模式和已知陷阱

丢弃:
  ❌ 失败尝试的完整过程
  ❌ 已废弃的代码草稿
  ❌ 中间讨论过程
  ❌ 工具输出（特别是大型 diff 或日志）
```

---

*Version: 1.0.0 — Anthropic 2025-09-29*
