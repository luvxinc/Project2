# Governance Gate Modes (Scope / Acceptance / No-Guess)

## Mode
- `QA_GOVERNANCE_MODE=warn` (default)
  - audits run and report warnings, do not block gate
- `QA_GOVERNANCE_MODE=enforce`
  - any failed governance audit blocks qa-gate

## Inputs
- `QA_SCOPE_CONTRACT_FILE` (preferred; generated per-task contract)
- `QA_TASK_ID` + `QA_PROJECT_ROOT` (auto-resolve contract to `data/tmp/{task-id}/scope-contract.txt`)
- `QA_SCOPE_ALLOWLIST_FILE` (fallback default: `core/reference/scope-allowlist.example.txt`)
- `QA_ACCEPTANCE_MATRIX_FILE` (required in `enforce`; missing -> fail)
- `QA_REPORT_FILE` (required in `enforce`; missing -> fail)
- `QA_SCOPE_BASE_REF` (default: `HEAD~1`)

## Dynamic scope contract (recommended)
1. init contract
```bash
core/scripts/scope-contract-init.sh .claude/projects/{project} {task-id} {base-ref} '^\.claude/core/scripts/.*' '^\.claude/core/reference/.*'
```
2. gate run with contract
```bash
QA_SCOPE_CONTRACT_FILE=.claude/projects/{project}/data/tmp/{task-id}/scope-contract.txt core/scripts/qa-gate.sh
```

## Recommended rollout
1. Week 1: warn mode, collect violations
2. Week 2: enforce in CI for PR only
3. Week 3: enforce in all qa-gate runs

## Scope discipline requirement
- 在 `QA_GOVERNANCE_MODE=enforce` 下，必须提供有效 scope 审计（`QA_SCOPE_CONTRACT_FILE` 或 scope-audit 脚本）。
- 无范围审计即 fail，防止“顺带修改未授权内容”。
