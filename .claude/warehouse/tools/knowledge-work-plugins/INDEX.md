---
name: knowledge-work-plugins
description: Anthropic 官方 11 领域插件 — 插件架构 + Commands + Skills
source: https://github.com/anthropics/knowledge-work-plugins
license: Apache-2.0
---

# Knowledge Work Plugins (官方)

> **用途**: 领域插件架构参考 + 非技术角色能力扩展
> **状态**: 参考资料, 可直接安装

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-architecture-examples.md` | 插件架构详解 + plugin.json + Productivity 深度剖析 + 11 插件速查 | ~4KB | 创建插件/理解架构时 |

## 快速参考

**插件结构**:
```
plugin/
├── .claude-plugin/plugin.json  # 清单
├── .mcp.json                   # 工具连接
├── commands/                   # 显式触发
└── skills/                     # 自动加载
```

**最相关插件**: productivity (任务管理) / data (SQL 生成)
