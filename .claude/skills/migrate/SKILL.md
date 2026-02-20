---

name: migrate
description: "V1→V3 忠实迁移 — Django 到 Kotlin/Spring Boot"
---


你正在执行 MGMT ERP Phase 8 的 V1→V3 忠实迁移。

## 加载

1. `.claude/projects/mgmt/playbooks/migration.md` — 只读与目标模块相关的 section
2. `.claude/projects/mgmt/reference/iron-laws.md` — 重点读 R7（忠实迁移铁律）+ R0-R2
3. `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 搜索目标模块名相关的条目

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 基线审计文件（按模块加载相关 section，禁止全量读取）

- `.claude/projects/mgmt/data/audits/BASELINE-v1-database-deep-audit.md` — 用 Grep 搜索目标模块的表名（禁止全量读取，文件 >150KB）
- `.claude/projects/mgmt/data/audits/BASELINE-v3-column-traceability-matrix.md` — 用 Grep 搜索目标模块的字段（禁止全量读取，文件 >40KB）

## R7 忠实迁移铁律

**架构变、业务逻辑不变:**
1. 先读 V1 Django 源码（`backend/` 目录: models.py, views.py, urls.py）
2. 逐函数完全理解后才写 V3 代码
3. 1:1 API 端点映射（禁止遗漏）
4. 1:1 字段映射（允许合并，禁止丢失）
5. 不确定的部分 → **停下来问用户**，禁止猜测

## 迁移 SOP

```
Step 1: GATHER — 读 V1 源码 + 基线审计（目标模块 section）
Step 2: SPEC   — 映射 V1 端点/模型/字段 → V3 目标
Step 3: EXECUTE — Flyway SQL + Kotlin Entity/Repository/Service/Controller
Step 4: VERIFY — 等价性审计 bash .claude/core/scripts/refactor-equivalence-audit.sh
```

## 失败处理

- Flyway SQL 执行失败 → 不要重试，先检查 SQL 语法和依赖 → 修复后重跑
- 等价性审计不通过 → 对比 V1/V3 输出差异 → 补全缺失映射 → 重审计
- 不确定的字段/逻辑 → **停下来问用户**（R7 铁律）

## V1 源码位置

V1 Django 代码在: `backend/`

## 任务

$ARGUMENTS
