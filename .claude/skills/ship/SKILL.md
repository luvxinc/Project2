---

name: ship
description: "部署发布 — 本地环境、Docker、CI/CD、K8s、回滚"
---


你正在执行 MGMT ERP 的部署工作流。**环境预检请用 `/env-check`。部署问题排查请用 `/guard`。**

## 加载

1. `.claude/core/workflows/ship.md` — 用关键词路由跳到正确 section
2. `.claude/projects/mgmt/CONTEXT.md` §5（基础设施命令）

陷阱扫描: `.claude/projects/mgmt/data/errors/ERROR-BOOK.md` — 搜索关键词: Docker, deploy, CI, pipeline

如果上述文件不存在，读 `CLAUDE.md` 基础信息继续执行。

## 场景路由

| 关键词 | 场景 | ship.md section |
|--------|------|----------------|
| 本地开发、启动 | 本地环境搭建 | §1 |
| Docker、镜像 | 容器化 | §2 |
| CI/CD、Pipeline | 持续集成 | §3 |
| K8s、部署、发布 | Kubernetes 部署 | §4 |
| 灰度、蓝绿、金丝雀 | 发布策略 | §5 |
| 回滚、降级 | 回滚预案 | §6 |

## 当前服务状态

!`pnpm dev:status 2>/dev/null || echo "dev:status 不可用"`

## 交付格式

使用 `.claude/core/templates/ship-readiness-report-template.md`（如不存在则自由格式报告）

## 失败处理

- Docker build 失败 → 检查 Dockerfile + .dockerignore → 修复后重跑
- 部署超时 → 检查服务健康检查端点 → 资源不足则扩容
- 回滚失败 → 手动切换到上一个已知良好版本
- CI/CD Pipeline 失败 → 读错误日志 → 区分代码问题 vs 环境问题 → 对应修复

## 任务

$ARGUMENTS
