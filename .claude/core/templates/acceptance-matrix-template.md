# 验收矩阵 — Acceptance Matrix

> **用途:** QA/PM 验证阶段，将每条需求逐一对应证据，确认 PASS/FAIL
> **引用处:** `spec-template.md §7.5`, `qa-report-template.md`

## 需求验收矩阵

| Requirement (需求) | Evidence (证据) | Status |
|---|---|---|
| 示例：只修改范围内文件 | Command: `git diff --name-only` | PASS |
| 示例：需求A达成 | Source: `path/to/file#L12` | PASS |
| 示例：需求B达成 | Output: test command passed | PASS |
| 示例：无回归 | Tests: `{test_cmd}` PASS（见 CONTEXT.md §5） | PASS |
