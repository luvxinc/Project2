---
name: agent-tool-capability-matrix
description: Agent 工具能力矩阵。定义每类任务的首选工具、验证成功标志与失败处理策略。
---

# Agent 工具能力矩阵

> **用途**: Agent 在执行任务前确认自己有能力完成，并在失败时按标准流程处理。
> **何时加载**: 执行前预检（`skills/environment-check.md`）、遇到工具失败时。

---

## 核心工具映射

| 任务类型 | 首选工具 | 备用方案 | 验证成功标志 | 失败时 |
|----------|---------|---------|------------|------|
| 搜索文件（路径/名称） | `Glob` | `Bash find` | 返回路径列表 | 扩大 glob 范围，换关键词 |
| 搜索内容（关键词/正则） | `Grep` | `Bash grep -r` | 返回行 + 上下文 | 拆关键词分步搜，降低精确度 |
| 读取文件 | `Read` | — | 内容完整无截断 | 加 `offset` + `limit` 分段读 |
| 编辑文件 | `Edit` | `Write`（全量） | 文件保存成功 | 检查 old_string 是否精确匹配 |
| 创建新文件 | `Write` | — | 文件创建成功 | 确认父目录存在 |
| 验证编译/构建 | `Bash {build_cmd}` | — | exit 0 + 无 ERROR | 读完整错误栈，定位行号 |
| 验证测试 | `Bash {test_cmd}` | — | All PASSED | 看失败用例名，定位源码 |
| 检查 Lint | `Bash {lint_cmd}` | — | Zero warnings/errors | 按 rules/ 规则修复 |
| 检查类型 | `Bash {type_cmd}` | — | 零类型错误 | 从根错误修复，不打补丁 |
| 文档完整性 | `Bash agent-doc-audit.sh` | `Grep` dangling refs | Hard missing = 0 | 补引用或删孤立文件 |
| 数据库状态 | `Bash {migration_cmd}` | — | All migrations applied | 检查 migration 状态表 |
| 执行脚本 | `Bash {script_path}` | — | exit 0 | 先读脚本再执行，不盲目运行 |
| 网络请求/文档 | `WebFetch` / `WebSearch` | — | 返回有效内容 | 改 URL 或换关键词 |

> **`{build_cmd}` / `{test_cmd}` / `{lint_cmd}`**: 见 `CONTEXT.md §5 工具命令速查`（项目特定）

---

## 工具限制说明

| 工具 | 限制 | 应对 |
|------|------|------|
| `Read` | 默认读 2000 行；超长文件截断 | 用 `offset` + `limit` 分段，或用 `Grep` 定位行号后精准读 |
| `Grep` | 不支持跨文件 AST 分析 | 拆成多次 Grep 组合 |
| `Edit` | `old_string` 必须唯一精确匹配 | 扩大上下文范围；全文替换用 `replace_all: true` |
| `Bash` | 无交互式输入，无状态持久化 | 避免 `-i` flag；分步执行 |
| `WebFetch` | 无法访问认证/私有 URL | 改用 MCP 工具或 CLI 工具 |
| `Task` (Agent) | 返回单次结果，无法实时交互 | 用于独立子任务；结果通过 `TaskOutput` 读取 |

---

## 验证循环工具链（编译 → 测试 → Lint 完整通路）

```
1. BUILD:   Bash {build_cmd}   → exit 0 + BUILD SUCCESS
2. TYPES:   Bash {type_cmd}    → 零类型错误
3. LINT:    Bash {lint_cmd}    → Zero warnings
4. TEST:    Bash {test_cmd}    → All PASSED
5. COVER:   Bash {cover_cmd}   → ≥80%
6. AUDIT:   Bash npm audit     → 无高危漏洞
```

> **任何阶段失败 = STOP，不继续。最多重试 3 次/阶段，3 次仍失败 → 向用户报告。**

---

## 工具懒加载原则（JIT Loading）

> **来源**: Anthropic 2025-11 《Advanced Tool Use》— 懒加载相比全量加载节省 85% 工具调用 Token。

```
反模式 ❌: 任务开始时一次性加载所有 Skill SOP
正确模式 ✅: JIT（Just-In-Time）按需加载

操作规范:
  1. 遇到什么问题 → 根据 SKILL.md 路由表加载对应 Skill 的对应 section
  2. 加载前先读 frontmatter description → 确认是否相关（通常 <5 行）
  3. 加载完成并执行 → 用完及时释放（不在上下文中无限积累）
  4. 工具 SOP 通过文件系统懒加载 → 不要提前预取（context 有限）

进阶: Tool Search Tool 模式（如框架支持）
  - 暴露工具描述列表（轻量）
  - Agent 按名称 + 描述决定是否加载完整文档
  - 减少不必要的大文件加载
```

---

## Agent 能力边界

以下任务超出 Agent 工具能力，**必须停下来报告用户**：

| 超界情况 | 原因 | 应对 |
|---------|------|------|
| 访问 Docker/K8s 集群 | 无权限工具 | 提供命令让用户手动执行 |
| 实时调试运行中进程 | 无 attach 能力 | 提供调试步骤让用户执行 |
| 访问生产数据库数据 | 安全边界 | 提供查询让用户确认后执行 |
| 发送外部通知/消息 | 副作用操作 | 征得用户确认后才执行 |
| 修改 `.env` 生产凭据 | 🔴 安全铁律 | 禁止，告知用户手动设置 |

---

*Version: 1.0.0 — B3 Harness Engineering 组件*
*Created: 2026-02-19*
