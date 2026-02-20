---
name: tool-mastery
sources:
  - "#3 Advanced Tool Use — 2025-11-24"
  - "#4 Writing Tools for Agents — 2025-09-11"
  - "#5 The Think Tool — 2025-03-20"
  - "#6 Agent Skills — 2025-10"
---

# L2 工具能力 — 工具设计、Think、Skills

---

## Tool Search Tool (按需发现)

**原理**: 不预加载所有工具文档, 而是暴露一个轻量搜索工具, Agent 按需获取。

```
传统: 初始 context = [tool1 完整文档] + ... + [toolN 完整文档] → Token 膨胀
Tool Search: 初始 context = tool_search 工具 (~500 tok) → 按需加载 → 85% Token 节省
```

**实现**: 工具标记 `defer_loading: true`, 高频工具保持 `defer_loading: false`。
**性能**: Opus 4 准确率 49%→74%; Opus 4.5 准确率 79.5%→88.1%。

---

## Programmatic Tool Calling (程序化工具调用)

**原理**: Agent 写代码编排工具调用, 中间结果在沙箱环境处理, 只返回最终结果给模型。

```
传统: 20 个团队成员 × 20 份报表 = 2000 行数据全进 context
程序化: 代码在沙箱过滤 → 只返回 2-3 个违规者 → 37% Token 减少
```

**适用场景**: 大数据集聚合, 3+ 依赖工具调用, 需要预过滤, 并行操作。

---

## Tool Use Examples (工具使用示例)

**原理**: JSON Schema 只定义结构, 无法表达使用模式。提供具体调用示例教会模型正确用法。

```json
"input_examples": [
  {"title": "Login page 500 error", "priority": "critical", "labels": ["bug"]},
  {"title": "Add dark mode support", "labels": ["feature-request"]}
]
```

**效果**: 复杂参数处理准确率 72%→90%。
**最佳实践**: 1-5 个示例/工具, 用真实数据, 展示最小/部分/完整模式。

---

## 工具设计 9 原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **完整性** | 工具完成完整任务, 不留一半 |
| 2 | **最小副作用** | 无隐藏状态变更 |
| 3 | **幂等性** | 多次调用结果相同 |
| 4 | **失败明确** | 清晰可操作的错误信息 |
| 5 | **权限最小化** | 只请求所需权限 |
| 6 | **可观测性** | 可监控、审计 |
| 7 | **语义化命名** | `search_documents` > `sd` > `tool_1` |
| 8 | **单一职责** | 每个工具只做一件事 |
| 9 | **文档驱动** | 描述即合约: 输入/输出/失败场景 |

---

## 工具描述最佳实践

| 做法 | 原因 |
|------|------|
| 合并细粒度操作为高层工具 | `schedule_event` > `list_users` + `list_events` + `create_event` |
| 实现搜索/过滤而非返回全量 | `search_contacts` > 返回 1000 条 |
| 命名空间化 | `asana_projects_search` 避免与 `jira_search` 混淆 |
| 返回语义化标识 | `name` > `uuid`; 减少幻觉 |
| 实现 response_format 参数 | `DETAILED` vs `CONCISE` 节省 ~2/3 Token |
| 可操作的错误信息 | 引导 Agent 正确重试而非重复错误 |

**关键发现**: Claude Sonnet 3.5 在 SWE-bench 达到 SOTA, 关键是"工具描述的精确改进"。

---

## Think Tool (停下来想一想)

### 定义
```json
{
  "name": "think",
  "description": "Use the tool to think about something. It will not obtain new information or change the database, but just append the thought to the log.",
  "input_schema": {
    "properties": {"thought": {"type": "string"}},
    "required": ["thought"]
  }
}
```

### 何时使用 Think vs Extended Thinking

| 用 Think Tool | 用 Extended Thinking |
|--------------|---------------------|
| 复杂顺序工具链 | 非顺序单次/并行工具调用 |
| 策略重型环境 (需详细合规验证) | 直接指令跟随 |
| 需要分析前序工具输出再行动 | 编码/数学/物理问题 |
| 错误会累积的顺序决策 | 简单推理任务 |

### 性能数据
- 航空域: **54% 相对提升** (结合优化 prompt)
- 零售域: 即使无 prompt 优化也有提升
- SWE-Bench: 1.6% 平均提升 (统计显著 p<.001)

### 关键: pass^k 衡量一致性
pass^k = k 次全部通过的概率。客服等需要可靠性的场景用 pass^k 而非 pass@k。

---

## Agent Skills (技能封装)

### 架构
```
my-skill/
├── SKILL.md       # 必需: 指令 + YAML 元数据
├── scripts/       # 可选: 辅助脚本
├── examples/      # 可选: 参考实现
└── resources/     # 可选: 模板/资源
```

### 渐进披露三层
| 层级 | 加载内容 | Token 代价 |
|------|---------|-----------|
| L1 | name + description (元数据) | 几十 Token |
| L2 | 完整 SKILL.md | 数百~千 Token |
| L3 | 关联文件 (scripts/resources) | 按需 |

### 核心原则
- **description 决定加载**: 描述不好 = 永远不被发现
- **自包含**: 所有依赖在 Skill 文件夹内
- **单一职责**: 一个 Skill 做一件事
- **代码双重身份**: 既是可执行工具, 也是参考文档

---

*与我们框架的对应:*
- Tool Search Tool → SKILL.md 路由表 + 三级渐进加载 (已对齐)
- Programmatic Calling → 无直接等效 (可评估)
- Tool Use Examples → rules/ 中的反模式示例 (部分对齐)
- Think Tool → 无显式机制 (可在关键决策点集成)
- Agent Skills → .claude/skills/ 14 个 Skill (已对齐)
