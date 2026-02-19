# Role Output Standardization Plan — 2026-02-18

## Goal
为所有分工流程建立固定输出格式（Anthropic 风格：结构固定、可验证、低自由度）。

## Phase 1 (P0): Define mandatory templates (no behavior change yet)

Create templates under `core/templates/`:
1. `cto-task-decomposition-template.md`
2. `cto-integration-verdict-template.md`
3. `engineer-completion-report-template.md`
4. `qa-verdict-report-template.md`
5. `rework-ticket-template.md`
6. `guard-check-report-template.md`
7. `ship-readiness-report-template.md`
8. `learn-ingestion-report-template.md`

Template contract for all:
- Header: Objective / Scope / Verdict
- Evidence fields: `Source:` / `Command:` / `Output:` (at least one per critical claim)
- Unknown handling: must use `UNKNOWN`

## Phase 2 (P1): Wire role skills/workflows to templates

Update role files to hard-reference templates:
- `skills/chief-engineer.md`
- `skills/qa-auditor.md`
- `skills/project-manager.md` (already partially done)
- `workflows/build.md`, `guard.md`, `ship.md`, `learn.md`

Hard rules:
- missing required section => Block
- section order fixed
- no free-form delivery substitute

## Phase 3 (P2): Add machine-check audits

Add scripts under `core/scripts/`:
1. `cto-format-audit.sh`
2. `engineer-format-audit.sh`
3. `qa-format-audit.sh`
4. `guard-format-audit.sh`
5. `ship-format-audit.sh`
6. `learn-format-audit.sh`

Then hook into `qa-gate.sh` with mode:
- warn (week1)
- enforce (week2+)

## Phase 4 (P3): Minimal regression set

Add `core/reference/output-format-regression-suite.md`:
- one valid + one invalid sample for each role format
- expected pass/fail
- keep scope small and deterministic

## Exit criteria
1. 8 templates present
2. role/workflow references all wired
3. format-audit scripts runnable
4. qa-gate can fail on malformed outputs
5. PM/CTO/QA output style stable across 5 consecutive tasks

## Risk control
- avoid overgeneralization: no extra roles beyond current architecture
- keep one canonical template per output type
- avoid duplicate rules between skills/workflows/scripts
