---
name: long-task-collaboration
sources:
  - "#9 Effective Harnesses for Long-Running Agents — 2025-11-26"
  - "#10 How We Built Our Multi-Agent Research System — 2025-06-13"
  - "#11 Code Execution with MCP — 2025-11"
---

# L4 长任务协作 — Harness、多 Agent、MCP

---

## Dual-Agent Harness (双 Agent 架构)

### 核心问题
长任务跨多个 context window, 每个新 session 从零开始, 没有前序记忆。

### 解决方案

```
┌──────────────────────────────────────────────┐
│  Initializer Agent (仅首次 session)           │
│  - 解读任务 → 准备环境 → 生成 init.sh        │
│  - 创建 feature_list.json (200+ 验证项)      │
│  - 初始 git commit                           │
├──────────────────────────────────────────────┤
│  Coding Agent (后续每个 session)              │
│  - pwd → 读 progress.txt → 读 git log       │
│  - 选最高优先级未完成功能                      │
│  - 执行 init.sh → 基础 E2E 测试              │
│  - 一个功能/session → commit → 更新 progress │
└──────────────────────────────────────────────┘
```

### 关键机制
| 机制 | 作用 |
|------|------|
| `init.sh` | 环境准备脚本 (Initializer 生成, Coding Agent 执行) |
| `claude-progress.txt` | 跨会话恢复的状态文件 |
| `feature_list.json` | 可验证的功能清单 (`passes: true/false`) |
| `git commit` | 每步完成后提交 = 回滚点 + 进度记录 |

### 四大失败模式与应对

| 失败模式 | Initializer 预防 | Coding Agent 预防 |
|---------|-----------------|------------------|
| 过早宣布胜利 | 200+ 项功能清单 | 自验证后才标 `passes: true` |
| 进度未记录 | 写 git repo + progress | 读 progress + 跑基础测试 + commit |
| 功能过早标完 | 详细验证步骤 | Puppeteer 真实 E2E 验证 |
| 重复 setup 开销 | 生成 init.sh | session 开始执行 init.sh |

---

## Multi-Agent 研究系统 (Orchestrator-Worker)

### 架构
```
Lead Agent (Orchestrator)
  ├── 分析查询 → 扩展思考 → 持久化计划
  ├── 生成 3-5 个 Subagent (并行执行)
  ├── 每个 Subagent: 目标 + 输出格式 + 工具指导 + 任务边界
  ├── 收集结果 → 判断是否需要更多轮次
  └── 综合交付
```

### 8 条 Prompt Engineering 原则

| # | 原则 | 说明 |
|---|------|------|
| 1 | **像 Agent 一样思考** | Console 模拟逐步执行, 找失败模式 |
| 2 | **教会委托** | 明确目标/格式/工具/边界, 非模糊指令 |
| 3 | **按努力缩放** | 简单查找: 1 agent 3-10 调用; 复杂: 10+ subagent |
| 4 | **工具设计至关重要** | 差描述 → Agent 走完全错误的路径 |
| 5 | **自我改进** | 让 Claude 诊断 prompt 失败并建议改进 (40% 任务时间减少) |
| 6 | **先宽后窄** | 先宽泛查询 → 逐步聚焦, 非一开始就过于具体 |
| 7 | **引导思考** | 扩展思考作为可控暂存器; subagent 在工具结果后交错思考 |
| 8 | **并行工具调用** | 并行 subagent 生成 + 并行工具使用 → 复杂查询 90% 时间减少 |

### Token 经济学

| 模式 | Token 消耗 (相对 chat) |
|------|----------------------|
| 单次 chat | 1x |
| 单 Agent | ~4x |
| Multi-Agent | **~15x** |

**80% 性能方差由 Token 数量解释。** Multi-Agent + Opus Lead + Sonnet Workers 比单 Agent **提升 90.2%**。

### 何时值得
- 高价值任务 (15x Token 代价合理)
- 可并行的独立分支 (广度优先研究最佳)
- 信息超过单 context window
- 复杂工具接口需要并行探索

**不适合**: 编码任务 (可并行子任务少); 紧密耦合的工作。

### 早期错误案例
- 简单查询生成 50 个 subagent
- 无限搜索不存在的来源
- Agent 间过度更新互相干扰
- 选择 SEO 优化内容而非权威来源
- 缺乏任务边界导致重复搜索

---

## Code Execution with MCP

### 核心思想
将 MCP server 暴露为代码 API, Agent 写代码与工具交互, 数据在沙箱里流动。

### 架构
```
传统: Agent ←→ [工具定义全进 context] ←→ [结果全进 context] → Token 膨胀
Code Exec: Agent → 写代码 → [沙箱执行, 文件系统发现工具] → 只返回最终结果
```

### Token 节省案例
| 场景 | 传统 | Code Execution | 减少 |
|------|------|---------------|------|
| 读 Google Drive 转录 → 存 Salesforce | 150,000 tok | 2,000 tok | **98.7%** |
| 10,000 行表格过滤 | 全量进 context | 5 行结果 | >99% |

### 文件系统工具发现
```
servers/
├── google-drive/
│   ├── getDocument.ts    # 包装 MCP 调用
│   └── index.ts
├── salesforce/
│   ├── updateRecord.ts
│   └── index.ts
```

Agent 用 `ls ./servers/` 发现可用服务, 读具体文件了解 API。

### 安全特性
- 中间结果默认留在沙箱, 不进入模型 context
- PII 可在 MCP client 层自动脱敏
- Agent 写入 `./workspace/` 实现状态持久化
- 代码可保存为可复用 skill

---

*与我们框架的对应:*
- Dual-Agent → CTO (Initializer) + 工程师 (Coding Agent); TRACKER.md = progress.txt (已对齐)
- Orchestrator-Worker → /team 蜂群 + File Claim Protocol (已对齐)
- 8 条 Prompt 原则 → build.md §2 任务分配 + team.md 委托协议 (已对齐)
- MCP Code Execution → 无等效实现 (可作为 L4 进阶评估)
- Token 经济学 → SKILL.md Token 预算表 (已对齐)
