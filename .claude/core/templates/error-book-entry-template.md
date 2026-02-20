# ERROR-BOOK 条目模板

> 路径: `.claude/projects/{project}/data/errors/ERROR-BOOK.md`
> 用途: 记录错误 + 防复犯，去重加权（weight 越高越优先检索）

---

## 条目格式

```markdown
---
id: ERR-{NNN}
keywords: [{模块}, {技术}, {操作类型}]
fingerprint: "{模块}+{操作}+{后果}"   # 去重用
count: 1
weight: 1
first_seen: YYYY-MM-DD
last_seen: YYYY-MM-DD
---

## ERR-{NNN}: {错误标题}

**触发条件**: 在 {模块/场景} 中执行 {操作} 时

**错误描述**: {具体的错误行为}

**根因**: {为什么会发生这个错误}

**正确做法**:
{描述正确的做法，可以包含代码示例}

**影响范围**: {影响了哪些文件/功能}

**交叉检查结论**: 发现 {N} 处同类代码，已全部修复（见 {文件列表}）
```

---

## 关键词索引（ERROR-BOOK.md 文件头部维护）

| 关键词 | 条目 ID |
|--------|---------|
| {模块名} | ERR-001, ERR-003 |
| {操作类型} | ERR-002 |

---

## 去重规则

- 相同 `fingerprint` → `count+1, weight+1`，更新 `last_seen`，**不新增**
- 不同 → 创建新条目
- 按 `weight` 降序排列（高频错误排前面）
