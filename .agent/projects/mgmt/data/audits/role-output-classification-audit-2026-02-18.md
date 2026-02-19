# Role Output Classification Audit — 2026-02-18

## Objective
盘点当前 Agent 体系中“会对外输出内容”的角色与流程分类，作为统一格式治理的输入。

## A. Roles that produce user-visible or handoff outputs

1. PM (`core/skills/project-manager.md`)
- 对外：用户交付、确认请求、需求复述
- 对内：需求文档、进度状态、风险登记

2. CTO (`core/skills/chief-engineer.md`)
- 对内：任务分解单、整合验证结论、驳回工单
- 对外（间接）：通过 PM 传达技术结论

3. QA (`core/skills/qa-auditor.md`)
- 对内：审计报告、Verdict、返工建议
- 对外（间接）：交付质量结论

4. Engineering domains (product/service/platform)
- 对内：完工报告、实现说明、风险说明、影响半径
- 入口：`core/skills/domains/{product,service,platform}.md`

## B. Workflow-based output categories

From `core/workflows/INDEX.md`:
1. `build.md` — 开发/重构闭环（最多交付类输出）
2. `guard.md` — 审查/排查/事故响应输出
3. `ship.md` — 部署/发布输出
4. `ui.md` — 设计/体验评审输出
5. `learn.md` — 学习/知识入库输出

## C. Current formatting status (audit)

✅ Already hardened:
- PM 交付闸门固定模板已强制（`delivery-gate-output-template.md`）
- QA 对缺少“功能验证（真实运行）”可 Block
- qa-gate 已接入 delivery gate format 审计脚本

⚠️ Still not unified:
- CTO 分解/驳回输出格式尚未强制模板化
- 工程师完工报告格式在不同流程中可能漂移
- Guard/Incident/Ship/Learn 缺统一机器可校验模板
- 不同角色的“证据字段”尚未统一（Source/Command/Output）

## D. Proposed role × output taxonomy (target)

1) PM
- Delivery Gate
- User Confirmation
- Requirement Clarification

2) CTO
- Task Decomposition Sheet
- Integration Verdict
- Rework Ticket

3) Engineer
- Completion Report
- Change Summary
- Impact Radius Report

4) QA
- QA Verdict Report
- Blocking Findings
- Release Recommendation

5) Guard/Ship/Learn
- Guard Check Report
- Release Readiness Report
- Knowledge Ingestion Report

## E. Audit verdict

- 体系可扩展，但目前“只有 PM 交付格式真正硬化”。
- 若要恢复你说的“以前那种稳定输出感”，必须把 CTO/工程师/QA/Guard/Ship/Learn 全部模板化并接入格式审计。
