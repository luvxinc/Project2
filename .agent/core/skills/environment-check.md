---
name: environment-check
description: 环境预检 SOP。每次任务开始前强制执行，确认工作环境完整后再进入 IN_PROGRESS。
---

# 环境预检 SOP（Environment Pre-Check）

> **核心原则: 环境不对 = 任务不开始。宁可多花 2 分钟检查，不要花 2 小时排查环境问题。**
> **触发时机**: 每次任务 ASSIGNED 后进入 IN_PROGRESS 前；切换分支后；跨会话继续工作时。

---

## 检查流程

```
收到任务
    │
    ▼
┌─── 通用检查（所有任务）────────────────┐
│  §1 Repo 结构完整性                   │
│  §2 文档引用完整性                    │
│  §3 ERROR-BOOK 关键词扫描             │
│  §3.1 框架评估（可选: kernel-eval-harness.sh）│
└──────────────────────────────────────┘
    │
    ▼
┌─── 项目特定检查（见 CONTEXT.md §5 工具命令速查）──┐
│  §4 服务状态                              │
│  §5 依赖完整性                             │
└──────────────────────────────────────────┘
    │
    ▼  全部通过？
   YES → 进入 IN_PROGRESS
   NO  → 停止，报告缺失项，不开始任务
```

---

## §1 Repo 结构完整性

检查项目关键目录和文件是否存在：

```bash
# 检查 .agent 核心目录
ls .agent/core/skills/
ls .agent/core/workflows/
ls .agent/core/rules/
ls .agent/projects/{project}/   # {project} 来自 CONTEXT.md §2
```

**通过标准**: 关键目录存在，无"No such file"错误

---

## §2 文档引用完整性

检查文档引用链是否有断链（dangling references）：

```bash
# 运行文档审计脚本（如果存在）
bash .agent/core/scripts/agent-doc-audit.sh 2>/dev/null || echo "脚本不存在，跳过"
```

**通过标准**: Hard missing (引用不存在的文件) = 0
**发现问题**: 记录到报告，补引用或移除孤立文件，不继续任务

---

## §3 ERROR-BOOK 关键词扫描

在 ERROR-BOOK 中搜索当前任务相关的已知陷阱：

```bash
# 提取当前任务的关键词，在 ERROR-BOOK 中搜索
grep -i "{task_keyword_1}\|{task_keyword_2}" \
  .agent/projects/{project}/data/errors/ERROR-BOOK.md
```

**通过标准**: 扫描完成，已记录相关已知陷阱
**发现已知陷阱**: 在任务 Spec 的"风险与陷阱"中提前标注，不是停止任务

---

## §4 服务状态（项目特定）

> **具体检查命令见 `{project}/CONTEXT.md §5 工具命令速查` 或项目 README**

通用检查模板：

```bash
# 后端服务健康检查
curl -s http://localhost:{PORT}/health | grep -q "UP\|ok\|healthy"

# 数据库连接
# 具体命令见 CONTEXT.md §5
```

**通过标准**: 所有依赖服务正常响应
**发现问题**: 启动服务，或向用户报告服务异常

---

## §5 依赖完整性（项目特定）

> **具体命令见 `{project}/CONTEXT.md §5`**

通用检查模板：

```bash
# 前端依赖
[ -d node_modules ] || echo "❌ node_modules 缺失，需要安装"

# 数据库迁移状态
# 具体命令见 CONTEXT.md §5
```

**通过标准**: 依赖已安装，迁移已应用
**发现问题**: 运行安装命令，或向用户报告需要手动处理

---

## 检查报告格式

```
## 🔍 环境预检报告

| 检查项 | 状态 | 备注 |
|--------|------|------|
| §1 Repo 结构 | ✅ / ❌ | |
| §2 文档引用 | ✅ / ❌ | Hard missing: N 个 |
| §3 ERROR-BOOK 扫描 | ✅ | 发现已知陷阱: {列表} / 无 |
| §4 服务状态 | ✅ / ❌ / ⏭️ 跳过 | |
| §5 依赖完整性 | ✅ / ❌ / ⏭️ 跳过 | |

**结论**: 全部通过 → 开始任务 / 发现 N 个问题 → 暂停
```

---

## 失败处理

| 检查失败 | 可自动修复 | 需用户介入 |
|---------|-----------|-----------|
| 服务未启动 | `./dev.sh up`（参考 CONTEXT.md §5） | 服务启动失败报错 |
| 依赖未安装 | `npm install` / `pnpm install` | 安装报错 |
| 迁移未应用 | `{migration_cmd}` | 迁移冲突 |
| 文档引用断链 | 补引用或删文件 | 无法判断正确引用时 |
| 权限不足 | — | 🔴 必须用户介入 |

---

*Version: 1.0.0 — B1 Harness Engineering 组件*
*Created: 2026-02-19*
