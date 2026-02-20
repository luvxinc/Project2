---

name: learn
description: "学习外部知识库 — 摄入 GitHub repo 或文档到 warehouse"
---


你正在执行学习工作流 — 将外部知识库摄入到 Agent 工具仓库。

## 加载

1. `.claude/core/workflows/learn.md` — 先读 §0（100% 理解门禁），通过后按需加载后续 section
2. `.claude/warehouse/_CATALOG.md` — 只读工具名称列表，按关键词匹配去重
3. `.claude/warehouse/_CATALOG.json` — 结构化目录

陷阱扫描: `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 搜索关键词: learn, warehouse, 库, 摄入, 大文件

如果上述文件不存在，读 `CLAUDE.md` 基础信息。warehouse 目录不存在时自行创建。

## 100% 理解门禁（§0）

摄入前必须完成全覆盖:
- [ ] 架构层
- [ ] API/接口层
- [ ] 数据/状态层
- [ ] 测试/验证层
- [ ] 运维/发布层（如适用）

未全部勾选 → 禁止宣称"已理解"

## 约束

- 每个切片 < 6KB，硬限 8KB
- 库总量默认上限 40KB
- 必须创建: INDEX.md + meta.json + 编号切片
- 目标路径: `.claude/warehouse/tools/{library-slug}/`
- 摄入后去重: 对比已有 warehouse 内容

## 摄入后验证

```bash
bash .claude/core/scripts/library-route-audit.sh
bash .claude/core/scripts/library-dedupe-audit.sh
```

## 任务

$ARGUMENTS
