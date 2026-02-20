---
description: /main_ship 工作流。Use when 需要本地开发、CI/CD、部署、灰度发布与回滚保障。
---

# /ship — 发

> 发布结论必须使用：`core/templates/ship-readiness-report-template.md`（固定结构：构建制品/部署前检查/风险窗口/结论/证据）
> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**
> **本文件是编排层 — 引用 L1 SOP, 不重复其内容。**

---

## 🔴 架构合规 (Architecture Reference — 强制)

> **所有部署/环境配置任务, 必须以项目架构规范为基准:**
> - 📐 主文件: `{project}/reference/architecture.md` (云原生基础设施, 弹性与韧性) — 见 `CONTEXT.md §7 参考资料索引`
> - 📚 参考: `{project}/reference/disaster-recovery.md` (灾备), `{project}/reference/resilience.md` (弹性), `{project}/reference/config-management.md` (配置)
>
> **Docker/K8s/CI-CD 配置必须符合项目架构规范（见 `{project}/reference/architecture-gate.md`）。**

---

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `本地`, `dev`, `启动`, `运行` | → §1 本地开发环境 |
| `Docker`, `镜像`, `容器`, `Dockerfile` | → §2 容器化 |
| `CI/CD`, `Pipeline`, `GitHub Actions`, `部署` | → §3 CI/CD 管道 |
| `K8s`, `Pod`, `Deployment`, `HPA` | → §4 K8s 部署 |
| `灰度`, `canary`, `blue-green`, `发布` | → §5 发布策略 |
| `回滚`, `rollback`, `紧急` | → §6 回滚协议 |

---

## §1 本地开发环境

> **加载:** `skills/infrastructure.md` §4 (Docker), `skills/platform.md` §5 (dev.sh)

### 启动清单

```bash
# 启动命令见 CONTEXT.md §5 工具命令速查

# 1. 环境准备（数据库/缓存/消息队列）
{infra_start_cmd}        # 见 CONTEXT.md §5.1

# 2. 后端启动
{backend_start_cmd}      # 见 CONTEXT.md §5.1

# 3. 前端启动
{frontend_start_cmd}     # 见 CONTEXT.md §5.1

# 4. 验证
curl {health_check_url}  # 后端健康检查（见 CONTEXT.md §3）
open {frontend_url}      # 前端
```

### 环境变量

```
.env.development — 本地开发
.env.production  — 生产环境 (禁止直接修改)

关键变量:
  DATABASE_URL, REDIS_URL, JWT_SECRET, API_PORT
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 端口占用 | 上次未关闭 | `lsof -i :3001` + `kill` |
| DB 连接失败 | Docker 未启动 | `./dev.sh up` |
| 热加载失效 | 文件监听上限 | `ulimit -n 4096` |

> 🔴 **问题复盘铁律:** 修复后 → `memory.md §3.2` 记录 + `memory.md §3.5` 交叉检查。

---

## §2 容器化

> **加载:** `skills/infrastructure.md` §4 (Docker) — 完整 Dockerfile 模板（API: 见 CONTEXT.md §3 后端镜像; Web: 见 CONTEXT.md §3 前端镜像）

### 镜像规范

| 规则 | 说明 |
|------|------|
| 基础镜像 | `*-alpine` (最小体积) |
| 多阶段 | 构建时依赖不进最终镜像 |
| .dockerignore | 排除 node_modules/dist/.git |
| 无 root | `USER node` |
| 健康检查 | `HEALTHCHECK CMD curl -f http://localhost:3001/health` |

---

## §3 CI/CD 管道

> **加载:** `skills/infrastructure.md` §5 (CI/CD)

### Pipeline 阶段 (标准)

```yaml
stages:
  - lint          # 代码风格检查
  - test          # 单元 + 集成测试
  - build         # 编译 + 镜像构建
  - security      # 漏洞扫描
  - deploy-staging  # 部署到 staging
  - e2e           # E2E 测试 (staging)
  - deploy-prod   # 部署到生产 (手动审批)
```

### 关键规则

```
1. 任何 lint/test 失败 → 整个 Pipeline 停止
2. 生产部署需要人工审批
3. 每次部署记录版本号 + commit hash
4. 部署后自动执行冒烟测试
```

---

## §4 K8s 部署

> **加载:** `skills/infrastructure.md` §2 (K8s) — 完整 Deployment/HPA 配置（RollingUpdate maxSurge:1 maxUnavailable:0，resources requests/limits，readinessProbe，HPA min:3 max:10 cpu:70%）

---

## §5 发布策略

> **加载:** `skills/infrastructure.md` §2 + `skills/platform.md` §3 (Feature Flag)

### 策略选择

| 策略 | 适用场景 | 风险 |
|------|---------|------|
| 滚动更新 | 日常更新 | 低 |
| Blue-Green | 大版本升级 | 中 (需双倍资源) |
| Canary | 高风险变更 | 低 (渐进) |
| Feature Flag | 功能级控制 | 最低 |

### Canary 发布 (推荐)

```
1. 部署 Canary (5% 流量)
2. 监控 15 分钟 (错误率/延迟)
3. 通过 → 提升到 25% → 50% → 100%
4. 不通过 → 立即回滚
```

---

## §6 回滚协议

> **加载:** `skills/observability.md` §8 (SRE)

### 回滚流程

```
1. 判定: 错误率 > 阈值 OR 用户报告
2. 决策: PM 或 CTO 授权回滚
3. 执行: kubectl rollout undo deployment/api-server
4. 验证: 健康检查 + 冒烟测试
5. 通知: 通知 PM → 通知用户
6. 复盘: 根因分析 → 事故报告
7. 🔴 问题复盘铁律 → `memory.md §3.2` 记录 + `memory.md §3.5` 交叉检查
```

### 回滚命令速查
```bash
# K8s 回滚
kubectl rollout undo deployment/api-server
kubectl rollout status deployment/api-server

# Docker 回滚
docker service update --rollback api-server

# 数据库 (谨慎!)
# Flyway 不支持自动回滚 — 需要写逆向迁移
```

---

## §7 交接闭环

每次发布必须以下列之一结束:

| 结果 | 交接对象 | 行动 |
|------|----------|------|
| ✅ 发布成功 | PM | 输出发布报告: 版本号 + 变更摘要 + 健康检查结果 |
| ⚠️ 灰度观察中 | CTO + PM | 灰度状态 + 指标监控中 + 预计全量时间 |
| 🔴 回滚 | CTO | 触发 §6 回滚协议 → 输出回滚报告 + 根因分析 |

```markdown
## Ship 完成报告
版本: {v1.x.x}
环境: {staging/production}
结果: {✅ 成功 / ⚠️ 灰度中 / 🔴 已回滚}
健康检查: {/actuator/health → UP}
交接: {PM/CTO}
```

---

*Version: 2.2.0 — Phase 1 精简*
