# Gitleaks Triage — 2026-02-18

## Scan command
```bash
gitleaks detect --source . --no-banner --report-format json --report-path /tmp/gitleaks-report.json
```

## Summary
- Total findings: **12**
- Rules: `generic-api-key`, `gcp-api-key`
- Immediate risk level: **HIGH** (contains token-like and API-key-like strings in repo history/content)

## Triage buckets

### A) Must rotate + purge history (real credential risk)
1. `dev/start_online.sh:23` (`CF_TOKEN=...`)
2. `ops/start_server.sh:21` (`CF_TOKEN=...`)
3. `data/archive/prompts/history/project_all_code_V1.6.0.txt:177` (`CF_TOKEN=...`)
4. `data/archive/prompts/history/project_all_code_V1.5.2.txt:301` (`GOOGLE_API_KEY=...`)
5. `data/archive/prompts/history/project_all_code_V1.6.0.txt:298` (`GOOGLE_API_KEY=...`)

Action:
- Revoke/rotate these secrets immediately.
- Remove from tracked files.
- Rewrite git history if previously pushed.

### B) Likely doc/test examples (needs sanitize, not whitelist yet)
6. `.agent/warehouse/tools/claude-mem/01-architecture.md:302` (`API_KEY=sk-proj-abc123`)
7. `docs/phase1_preparation/04_api_specification/auth_api.md:77` (token example)
8. `docs/phase1_preparation/04_api_specification/auth_api.md:78` (token example)
9. `docs/phase1_preparation/04_api_specification/auth_api.md:119` (token example)
10. `docs/phase1_preparation/04_api_specification/auth_api.md:128` (token example)
11. `apps/api/README.md:5` (generic key pattern hit)
12. `mgmt-v3/src/test/resources/application-test.yml:32` (test config pattern hit)

Action:
- Replace all examples with obvious non-secret placeholders:
  - `YOUR_API_KEY_HERE`
  - `EXAMPLE_JWT_TOKEN`
  - `EXAMPLE_REFRESH_TOKEN`
- Keep gitleaks rule strict; avoid blanket allowlist.

## Enforce switch criteria (objective)
Switch `security-extra-audit` to `enforce` when all conditions are met:
1. gitleaks findings = 0 on full scan.
2. all rotated keys confirmed invalid.
3. history rewrite completed for leaked real keys (if remote already contains them).
4. docs/tests sanitized to placeholder format.

## Suggested next commands
```bash
# quick verify after cleanup
gitleaks detect --source . --no-banner

# optional: target changed files only in CI pre-merge
gitleaks protect --staged --no-banner
```
