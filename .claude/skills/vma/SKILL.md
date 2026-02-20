---

name: vma
description: "VMA 模块开发 — 阀门管理与审计系统"
---


你正在开发 MGMT ERP 的 VMA 模块 — 系统中最复杂的模块。

## 加载

1. `.claude/projects/mgmt/playbooks/vma.md` — 只读与任务相关的 section
2. `.claude/projects/mgmt/CONTEXT.md` §2（当前阶段: Phase 6.9 多岗位重构）
3. `.claude/projects/mgmt/reference/iron-laws.md` — 重点读 R5(越南语回退) + R0-R2

陷阱扫描: `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 搜索关键词: VMA, tripId, caseId, clinical, inventory, SOP

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## VMA 关键业务规则

- **Trip 事务**: `caseId=null, tripId=tripId` — 按 tripId 查询，过滤 OUT_TRIP
- **SOP 版本培训**: 版本变更 → 所有关联员工需要重新培训
- **培训基线**: 新员工只培训其入职日期之前存在的 SOP
- **越南语 i18n**: VMA 是唯一有真实 VI 翻译的模块

## VMA 子模块路径

| 子模块 | 后端 | 前端 |
|--------|------|------|
| Employees | `mgmt-v3/src/.../vma/employees/` | `apps/web/src/app/(dashboard)/vma/` |
| Training | `mgmt-v3/src/.../vma/training/` | `apps/web/src/app/(dashboard)/vma/` |
| P-Valve | `mgmt-v3/src/.../vma/inventory/` | `apps/web/src/app/(dashboard)/vma/p-valve/` |
| Clinical | `mgmt-v3/src/.../vma/clinical/` | `apps/web/src/app/(dashboard)/vma/p-valve/clinical/` |
| Demo | `mgmt-v3/src/.../vma/demo/` | `apps/web/src/app/(dashboard)/vma/p-valve/demo/` |

## 陷阱处理

- tripId/caseId 查询逻辑错误 → 检查 `caseId=null, tripId=tripId` 条件是否正确
- SOP 培训版本不一致 → 检查版本变更触发的培训逻辑
- VI 翻译缺失/错误 → VMA 是唯一有真实 VI 翻译的模块，确保 vi.json 同步
- 遇到未知业务规则 → **停下来问用户**，禁止猜测

## 失败处理

- 编译/类型/Lint 失败 → 读错误输出 → 定位根因 → 最小修复 → 重跑验证
- 测试失败 → 区分实现 bug vs 测试数据问题 → 修复 → 重跑
- 连续失败 3 次 → 引用 `core/reference/root-cause-classifier.md` 分类根因（A-F）
- 遇到未知业务规则 → **停下来问用户**，禁止猜测

## 完成后验证

- `rules/common.md` §5（6 阶段验证循环）
- 前端变更 → `rules/frontend.md`
- 后端变更 → `rules/backend.md`

## 任务

$ARGUMENTS
