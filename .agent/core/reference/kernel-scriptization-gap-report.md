# Kernel Scriptization Gap Report

> 目标：盘点四层内核的脚本化覆盖率与剩余缺口。

## A. 已脚本化（完成）

### Router / Knowledge
- `core/scripts/library-resolve.sh`（关键词泛化路由）
- `core/scripts/library-route-audit.sh`（catalog/index/meta 可达性）
- `core/scripts/library-ingest.sh`（学习入库）
- `core/scripts/library-renew.sh`（增量更新）
- `core/scripts/library-dedupe-audit.sh`（切片重复检测）
- `core/scripts/library-learn-wrapper.sh`（/learn 单入口自动判定）

### Execution
- `core/scripts/safe-exec.sh`（timeout + idle watchdog + retries）

### Quality
- `core/scripts/agent-doc-audit.sh`（引用完整性）
- `core/scripts/memory-dedupe-audit.sh`（记忆去重）
- `core/scripts/artifact-lifecycle-audit.sh`（生命周期审计）
- `core/scripts/artifact-trash-purge.sh`（临时回收站清理）
- `core/scripts/security-extra-audit.sh`（SAST/secrets/SBOM/license 分层检查）

## B. 缺口（必须补）

1. **机读审计汇总出口**（统一 JSON 输出）
   - 现状：多数脚本是文本输出
   - 影响：难以自动聚合与趋势分析

2. **等价性矩阵自动校验器**
   - 现状：有模板，无脚本校验完整度
   - 影响：重构保真依赖人工自律

3. **/learn 重叠策略阈值可配置化**
   - 现状：重叠阈值硬编码（score>=2）
   - 影响：不同项目难调优

4. **license 检查替代实现落地**
   - 现状：`licensee` 安装受阻
   - 影响：合规门禁未完全闭环

## C. 下一步执行顺序

1) 增加 `--json` 输出到关键审计脚本
2) 新增 `refactor-equivalence-audit.sh`
3) 给 `/learn` 增加阈值配置文件
4) 用 `license-eye` 替代 `licensee` 并接入 `security-extra-audit.sh`
