---

name: env-check
description: "环境预检 — 任务开始前验证开发环境完整性"
---


执行环境预检 SOP。

## 加载

读 `.claude/core/skills/environment-check.md` §1-§3（验证步骤，如存在）。
如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 逐步执行

### S1 Repo 结构完整性
!`ls .claude/core/skills/ .claude/core/workflows/ .claude/core/rules/ .claude/projects/mgmt/ 2>&1 | head -20`

### S2 文档引用完整性
!`bash .claude/core/scripts/agent-doc-audit.sh .claude 2>/dev/null || echo "审计脚本不存在，跳过"`

### S3 ERROR-BOOK 扫描
只读 `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` 的关键词索引，搜索与任务相关的条目: $ARGUMENTS
如果 ERROR-BOOK 不存在，跳过此步。

### S4 服务状态
!`curl -s http://localhost:3001/api/health 2>/dev/null || echo "后端未运行"`
!`curl -s http://localhost:3000 2>/dev/null | head -1 || echo "前端未运行"`

### S5 依赖完整性
!`[ -d node_modules ] && echo "node_modules: OK" || echo "node_modules: 缺失"`
!`[ -f mgmt-v3/build.gradle.kts ] && echo "后端项目: OK" || echo "后端项目: 缺失"`

## 输出格式

| 检查项 | 状态 | 备注 |
|--------|------|------|
| S1 Repo 结构 | Pass/Fail | |
| S2 文档引用 | Pass/Fail/Skip | |
| S3 ERROR-BOOK | OK | 发现 N 个相关陷阱 / 无 |
| S4 服务状态 | Pass/Fail/Skip | |
| S5 依赖完整 | Pass/Fail | |

**结论**: 全部通过 → 可安全执行 `/ship` 或 `/build` / 发现 N 个问题 → 列出阻塞项

## 任务

$ARGUMENTS
