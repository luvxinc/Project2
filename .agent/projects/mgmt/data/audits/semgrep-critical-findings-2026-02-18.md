# Semgrep Critical Findings (Enforce Profile) — 2026-02-18

Source: `security-extra-audit.sh` with `SEMGREP_ENFORCE_PROFILE=critical`

## Blocking findings (8)
1. `backend/apps/db_admin/views.py:598`
   - `python.django.security.injection.tainted-sql-string.tainted-sql-string`
2. `backend/apps/finance/views/deposit/api.py:1561`
   - `python.django.security.injection.tainted-sql-string.tainted-sql-string`
3. `backend/apps/purchase/views/supplier.py:314`
   - `python.django.security.injection.tainted-sql-string.tainted-sql-string`
4. `backend/web_ui/views/auth.py:25`
   - `python.django.security.injection.open-redirect.open-redirect`
5. `backend/web_ui/views/system.py:112`
   - `python.lang.security.audit.insecure-transport.requests.request-with-http.request-with-http`
6. `backend/web_ui/views/system.py:135`
   - `python.lang.security.audit.insecure-transport.requests.request-with-http.request-with-http`
7. `mgmt-v3/scripts/migrate_v1_to_v3.py:1147`
   - `python.lang.security.audit.formatted-sql-query.formatted-sql-query`
8. `mgmt-v3/scripts/migrate_v1_to_v3.py:1147`
   - `python.sqlalchemy.security.sqlalchemy-execute-raw-query.sqlalchemy-execute-raw-query`

## Gate decision
- `QA_SECURITY_MODE=enforce` currently **must fail**.
- Required before enforce on mainline: reduce this list to 0.
