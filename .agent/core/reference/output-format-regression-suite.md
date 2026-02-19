# Output Format Regression Suite

## Samples
- `core/templates/cto-task-decomposition-template.md` -> `cto-format-audit.sh` PASS
- `core/templates/engineer-completion-report-template.md` -> `engineer-format-audit.sh` PASS
- `core/templates/qa-verdict-report-template.md` -> `qa-format-audit.sh` PASS
- `core/templates/guard-check-report-template.md` -> `guard-format-audit.sh` PASS
- `core/templates/ship-readiness-report-template.md` -> `ship-format-audit.sh` PASS
- `core/templates/learn-ingestion-report-template.md` -> `learn-format-audit.sh` PASS
- `core/templates/delivery-gate-output-template.md` -> `delivery-gate-format-audit.sh` PASS

## Command bundle
```bash
core/scripts/cto-format-audit.sh core/templates/cto-task-decomposition-template.md
core/scripts/engineer-format-audit.sh core/templates/engineer-completion-report-template.md
core/scripts/qa-format-audit.sh core/templates/qa-verdict-report-template.md
core/scripts/guard-format-audit.sh core/templates/guard-check-report-template.md
core/scripts/ship-format-audit.sh core/templates/ship-readiness-report-template.md
core/scripts/learn-format-audit.sh core/templates/learn-ingestion-report-template.md
core/scripts/delivery-gate-format-audit.sh core/templates/delivery-gate-output-template.md
```
