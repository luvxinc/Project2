# ACCEPTED.md — 验收保护记录

> 路径: `.claude/projects/mgmt/data/progress/ACCEPTED.md`
> 用途: 记录已验收的产出文件，防止未经授权的修改
> 模板: `core/templates/accepted-template.md`

---

## 验收记录

| 任务 ID | 验收时间 | 受保护文件/目录 | 用户确认原话 |
|---------|---------|----------------|-------------|
| UPGRADE-PHASE-0 | 2026-02-19 | `core/rules/common.md`, `core/workflows/*.md`, `core/skills/*.md` | V3 迁移已完成，Phase 0 修复确认 |
| UPGRADE-PHASE-1-4 | 2026-02-19 | `.claude/core/` 全量, `workflows/`, `projects/mgmt/data/progress/PROJECT-MEMORY.md` | "好的 继续"（用户确认 Phase 1-4 完成） |

---

## 使用规则

1. **修改已验收文件前**: 必须告知 PM，获得用户许可
2. **写入时机**: `memory.md §2` 验收后协议 Step 2
3. **查阅时机**: 每次修改文件前检查该文件是否在此列表中
