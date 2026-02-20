---
name: anthropic-skills
description: Anthropic 官方 Agent Skills 规范 + 模板 + 示例目录
source: https://github.com/anthropics/skills
license: Apache-2.0 (核心) / Source-Available (文档类)
---

# Anthropic Skills (官方)

> **用途**: Skill 标准规范 + 创建新 Skill 的参考
> **状态**: 参考资料

## 切片目录

| 文件 | 内容 | 大小 | 何时加载 |
|------|------|------|---------|
| `01-spec-template.md` | 完整规范 + YAML 示例 + 企业级模板 + 与我们的对比 | ~3KB | 创建新 Skill 时 |

## 快速参考

**SKILL.md 最小格式**:
```yaml
---
name: my-skill
description: 一句话描述 (Claude 据此判断是否加载)
---
```

**我们的合规度**: ✅ 17 Skills 全有 frontmatter + description
