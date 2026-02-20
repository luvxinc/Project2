---
description: 审批工作流引擎 — Temporal 实现多级审批, 超时升级, 会签/或签, 委托
---

# 审批工作流引擎 (Workflow Engine)

> **技术**: Temporal (已列入 V3 技术栈)
> **本文档定义**: 审批流的具体设计模式和模板
> **权威规范**: `core/skills/backend.md`

---

## 1. 审批模式

| 模式 | 说明 | 用例 |
|------|------|------|
| **顺序审批 (Sequential)** | A → B → C, 每人通过后才到下一人 | 采购审批 |
| **并行会签 (Parallel AND)** | A + B + C 全部通过才算通过 | 合同审批 |
| **并行或签 (Parallel OR)** | A 或 B 或 C 任一人通过即可 | 简易审批 |
| **条件路由 (Conditional)** | 根据金额/类型动态选择审批链 | 金额分级 |
| **超时升级 (Escalation)** | 48h 未审批 → 自动升级给上级 | 所有审批 |
| **委托 (Delegation)** | 审批人不在时委托给指定代理人 | 休假场景 |

---

## 2. 条件路由规则 (采购为例)

```
采购金额:
    < $1,000     → 部门经理 (1 人)
    $1,000-$10K  → 部门经理 → 采购总监 (2 人顺序)
    $10K-$50K    → 部门经理 → 采购总监 → CFO (3 人顺序)
    > $50K       → 部门经理 → 采购总监 → CFO → CEO (4 人顺序)
```

---

## 3. Temporal Workflow 实现

### 3.1 Workflow 定义

```kotlin
@WorkflowInterface
interface ApprovalWorkflow {
    @WorkflowMethod
    fun executeApproval(request: ApprovalRequest): ApprovalResult

    @SignalMethod
    fun submitDecision(decision: ApprovalDecision)

    @QueryMethod
    fun getStatus(): ApprovalStatus
}

@WorkflowImpl(taskQueues = ["approval-queue"])
class ApprovalWorkflowImpl : ApprovalWorkflow {
    private var currentStep = 0
    private var status = ApprovalStatus.PENDING
    private val decisions = mutableListOf<ApprovalDecision>()

    override fun executeApproval(request: ApprovalRequest): ApprovalResult {
        val chain = resolveApprovalChain(request)  // 条件路由

        for ((index, approver) in chain.withIndex()) {
            currentStep = index

            // 发送通知
            val notificationActivity = Workflow.newActivityStub(NotificationActivity::class.java)
            notificationActivity.sendApprovalRequest(approver, request)

            // 等待决策 (带超时)
            val approved = Workflow.await(
                Duration.ofHours(request.timeoutHours.toLong())
            ) { decisions.size > index }

            if (!approved) {
                // 超时 → 升级
                val escalatedTo = resolveEscalation(approver)
                notificationActivity.sendEscalationNotice(escalatedTo, request)
                Workflow.await(Duration.ofHours(24)) { decisions.size > index }
            }

            val decision = decisions[index]
            if (decision.action == Action.REJECTED) {
                status = ApprovalStatus.REJECTED
                return ApprovalResult(status, decisions, decision.reason)
            }
        }

        status = ApprovalStatus.APPROVED
        return ApprovalResult(status, decisions)
    }

    private fun resolveApprovalChain(request: ApprovalRequest): List<Approver> {
        return when {
            request.amount < 1000    -> listOf(request.departmentManager)
            request.amount < 10000   -> listOf(request.departmentManager, request.purchaseDirector)
            request.amount < 50000   -> listOf(request.departmentManager, request.purchaseDirector, request.cfo)
            else                     -> listOf(request.departmentManager, request.purchaseDirector, request.cfo, request.ceo)
        }
    }
}
```

### 3.2 Activity (发通知)

```kotlin
@ActivityInterface
interface NotificationActivity {
    fun sendApprovalRequest(approver: Approver, request: ApprovalRequest)
    fun sendEscalationNotice(escalatedTo: Approver, request: ApprovalRequest)
    fun sendApprovalComplete(requester: String, result: ApprovalResult)
}
```

### 3.3 Signal (提交审批决策)

```kotlin
// Controller 接收审批决策
@PostMapping("/api/v1/approvals/{workflowId}/decide")
fun submitDecision(
    @PathVariable workflowId: String,
    @RequestBody decision: ApprovalDecisionDto,
) {
    val workflow = workflowClient.newWorkflowStub(
        ApprovalWorkflow::class.java, workflowId
    )
    workflow.submitDecision(decision.toDomain())
}
```

---

## 4. 审批委托

```sql
CREATE TABLE approval_delegations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delegator_id    UUID NOT NULL REFERENCES users(id),
    delegate_id     UUID NOT NULL REFERENCES users(id),
    start_date      DATE NOT NULL,
    end_date        DATE NOT NULL,
    reason          TEXT,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

查询审批人时先检查委托:
```kotlin
fun resolveActualApprover(approverId: UUID): UUID {
    val delegation = delegationRepository.findActiveByDelegator(approverId, LocalDate.now())
    return delegation?.delegateId ?: approverId
}
```

---

## 5. 审批历史 (可追溯)

```sql
CREATE TABLE approval_history (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id     VARCHAR(255) NOT NULL,
    entity_type     VARCHAR(50) NOT NULL,     -- 'PURCHASE_ORDER', 'CONTRACT'
    entity_id       UUID NOT NULL,
    step            INT NOT NULL,
    approver_id     UUID NOT NULL REFERENCES users(id),
    action          VARCHAR(20) NOT NULL,     -- 'APPROVED', 'REJECTED', 'ESCALATED'
    reason          TEXT,
    decided_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. 前端审批 UI

审批中心页面 (`/approvals`):
- 待审批列表 (我的待办)
- 已审批列表 (我的历史)
- 审批详情 (显示完整审批链 + 每步状态)
- 一键审批/拒绝 (带理由输入)

---

*Version: 1.0.0 — 2026-02-11*
