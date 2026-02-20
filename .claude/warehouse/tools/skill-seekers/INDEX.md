---
name: skill-seekers
description: v3.0 Universal Intelligence Platform — 文档/代码/PDF → 16 种 AI 格式 (RAG/Claude/Cursor/LangChain)
source: https://github.com/yusufkaraaslan/Skill_Seekers
version: v3.0.0
local_path: /Users/aaron/Library/Python/3.12/bin/skill-seekers
---

# Skill Seekers

> **用途**: 外部文档/仓库 → 生产级 AI Skill + RAG Pipeline 自动转换
> **状态**: ✅ 已安装 (v3.0.0), OCR/Poppler/MCP 已验证

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-commands-modules.md` | 完整命令参考 (scrape/github/pdf/pack) + C3.x AI 模块详解 + 入库流程 | ~4KB | 使用 Skill Seekers 时 |

## 快速参考

```bash
# 最常用命令
skill-seekers scrape --url URL --name NAME
skill-seekers github --repo ORG/REPO
skill-seekers pdf --pdf FILE --name NAME --ocr
skill-seekers package output/ --target claude
```
