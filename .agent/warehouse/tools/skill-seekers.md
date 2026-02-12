---
name: skill-seekers
description: 文档/代码/PDF → 16 种 AI 格式的自动化技能生成工具。
source: https://github.com/yusufkaraaslan/Skill_Seekers
version: v3.0.0
local_path: /Users/aaron/Library/Python/3.12/bin/skill-seekers
---

# Skill Seekers

> **用途**: 外部文档/仓库 → 生产级 AI Skill 自动转换
> **状态**: ✅ 已安装 (需升级 v3.0.0), OCR/Poppler 已验证

## 1. 核心能力

```
输入: 文档/代码/PDF → 3-Stream 分析 (Code AST + Docs + Insights)
输出: 16 种格式 (Claude, Gemini, OpenAI, LangChain, Cursor, etc.)
```

## 2. 常用命令

```bash
# 爬取
skill-seekers scrape --config configs/react.json
skill-seekers scrape --url https://docs.example.com --name my-docs

# GitHub
skill-seekers github --repo spring-projects/spring-boot

# PDF (含 OCR)
skill-seekers pdf --pdf docs/manual.pdf --name myskill --ocr

# 多目标打包 (v3.0.0)
skill-seekers package output/ --target claude
skill-seekers package output/ --target langchain
```

## 3. C3.x AI 增强

| 模块 | 能力 |
|------|------|
| C3.1 | 设计模式识别 (Singleton, Factory, MVC) |
| C3.2 | 测试用例合成 |
| C3.3 | AI 增强 How-To (75行→500+行) |
| C3.4 | 配置模式提取 (含安全扫描) |
| C3.5 | 架构映射 (服务依赖, 数据流) |

## 4. 产出入库流程

```
1. skill-seekers 生成原始 Skill
2. 人工审核 + 适配项目风格
3. 放入 .agent/core/skills/ 或 warehouse/tools/
4. 更新索引
```

## 5. 最佳实践

- 一技能一职责, 专精优于宽泛
- 优先 `llms.txt` (10x 更快)
- 私有代码不外部爬取, Agent 本地分析
- 大文档用 `--strategy router` 拆分
