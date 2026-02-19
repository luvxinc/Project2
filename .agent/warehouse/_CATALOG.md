# Warehouse Tool Catalog

> 统一路由入口：先按分类/关键词定位，再进入具体工具库 INDEX。

## 分类
- engineering
- data
- security
- ux
- platform
- cognition

## 条目模板
| slug | category | keywords | index |
|------|----------|----------|-------|
| anthropic-skills | cognition | skill,规范,frontmatter,description | `tools/anthropic-skills/INDEX.md` |
| everything-claude-code | engineering | review,rules,hooks,qa | `tools/everything-claude-code/INDEX.md` |
| claude-mem | cognition | memory,context,token | `tools/claude-mem/INDEX.md` |

## 路由规则
1. 先匹配关键词到分类
2. 再匹配分类下条目关键词
3. 打开对应 `INDEX.md` 再按切片加载
