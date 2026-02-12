# Anthropic Skills 详细参考: 官方规范 + 模板

> **加载时机**: 需要创建新 Skill 或理解官方 Skill 规范时

## 1. Agent Skills 规范

### SKILL.md 完整规范

每个 Skill 是一个自包含文件夹, 核心是 `SKILL.md`:

```
my-skill/
├── SKILL.md           # 必需: 指令 + YAML 元数据
├── scripts/           # 可选: 辅助脚本
├── examples/          # 可选: 参考实现
└── resources/         # 可选: 模板/资源文件
```

### YAML Frontmatter (仅需 2 字段)

```yaml
---
name: my-skill-name          # 唯一标识 (小写, 连字符)
description: |                # Claude 用此判断是否加载
  做什么 + 何时使用。
  描述要完整, Claude 只看 description 决定相关性。
---
```

### 指令编写指南

```markdown
# Skill 名称

## Context (何时使用)
简述适用场景, 触发条件

## Instructions (做什么)
1. 步骤 1
2. 步骤 2
3. ...

## Examples (怎么用)
- 示例输入/输出

## Guidelines (约束)
- 必须遵守的规则
- 必须避免的行为

## Resources (引用)
引用 resources/ 目录中的文件
```

### 关键设计原则
1. **描述决定加载** — Claude 扫描 description 判断相关性, description 不好 = 永远不被加载
2. **自包含** — 所有需要的脚本/模板放在 Skill 文件夹内
3. **渐进加载** — Claude 先读 description (几十 token), 相关才加载完整 SKILL.md
4. **单一职责** — 一个 Skill 做一件事, 不要混合多个功能

## 2. 官方 Skill 目录

### 创意设计类
| Skill | 功能 |
|-------|------|
| `art` | 艺术创作指导 |
| `music` | 音乐创作辅助 |
| `design` | 设计系统生成 |

### 技术开发类
| Skill | 功能 |
|-------|------|
| `web-app-testing` | Web 应用测试自动化 |
| `mcp-server-gen` | MCP 服务器自动生成 |

### 企业沟通类
| Skill | 功能 |
|-------|------|
| `communications` | 企业沟通文档 |
| `branding` | 品牌指南文档 |

### 文档类 (Claude 内置能力源码)
| Skill | 功能 | 许可 |
|-------|------|------|
| `docx` | Word 文档生成 | Source-Available |
| `pdf` | PDF 文档生成 | Source-Available |
| `pptx` | PPT 演示文稿生成 | Source-Available |
| `xlsx` | Excel 表格生成 | Source-Available |

## 3. 模板

### 最小模板
```markdown
---
name: template-skill
description: A template skill showing the minimum required structure.
---

# Template Skill

## When to Use
Use this skill when [trigger condition].

## Instructions
1. Step 1
2. Step 2

## Output Format
[Expected output structure]
```

### 企业级模板 (含脚本)
```
enterprise-skill/
├── SKILL.md
│   name: enterprise-workflow
│   description: Complex multi-step workflow with validation
│
├── scripts/
│   ├── validate.sh      # 验证脚本
│   └── generate.py      # 生成脚本
│
├── examples/
│   └── sample-output/   # 示例产出
│
└── resources/
    ├── template.md      # 文档模板
    └── config.json      # 默认配置
```

## 4. 我们 vs 官方规范对比

| 规范要求 | 我们的实现 | 差距 |
|---------|-----------|------|
| SKILL.md frontmatter | ✅ 17 Skills 全有 | — |
| name + description | ✅ 全部 | — |
| 自包含文件夹 | ⚠️ 扁平 .md 文件 | 考虑迁移到文件夹结构 |
| scripts/ 目录 | ❌ 无 | 可加验证/生成脚本 |
| examples/ 目录 | ⚠️ 内联在 Skill 中 | 可提取为独立文件 |
| 渐进加载 | ✅ 路由表 + 按需跳转 | 与官方理念一致 |
