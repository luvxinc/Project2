---
name: claude-mem
description: Claude Code 持久记忆插件 — SQLite + Chroma 向量搜索 + 3 层渐进检索
source: https://github.com/thedotmack/claude-mem
version: latest
---

# Claude-Mem

> **用途**: 理解持久记忆架构, 借鉴 3 层搜索模式
> **状态**: 参考资料 (我们用 Antigravity KI 替代)

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-architecture-tools.md` | 5 Hooks + 存储层 + 5 MCP 工具详解 + 使用示例 + 与 KI 对比 | ~6KB | 需理解记忆架构/搜索模式时 |

## 快速参考

**3 层搜索** (核心概念, 可借鉴到 KI):
1. **search** → 索引级, ~50 token/条
2. **timeline** → 上下文级, ~100 token/条
3. **get_observations** → 详情级, ~500 token/条

**结论**: KI 内容质量更高, claude-mem 自动化更强。两者互补。
