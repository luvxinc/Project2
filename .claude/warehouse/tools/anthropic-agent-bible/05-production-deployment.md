---
name: production-deployment
sources:
  - "#12 Demystifying Evals for AI Agents — 2026-01-09"
  - "#13 Beyond Permission Prompts — 2025-10"
  - "#14 Claude Code Best Practices — 2025"
  - "#15 A Postmortem of Three Recent Issues — 2025-09-17"
---

# L5 生产部署 — Evals、安全、最佳实践、失败案例

---

## Eval 体系 (#12 Demystifying Evals)

### 起步: 20-50 个真实失败任务

> "很多团队推迟 Eval 因为觉得需要数百个任务, 但 20-50 个来自真实失败的简单任务就是很好的开始。"

### Eval 组成

| 组件 | 说明 |
|------|------|
| **Tasks** | 定义输入 + 成功标准的测试用例 |
| **Trials** | 重复尝试 (因 LLM 非确定性) |
| **Graders** | 评分逻辑 (代码/模型/人工) |
| **Transcripts** | 完整交互记录 (诊断用) |

### pass@k vs pass^k

| 指标 | 定义 | 适用场景 |
|------|------|---------|
| **pass@k** | k 次中至少 1 次成功 | 探索性任务, 有一次成功即可 |
| **pass^k** | k 次全部成功 | 生产关键路径, 需要可靠性 |

pass@1 = 50% → 首次尝试一半能成功
pass^3 (75% per-trial) = 0.75³ ≈ 42% → 需要 3 次全对

### 三种 Grader

| 类型 | 优势 | 劣势 |
|------|------|------|
| **代码 Grader** | 快/便宜/确定/可调试 | 脆性, 不适合主观任务 |
| **模型 Grader** | 灵活/有细微感/可扩展 | 非确定/贵/需校准 |
| **人工 Grader** | 金标准/匹配专家判断 | 贵/慢/需专家 |

### 关键原则
- **评输出, 不评路径**: Agent 常发现设计者未预料的正确方法
- **实现部分计分**: 多组件任务不应非黑即白
- **Eval 毕业制**: 高通过率 Eval 从能力套件毕业到回归套件
- **pass@100 = 0% 通常是 Task 坏了, 不是 Agent 不行**

### Claude Code 的 Eval 演进
1. 快速迭代 (员工 + 外部用户反馈)
2. 窄行为 Eval (简洁性, 文件编辑)
3. 复杂行为 Eval (过度工程检测)
→ 有 Eval 的团队升级模型只需几天; 没有的需要几周

---

## 安全沙箱 (#13 Beyond Permission Prompts)

### 核心: OS 级隔离 > 权限提示

| 隔离维度 | 机制 | 工具 |
|---------|------|------|
| **文件系统** | Agent 只能访问/修改指定目录 | Linux bubblewrap, macOS seatbelt |
| **网络** | Agent 只能连接批准的服务器 | 同上 |

### 实现
- Anthropic 开源 `anthropic-experimental/sandbox-runtime` (Apache 2)
- 无需容器, 定义目录 + 网络白名单即可
- 可用于沙箱任意进程、Agent、MCP server

### 意义
从"每次操作都问权限"转向"定义安全边界后自主执行", 减少打断、提升效率。

---

## Claude Code 最佳实践 (#14)

### CLAUDE.md = Agent 的大脑
- 明确指令 + 项目约定 + 工作流偏好
- 不当聊天机器人用, 当"带工具的初级工程师"用

### 核心工作模式
```
明确上下文 → 小迭代 diff → 清晰反馈循环
```

### 具体建议
| 实践 | 说明 |
|------|------|
| `/clear` 常用 | 新任务清空历史, 不让旧 Token 吃额度 |
| Git 做安全网 | 每次大改前 commit, 随时可回滚 |
| 规划先于执行 | 复杂任务先让 Claude 拟计划, 确认后再写代码 |
| 自定义工具/命令 | 封装常用操作为 slash command |
| 积极管理 context | 不让无关信息积累 |

---

## Postmortem: 三个基础设施 Bug (#15)

### 时间线: 2025 年 8 月 5 日 — 9 月 18 日

| Bug | 原因 | 影响 | 教训 |
|-----|------|------|------|
| **#1 Context Window 路由错误** | Sonnet 4 请求被误路由到 1M context 服务器 | 峰值 16% 请求受影响; 30% Claude Code 用户至少 1 条降质 | Sticky routing 导致后续消息继续走错 |
| **#2 输出腐化** | TPU 服务器部署了错误的 token 生成配置 | 英文回复出现中/泰文字符 | 部署流水线缺少异常字符检测 |
| **#3 XLA:TPU Top-K 编译 Bug** | 近似 top-k 操作对特定 batch size 返回完全错误结果 | 行为不一致: 同 prompt 可能成功也可能失败 | 近似优化的隐患; debug 工具本身影响 Bug 行为 |

### 为什么 Eval 没抓到

1. **基准测试局限**: Claude 经常从孤立错误中恢复, Eval 没捕获用户报告的降质
2. **隐私约束**: 工程师无法访问用户交互来复现问题
3. **多平台噪声**: 不同平台不同症状不同频率 → 报告矛盾
4. **时间盲区**: 无法快速关联部署变更和观察到的降质

### 改进措施
1. 开发更可靠的"工作 vs 损坏"区分 Eval
2. **在真实生产系统上持续运行质量 Eval** (非仅部署前)
3. 构建隐私保护的社区反馈调试工具
4. 定制工具减少未来类似事件的修复时间

### 关键声明
> "我们从不因需求量、时间或服务器负载降低模型质量。用户报告的问题完全是基础设施 Bug 导致。"

---

## 核心公式

```
没有 Eval → 不要上线
Eval 没抓到 ≠ 没问题 → 需要持续生产监控
20-50 个真实失败 → 足够起步
pass^k → 衡量一致性, 不是运气
OS 级沙箱 → 安全边界定义一次, 自主执行
用户反馈 → 最终地面真相
```

---

*与我们框架的对应:*
- Eval 体系 → qa-auditor.md §2.8 (pass@k/pass^k 已集成; 自动化可加强)
- 安全沙箱 → settings.json + hook-pretool.sh (基础对齐; 可评估 sandbox-runtime)
- Claude Code 实践 → CLAUDE.md + memory.md + /compact (已对齐)
- Postmortem → ERROR-BOOK 已有 (持续生产监控可加强)
