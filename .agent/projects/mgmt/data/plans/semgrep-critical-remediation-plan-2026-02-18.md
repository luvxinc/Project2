# Semgrep Critical Remediation Plan — 2026-02-18

目标：将 `semgrep-enforce-rules.txt` 命中从 8 降到 0，使 `QA_SECURITY_MODE=enforce` 可通过。

## P0（当天完成，阻断类）

### 1) SQL 注入类（3 处）
- `backend/apps/db_admin/views.py:598`
- `backend/apps/finance/views/deposit/api.py:1561`
- `backend/apps/purchase/views/supplier.py:314`

最小修复策略：
- 禁止字符串拼接 SQL。
- Django ORM 或 parameterized query（`cursor.execute(sql, params)`）。
- 对动态字段名走白名单映射，不直接拼用户输入。

验收：
- semgrep 不再命中 `tainted-sql-string`。
- 对应接口回归通过（输入正常/恶意 payload）。

### 2) Open Redirect（1 处）
- `backend/web_ui/views/auth.py:25`

最小修复策略：
- 重定向目标只允许站内路径或 allowlist 域名。
- 非法目标回退到默认安全页面。

验收：
- semgrep 不再命中 `open-redirect`。
- 构造外链参数时无法跳出 allowlist。

### 3) Insecure HTTP 请求（2 处）
- `backend/web_ui/views/system.py:112`
- `backend/web_ui/views/system.py:135`

最小修复策略：
- 将 `http://` 改为 `https://`（或内网白名单+明确豁免）。
- 请求目标从配置读取并校验 scheme。

验收：
- semgrep 不再命中 `request-with-http`。
- 联调可用。

## P1（随后完成，迁移脚本类）

### 4) Raw SQL / formatted SQL（2 处，同一行）
- `mgmt-v3/scripts/migrate_v1_to_v3.py:1147`

最小修复策略：
- 表名若必须动态：仅允许来自预先枚举白名单。
- 查询参数部分使用参数化；避免 f-string 直接拼接可变输入。
- 添加注释说明“动态表名来自白名单，不接受外部输入”。

验收：
- semgrep 不再命中两条规则（或有明确、审计可追溯的窄范围豁免）。

## 执行顺序（连续）
1. 先改 P0 三类（6 命中）
2. 跑：`SEMGREP_SCOPE=diff ... security-extra-audit.sh . enforce`
3. 再改 P1（2 命中）
4. 跑：`SEMGREP_SCOPE=full ... security-extra-audit.sh . enforce`
5. 通过后在 `qa-gate.sh` 默认切换到：
   - `QA_SECURITY_MODE=enforce`
   - `QA_SEMGREP_SCOPE=diff`
   - nightly full enforce
