# Agent Kernel Interfaces v1

> 目标：把内核能力固定成可实现、可测试、可替换的四层接口。

## 0) Context Budgeter Kernel（新增，跨层）

### Input
- intent
- budgetTokens
- usedTokens

### Output
- budget_plan / enforce_decision（JSON）

### Contract
- 默认 `catalog -> index -> topK_slices`
- soft cap(80%) 自动降级：index-only / topK=1
- hard cap(100%) 阻断 full-load
- 脚本：`core/scripts/context-budgeter.sh`

## 1) Router Kernel

### Input
- user_intent
- keywords[]
- context_budget

### Output
- route_plan[]: {layer, target, reason, confidence}
- load_budget: {maxSlices, maxKB}

### Contract
- 必须先 catalog，再 index，再 slice
- 必须返回可解释路由原因
- 单次默认 maxSlices=2

## 2) Knowledge Kernel

### Input
- source (repo/path/commit)
- category
- keywords[]

### Output
- manifest(meta.json)
- slices[]
- dedupe_report

### Contract
- 必须来源可追溯
- 必须增量写入
- 重复命中仅加权，不重复落盘

## 2.5) Task State Machine（新增）

### State Set
- `INIT -> RUNNING -> (BLOCKED|VERIFY) -> CLOSED`

### Input
- task-id
- state transition
- note

### Output
- state json
- optional checkpoint record

### Contract
- 非法状态拒绝
- BLOCKED/VERIFY 自动写 checkpoint
- recover 必须返回 latestCheckpoint 与恢复动作
- 脚本：`core/scripts/task-state.sh`

## 2.8) Tool Policy Runtime（新增）

### Input
- command string
- policy mode (`warn|enforce`)

### Output
- decision json (`risk/reason/decision`)

### Contract
- 高风险命令在 enforce 模式必须可阻断
- 决策必须机读可追溯
- run 模式必须先 check 再执行
- 脚本：`core/scripts/tool-policy-runtime.sh`

## 3) Execution Kernel

### Input
- command
- timeout/idleTimeout/retries

### Output
- exec_result {code, logs, duration, watchdogTriggered}

### Contract
- 所有高风险命令必须 safe-exec
- 同策略失败 2 次必须换路
- 支持 LOOP_BREAK

## 4) Quality Kernel

### Input
- artifact paths
- audit mode (warn|enforce)

### Output
- gate_result
- findings[]

### Contract
- 支持分层门禁（warn→enforce）
- 审计脚本必须可机读返回
- 包含引用完整性/路由可达/去重/生命周期/保真检查

## 5) Cross-kernel invariants

- Token first: 最小加载优先
- No guess: 未证实信息标 UNKNOWN
- Provenance first: 无来源不入库
- Determinism over style: 可执行性优先
