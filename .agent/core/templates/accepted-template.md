# ACCEPTED.md — 验收保护记录

> 路径: `.agent/projects/{project}/data/progress/ACCEPTED.md`
> 用途: 记录已验收的产出文件，防止未经授权的修改

---

## 验收记录

| 任务 ID | 验收时间 | 受保护文件/目录 | 用户确认原话 |
|---------|---------|----------------|-------------|
| TASK-001 | YYYY-MM-DD | `src/xxx/yyy.kt` | "好的，确认通过" |
| TASK-002 | YYYY-MM-DD | `apps/web/src/xxx/` | "OK，上线" |

---

## 使用规则

1. **修改已验收文件前**: 必须告知 PM，获得用户许可
2. **写入时机**: `memory.md §2` 验收后协议 Step 2
3. **查阅时机**: 每次修改文件前检查该文件是否在此列表中
