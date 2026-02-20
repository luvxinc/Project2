---
name: context-engineering
sources:
  - "#7 Effective Context Engineering for AI Agents — 2025-09-29"
  - "#8 Introducing Contextual Retrieval — 2024-09"
---

# L3 上下文工程 — 注意力管理与检索增强

---

## 核心定义

> "Context Engineering = 策划和维护 LLM 推理时最优 Token 集合的策略集。"

**Context Engineering ≠ Prompt Engineering**
- Prompt Engineering = 如何措辞指令
- Context Engineering = 什么信息进入上下文, 怎么排列, 保持多少, 何时丢弃

---

## Context Rot (上下文腐化)

### 根因
- Transformer 注意力 O(n²) — 每个旧 Token 干扰新 Token 的注意力分配
- 模型主要在短序列上训练, 长距离依赖参数更少
- 注意力预算有限, 每个新 Token 都在消耗

### 症状
- Agent 开始复读已废弃的模式
- 更容易重犯已修正的错误
- 长会话末尾工作质量下降

### 治疗
1. 阶段完成后 Compact (保留结论, 丢弃过程)
2. 不保留失败尝试在 context 中
3. 用文件系统持久化, 而非 context 积累
4. 定期从干净状态重启

---

## JIT 加载 (Just-In-Time)

```
反模式: 任务开始时一次性读取所有相关文件
正确: 遇到需要 → 搜索 → 读取需要的 section → 解决 → 继续
```

**Claude Code 实现**: glob + grep 按需检索文件, 绕过过时索引和复杂语法树。
**关键**: 维护轻量标识 (文件路径/查询/链接), 运行时动态加载。

---

## Progressive Disclosure (渐进披露)

```
Level 1: 元数据层 (几行) — 文件名/描述/何时加载/路由表
Level 2: 摘要层 (几十行) — SOP 核心步骤/规则表格
Level 3: 完整实现层 (按需) — 代码模板/配置示例
```

**决策流**: 读 L1 路由 → 判断相关? → 读 L2 SOP → 需要实现? → 读 L3 模板

---

## Context Budget (上下文预算)

**核心**: 最小高信号 Token 集 > 越多越好

| 策略 | 做法 |
|------|------|
| 从最小开始 | 最好的模型 + 最少的 prompt, 基于失败模式迭代增加 |
| 工具结果清理 | 深层历史中的工具输出可安全移除 |
| 合适的高度 | 系统 prompt 介于死板 if-else 和模糊指导之间 |
| 结构化标记 | XML tag / Markdown header 分隔不同信息块 |
| Few-shot 精选 | 多样的典型示例 > 穷举边界情况 |

---

## Compaction (压缩) 策略

### 保留 vs 丢弃
```
保留: 最终决策和结论 / 当前任务状态 / 错误模式和已知陷阱
丢弃: 失败尝试的完整过程 / 废弃代码草稿 / 中间讨论 / 大型工具输出
```

### Claude Code 实现
消息历史传给模型做摘要, 压缩后继续 + 最近访问的 5 个文件。

### 调优原则
1. 先最大化 Recall (捕获所有相关信息)
2. 迭代提升 Precision (消除多余内容)

---

## 长任务技巧

| 技巧 | 原理 | 适用场景 |
|------|------|---------|
| **结构化笔记** | Agent 定期写笔记到外部文件, 后续重新引入 | 迭代开发, 有明确里程碑 |
| **子代理架构** | 专门子代理处理聚焦任务, 返回精简摘要 | 复杂研究/分析, 可并行 |
| **Compaction** | 保留结论丢弃过程, 重新初始化 | 大量来回讨论 |

**子代理经济学**: 每个子代理探索数万 Token, 但只返回 1,000-2,000 Token 摘要。

---

## Contextual Retrieval (上下文检索)

### 传统 RAG 的问题
分块后丢失上下文: "公司收入增长 3%" — 哪家公司? 哪个季度? 3% 基于什么?

### 解决方案
在嵌入前为每个块预置解释性上下文 (50-100 Token):

```
原始: "The company's revenue grew by 3% over the previous quarter."
增强: "This chunk is from an SEC filing on ACME corp's Q2 2023; previous quarter revenue was $314M. The company's revenue grew by 3% over the previous quarter."
```

### 两个子技术
| 技术 | 原理 | 擅长 |
|------|------|------|
| **Contextual Embeddings** | 预置上下文后做嵌入 | 语义相似度 |
| **Contextual BM25** | 预置上下文后做词汇匹配 | 精确匹配 (Error code TS-999) |

### 性能数据 (Top-20 检索失败率)
| 方法 | 失败率 | 降低 |
|------|--------|------|
| 基线 | 5.7% | — |
| Contextual Embeddings | 3.7% | 35% |
| + Contextual BM25 | 2.9% | 49% |
| + Reranking | 1.9% | **67%** |

**成本**: Prompt Caching 下 $1.02/百万文档 Token (一次性)。

---

*与我们框架的对应:*
- Context Rot → SKILL.md 规则 8 (已对齐)
- JIT 加载 → SKILL.md 规则 5 (已对齐)
- Progressive Disclosure → SKILL.md 规则 9 + 三级架构 (已对齐)
- Context Budget → SKILL.md Token 预算表 (已对齐)
- Compaction → /compact 建议 + memory.md 清理 (已对齐)
- Contextual Retrieval → 无 RAG 系统 (当前项目不需要, 但原理可用于 /learn 工具)
