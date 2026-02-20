# Artifact Governance Standard（项目文件治理规范）

> 目标：控制文件增长、确保可检索、支持增量写入、避免冗余。

## 1) 目录分层（必须）

- `projects/{project}/`：项目根
- `data/tmp/`：**临时工作区（新增，规划/审计草稿统一放这里）**
- `data/specs/`：任务级（完成即删）
- `data/plans/`：任务级（完成即删）
- `data/progress/`：持久（ACCEPTED/PROJECT-MEMORY/requirements/risk等）
- `data/checkpoints/`：临时（恢复后删）
- `data/audits/`：默认临时（问题修复后删除）；**但“架构/迁移基线审计”允许长期保留**（用于未来重构解释与对照）
- `data/errors/`：持久（ERROR-BOOK，仅追加）
- `reference/`：持久（技术真相源，禁止清理脚本误删）
- `playbooks/`：持久（项目策略，禁止清理脚本误删）

## 2) 命名规范（必须）

- 任务级文件：`YYYY-MM-DD_{topic}.md`
- 追踪器：`TRACKER-{task-id}.md`
- 错题本：`ERROR-BOOK.md`（可切片 `ERROR-BOOK-{module}.md`）
- 项目复用记忆：`PROJECT-MEMORY.md`（可切片 uiux/data/rules）
- 临时文件（规划/审计/分析草稿）：
  - 路径：`data/tmp/{task-id}/`
  - 文件前缀：`TMP-PLAN-*.md` / `TMP-AUDIT-*.md` / `TMP-ANALYSIS-*.md`
  - 规则：任务关闭后整目录删除

## 3) 增量写入规范（必须）

- 默认 append，不重写历史
- 仅更新受影响段落（避免整文件重排）
- 重复内容禁止新增：命中则更新 `count/weight/last_seen`

## 4) 生命周期（必须）

- `data/tmp/{task-id}/`：任务 CLOSED 后清理（两阶段：先移入 `_trash`，24h 后硬删）
- specs/plans/TRACKER/checkpoints：任务 CLOSED 后删除
- audits：问题修复后删除；但 `v1/v2/v3` 架构迁移基线、traceability 矩阵等“重构对照资产”可长期保留
- errors/progress/reference/playbooks：持久保留（`reference/` 与 `playbooks/` 永不被自动清理）

## 5) 切片与索引阈值

- 单文件 > 500 行：必须按主题切片
- 单切片建议 < 6KB，硬上限 8KB
- 文件夹条目过多时建立 `_INDEX.md` 或根索引表

## 6) 去重与冲突处理

- 去重键：`keywords + fingerprint`
- 命中即加权，不重复录入
- 冲突规则：保留真相源，其他文件改为引用

## 7) 门禁与审计

- 文档引用审计：`core/scripts/agent-doc-audit.sh`
- 记忆去重审计：`core/scripts/memory-dedupe-audit.sh`
- 产物生命周期审计：`core/scripts/artifact-lifecycle-audit.sh`
- 临时区清理审计：`core/scripts/artifact-lifecycle-audit.sh --tmp-only`（可选）
