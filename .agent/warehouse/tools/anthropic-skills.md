---
name: anthropic-skills
description: Anthropic 官方 Skills 仓库 — Agent Skills 规范、模板、示例集。
source: https://github.com/anthropics/skills
license: Apache 2.0 (大部分) + Source-Available (文档生成)
---

# Anthropic 官方 Skills

> **用途**: Skill 架构规范参考、模板参考、高质量示例学习
> **地址**: https://github.com/anthropics/skills

## 1. 仓库结构

```
skills/       → Skill 示例集
  ├── 创意设计类 (art, music, design)
  ├── 技术开发类 (web-app-testing, mcp-server-gen)
  ├── 企业沟通类 (communications, branding)
  └── 文档类 (docx, pdf, pptx, xlsx) — Claude 内置文档能力的源码
spec/         → Agent Skills 官方规范
template/     → Skill 模板
```

## 2. 官方 Skill 规范 (SKILL.md 标准)

```markdown
---
name: my-skill-name                    # 唯一标识 (小写, 连字符)
description: 能力描述 + 何时使用       # Claude 用此判断是否加载
---

# 技能名称

[Claude 激活此技能后遵循的指令]

## Examples
- 示例用法 1
- 示例用法 2

## Guidelines
- 准则 1
- 准则 2
```

**关键**: 只需 `name` + `description` 两个 frontmatter 字段。
Claude 扫描 description 判断相关性 → 相关时才加载完整指令。

## 3. 我们的适配状态

| 规范要求 | 我们的状态 | 备注 |
|---------|-----------|------|
| SKILL.md frontmatter | ✅ 全部 17 Skills 已有 | `name` + `description` |
| 自包含文件夹 | ⚠️ 部分 | 我们用扁平文件, 非文件夹结构 |
| 模块化加载 | ✅ 路由表设计 | 通过路由表按需跳转 section |
| 示例模板 | ✅ 代码示例完整 | backend/frontend 有落地模板 |

## 4. 值得参考的官方示例

| Skill | 亮点 |
|-------|------|
| `docx` | 文档生成最佳实践, 含脚本和资源捆绑 |
| `pdf` | 复杂文档流水线, 多步骤工作流 |
| `web-app-testing` | 测试自动化 Skill 设计模式 |
| `mcp-server-gen` | MCP 服务器自动生成 |
