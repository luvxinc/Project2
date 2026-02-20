---
name: tool-design
sources:
  - "Anthropic: Advanced Tool Use for Agents — 2025-11-24"
  - "Anthropic: Writing Tools for Agents — 2025-09-11"
  - "Anthropic: Agent Skills — 2025-10"
---

# 工具设计原则 — Tool Design for Agents

---

## Tool Search Tool（工具搜索工具）

**核心思想**: 不要把所有工具文档都塞进 context，而是暴露一个"搜索工具"让 Agent 按需获取工具文档。

**工作机制**:
```
传统模式 ❌:
  初始 context = [tool1 full doc] + [tool2 full doc] + ... + [toolN full doc]
  → 工具越多，context 越大，即使大多数工具在本次任务中不需要

Tool Search Tool 模式 ✅:
  初始 context = tool_search 工具（轻量）
  Agent 需要某工具时: tool_search("database operations") → 返回相关工具文档
  → 只有真正用到的工具文档进入 context
```

**数据**: 节省 **85%** 工具调用 Token（Anthropic 内部测试）

**在我们框架中的对应**: SKILL.md 的路由表 + Progressive Disclosure 三层架构

---

## Programmatic Tool Calling（程序化工具调用）

**思想**: 让 Agent 在一次工具调用中批量处理多个操作，而不是循环调用。

**示例**:
```
反模式 ❌: for item in list: read_file(item)  # N 次工具调用
正确模式 ✅: read_files(items)                 # 1 次工具调用
```

**数据**: 减少 **37%** Token（通过减少工具调用次数）

**相关**: 并行工具调用（同时发起多个独立操作）

---

## 工具命名原则

| 原则 | 好 | 坏 |
|------|----|----|
| 语义化 | `search_documents(query)` | `sd(q)` |
| 动词清晰 | `create_customer` | `customer` |
| 范围明确 | `search_emails_by_date` | `search` |
| 无缩写 | `list_files` | `ls` |

**重要**: 工具名 = Agent 的认知词汇，语义化命名让 Agent 更容易正确调用。

---

## Agent Skills = Package Manager 范式

**来源**: Anthropic 2025-10 "Building Agent Skills"

**思想**:
- Skills 就像 npm packages — 可安装、可版本化、可组合
- 每个 Skill = 一个专业能力模块（security / data / frontend / ...）
- Skill 之间通过路由表连接，不互相依赖

**Skill 设计规范**:
```yaml
---
name: skill-name
description: 一句话描述。Use when {触发场景}。
---

# Skill 名称

## 路由表
| 关键词 | 跳转 |
|--------|------|

## §1 ...
## §2 ...
```

**关键原则**:
- description 是路由决策依据，必须清晰
- frontmatter 是轻量的 Level 1（不需要读完整文件就能路由）
- 每个 section 独立可加载（不要每次读整个文件）

---

## 工具设计 9 原则（Anthropic 2025-09-11）

1. **工具应该完整** — 工具要能完成完整任务，不要留一半
2. **最小副作用** — 工具执行不应有隐藏的状态变更
3. **幂等性** — 多次调用相同工具，结果相同
4. **失败明确** — 工具失败应该有清晰的错误信息
5. **权限最小化** — 工具只请求完成任务所需的权限
6. **可观测性** — 工具的执行应该可被监控、审计
7. **语义化命名** — 名称要描述做什么，不是怎么做
8. **单一职责** — 每个工具只做一件事
9. **文档驱动** — 工具文档即合约，描述输入/输出/失败场景

---

*Version: 1.0.0 — Anthropic 2025-09 ~ 2025-11*
