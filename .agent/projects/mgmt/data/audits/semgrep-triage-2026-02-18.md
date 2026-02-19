# Semgrep Triage — 2026-02-18

## Scan
```bash
semgrep --config auto --json . > /tmp/semgrep.json
```

## Summary (objective)
- Total findings: **253**
- Severity:
  - ERROR: **82**
  - WARNING: **168**
  - INFO: **3**
- Top rule clusters:
  1. `python.django.security.audit.xss.direct-use-of-httpresponse` — 124
  2. `javascript.browser.security.insecure-document-method` — 53
  3. `python.sqlalchemy.security.audit.avoid-sqlalchemy-text` — 23
  4. `python.django.security.injection.raw-html-format` — 22

## High-priority true-risk candidates (must review first)
1. SQL 执行相关（注入风险）
   - `python.django.security.injection.tainted-sql-string`
   - `python.lang.security.audit.formatted-sql-query`
   - `python.sqlalchemy.security.sqlalchemy-execute-raw-query`
2. XSS/HTML 直出相关
   - `direct-use-of-httpresponse`
   - `raw-html-format`
3. 传输与重定向
   - `requests.request-with-http`
   - `open-redirect`

## 当前状态判断
- 结论：**暂不允许全局 Semgrep enforce**。
- 原因：总量高且噪音比例未知，直接 enforce 会阻断正常迭代。

## Enforce 切换门槛（两阶段）

### Phase A（现在就做）
- 仅对新增/变更文件执行 Semgrep（pre-merge diff scope）。
- 对以下规则先 enforce：
  - tainted SQL / raw SQL execute / open redirect / insecure http request
- 其余规则保留 warn。

### Phase B（清债后）
- 历史基线压降到：
  - ERROR <= 10
  - 且高危规则（SQL/XSS/redirect/http）存量 = 0
- 再升级到全量 enforce。

## Suggested implementation notes
- 在 `security-extra-audit.sh` 增加 `SEMGREP_SCOPE=diff|full`。
- 在 CI 中对 PR 使用 `diff`，主干 nightly 跑 `full` 并出趋势报表。
- enforce 入口参数（已接入 `qa-gate.sh`）：
  - `QA_SECURITY_MODE=warn|enforce`
  - `QA_SEMGREP_SCOPE=diff|full`
  - `QA_SEMGREP_ENFORCE_PROFILE=critical|all`
