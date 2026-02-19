# QA Timeout Profile

统一管理 QA gate 的超时参数，避免硬编码散落在脚本里。

## 配置文件

- `core/scripts/qa-timeout-profile.env`

## 使用方式

默认会自动加载该文件。也可在执行前用环境变量覆盖：

```bash
QA_TIMEOUT_LINT=900 QA_IDLE_LINT=90 bash .agent/core/scripts/qa-gate.sh .
```

## 关键参数

- `QA_TIMEOUT_BUILD` / `QA_IDLE_BUILD`
- `QA_TIMEOUT_TYPE` / `QA_IDLE_TYPE`
- `QA_TIMEOUT_LINT` / `QA_IDLE_LINT`
- `QA_TIMEOUT_UNIT` / `QA_IDLE_UNIT`
- `QA_TIMEOUT_INTEGRATION` / `QA_IDLE_INTEGRATION`
- `QA_TIMEOUT_E2E` / `QA_IDLE_E2E`
- `QA_TIMEOUT_SECURITY` / `QA_IDLE_SECURITY`

Chunk 版本同理，参数前缀为 `QA_TIMEOUT_CHUNK_*` 与 `QA_IDLE_CHUNK_*`。
