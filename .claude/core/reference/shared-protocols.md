# 共享协议中心 (唯一引用索引)

> **用途**: 防止多文件重复定义同一协议。修改协议时只改真相源，消费方只保留引用指针。

---

## 协议真相源索引

| 协议 | 真相源位置 | 引用方式 |
|------|-----------|---------|
| 验证循环 6 阶段 | `rules/common.md §5` | `→ rules/common.md §5` |
| 跨文件影响分析 | `rules/common.md §6` | `→ rules/common.md §6` |
| 代码拆分与复用 | `rules/common.md §9` | `→ rules/common.md §9` |
| 反死循环与终端安全 | `rules/common.md §10` | `→ rules/common.md §10` |
| 重构保真门禁 | `rules/common.md §11` | `→ rules/common.md §11` |
| Think Discipline | `rules/common.md §12` | `→ rules/common.md §12` |
| Token-Efficient Execution | `rules/common.md §13` | `→ rules/common.md §13` |
| 问题复盘铁律 | `rules/common.md §14` | `→ rules/common.md §14` |
| 交付闸门格式 | `templates/delivery-gate-output-template.md` | `→ templates/delivery-gate-output-template.md` |
| 禁止猜测铁律 | `skills/project-manager.md §2.1` | 其他文件不再重复 |
| 架构合规门禁 | `{project}/reference/architecture-gate.md` | `→ {project}/reference/architecture-gate.md` |
| Express/Standard 模式 | `workflows/contact.md` Express Path 判定 | 由 PM 自动选择 |
| 任务状态机 | `workflows/build.md §0` | `→ workflows/build.md §0` |
| 检查点格式 | `templates/checkpoint-template.md` | `→ templates/checkpoint-template.md` |
| Spec 格式 | `templates/spec-template.md` | `→ templates/spec-template.md` |
| 错题本条目格式 | `templates/error-book-entry-template.md` | `→ templates/error-book-entry-template.md` |

---

## 消费方清单（去重追踪）

| 协议 | 已知消费方（需保持引用一致）|
|------|--------------------------|
| Think Discipline | build.md §2/§4/§5, guard.md §5, chief-engineer.md §3/§5, qa-auditor.md §2, review/SKILL.md, ship.md §5/§6 → 引用 §12 |
| Token-Efficient Execution | build.md §3, common.md §5, qa-gate/SKILL.md, chief-engineer.md §5 → 引用 §13 |
| 问题复盘铁律 | build.md §6, guard.md §4/§5/§6, ship.md §1/§6 → 已统一引用 §14 |
| 验证循环 6 阶段 | build.md §5, guard.md §4, requirements.md §5.3 → 已统一引用 §5 |
| V3 架构合规 | build.md, guard.md, ship.md → build 已引用 gate 文件；guard/ship 保留简短段落 |

---

*Version: 1.0.0 | Created: 2026-02-19*
