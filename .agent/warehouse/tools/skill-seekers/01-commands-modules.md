# Skill Seekers 详细参考: 命令 + C3 模块

> **加载时机**: 需要使用 Skill Seekers 从外部源生成 Skill 时

## 1. 完整命令参考

### 爬取命令
```bash
# 爬取网站文档
skill-seekers scrape --url https://docs.example.com --name my-docs
skill-seekers scrape --url https://docs.example.com --name my-docs --strategy router

# 使用配置文件
skill-seekers scrape --config configs/react.json

# 指定深度和限制
skill-seekers scrape --url https://docs.example.com \
    --name my-docs \
    --max-depth 3 \
    --max-pages 100 \
    --output output/my-docs

# 优先使用 llms.txt (10x 更快)
skill-seekers scrape --url https://docs.example.com --name my-docs --prefer-llmstxt
```

### GitHub 命令
```bash
# 爬取 GitHub 仓库
skill-seekers github --repo spring-projects/spring-boot
skill-seekers github --repo anthropics/skills --branch main

# 只爬特定目录
skill-seekers github --repo org/repo --include "src/**" --exclude "test/**"

# 指定语言过滤
skill-seekers github --repo org/repo --lang kotlin,typescript
```

### PDF 命令
```bash
# 基本 PDF 处理
skill-seekers pdf --pdf docs/manual.pdf --name myskill

# 含 OCR (扫描件 PDF)
skill-seekers pdf --pdf docs/scanned.pdf --name myskill --ocr

# 批量 PDF
skill-seekers pdf --dir docs/ --name myskills --ocr
```

### 打包命令 (v3.0.0)
```bash
# 打包为 Claude 格式
skill-seekers package output/ --target claude

# 打包为 LangChain 格式
skill-seekers package output/ --target langchain

# 支持的目标格式 (16 种)
# claude, openai, langchain, cursor, gemini, codeium,
# continue, tabby, aider, github-copilot, cody,
# replit, codex, devin, bolt, cohere
```

### 分析命令
```bash
# 分析代码库
skill-seekers analyze --dir ./src --name my-codebase

# 生成架构图
skill-seekers analyze --dir ./src --name my-codebase --architecture

# 安全扫描
skill-seekers analyze --dir ./src --name my-codebase --security
```

## 2. C3.x AI 增强模块详解

### C3.1 设计模式识别
```
输入: 代码 AST
输出: 识别到的设计模式

检测范围:
  - 创建型: Singleton, Factory, Builder, Prototype
  - 结构型: Adapter, Bridge, Decorator, Proxy, Facade
  - 行为型: Observer, Strategy, Command, State, MVC
  - 架构型: Repository, Service Layer, DTO, Hexagonal

输出格式:
  Pattern: Repository (Clean Architecture)
  Location: src/infrastructure/persistence/
  Quality: Good (follows interface segregation)
  Suggestion: Consider adding cache layer
```

### C3.2 测试用例合成
```
输入: 源代码 + 被识别的模式
输出: 自动生成的测试用例骨架

覆盖:
  - Unit Test (每个公开方法)
  - Edge Case (null/empty/boundary)
  - Integration Test (跨层交互)
  - Error Path (异常流)
```

### C3.3 AI 增强 How-To
```
输入: 原始文档 (~75 行)
输出: 增强后 (~500+ 行)

增强内容:
  - 前置条件详解
  - 步骤间的原理解释
  - 常见错误和解决方案
  - 替代方案对比
  - 性能注意事项
```

### C3.4 配置模式提取
```
输入: 配置文件 (yml/json/toml)
输出:
  - 所有配置项说明
  - 默认值和推荐值
  - 环境变量映射
  - 安全扫描 (是否有硬编码密钥)
  - 配置依赖关系图
```

### C3.5 架构映射
```
输入: 代码库目录结构 + import 图
输出:
  - 模块依赖图 (可视化)
  - 服务调用链
  - 数据流图
  - 循环依赖检测
  - 未使用模块检测
```

## 3. 最佳实践

| 场景 | 推荐方式 |
|------|---------|
| 官方文档 | `scrape --prefer-llmstxt` (10x 快) |
| GitHub 仓库 | `github --include "src/**"` (排除测试/文档) |
| 扫描件 PDF | `pdf --ocr` (需 Poppler + Tesseract) |
| 大型代码库 | `analyze --architecture` (先看架构再细看) |
| 私有代码 | 不爬取, Agent 本地分析 (安全) |
| 大型文档 | `scrape --strategy router` (智能拆分) |

## 4. 产出入库流程 (与我们系统对接)

```
1. skill-seekers 生成原始 Skill
   → output/{name}/

2. 人工审核
   - 删除无关内容
   - 适配中文/双语
   - 遵循我们的 SKILL.md 格式

3. 放入对应层级
   - 通用工具 → .agent/warehouse/tools/{name}/
   - 内核增强 → .agent/core/skills/{name}.md
   - 项目特定 → .agent/projects/{project}/recipes/{name}.md

4. 更新索引
   - warehouse/README.md (工具库)
   - core/SKILL.md (工程核心)
   - 项目 CONTEXT.md (项目级)
```
