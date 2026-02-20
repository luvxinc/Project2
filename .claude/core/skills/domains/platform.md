---
name: platform-engineering
description: 平台工程域 — 基础设施/CI-CD/容器/监控/性能/开发者工具/技术债治理。
---

# 平台工程部

> **CTO 路由到此文件后, 按关键词选择加载对应工程师 SOP 的对应 section。**
> **禁止全部加载。只加载命中的。**

## 部门职能总览

```
平台工程部
├── 基建架构师 ─── infrastructure.md
│   ├── K8s 部署 ─────── §2 Pod/HPA/滚动更新
│   ├── Terraform ────── §3 IaC/模块化/状态管理
│   ├── Docker ────────── §4 镜像/多阶段构建
│   ├── CI/CD 管道 ───── §5 Pipeline/自动化部署
│   └── 灾备与高可用 ─── §6 多副本/故障转移
│
├── 可观测架构师 ── observability.md
│   ├── 三支柱总览 ───── §1 Metrics/Tracing/Logging
│   ├── OpenTelemetry ── §2 统一遥测采集
│   ├── Prometheus ───── §3 指标 + Micrometer
│   ├── 结构化日志 ───── §4 Loki + JSON 格式
│   ├── Grafana ────────── §5 仪表盘设计
│   ├── 告警规则 ──────── §6 告警阈值 + 分级
│   ├── 遗留迁移 ──────── §7 旧系统可观测改造
│   └── SRE 实践 ──────── §8 SLO/错误预算/事故复盘
│
├── 性能工程师 ──── performance.md
│   ├── 后端性能 ──────── §1 N+1/索引/批量
│   ├── 缓存策略 ──────── §2 L1/L2/L3 多级缓存
│   ├── 前端性能 ──────── §3 React 渲染/Next.js
│   ├── 性能指标 ──────── §4 P95/LCP/告警
│   └── 反模式清单 ───── §5 禁止列表
│
└── 平台工程师 ──── platform.md
    ├── 脚手架 ────────── §1 模块/页面模板
    ├── 代码生成 ──────── §2 OpenAPI→TS/DB→Entity
    ├── Feature Flag ─── §3 功能开关管理
    ├── 技术债治理 ───── §4 分类/登记/节奏
    ├── 开发者效率 ───── §5 dev.sh/Git Hooks
    ├── 内部文档 ──────── §6 文档平台
    └── 目录重组 ──────── §7 重组检查清单 (SV-001)
```

## 工程师索引 (按职能精准跳转)

### 基础设施

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `K8s`, `Pod`, `HPA`, `Deployment` | 基建架构师 | `core/skills/infrastructure.md` §2 | K8s 资源定义/扩缩容/滚动更新 |
| `Terraform`, `IaC`, `状态` | 基建架构师 | `core/skills/infrastructure.md` §3 | 基础设施即代码/模块化 |
| `Docker`, `镜像`, `Dockerfile` | 基建架构师 | `core/skills/infrastructure.md` §4 | 多阶段构建/镜像优化 |
| `CI/CD`, `Pipeline`, `GitHub Actions` | 基建架构师 | `core/skills/infrastructure.md` §5 | 自动化测试→构建→部署 |
| `灾备`, `高可用`, `多副本` | 基建架构师 | `core/skills/infrastructure.md` §6 | 故障转移/备份恢复 |

### 可观测性

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `Prometheus`, `Metrics`, `指标` | 可观测架构师 | `core/skills/observability.md` §3 | 指标采集/Micrometer/自定义指标 |
| `OpenTelemetry`, `Tracing`, `链路` | 可观测架构师 | `core/skills/observability.md` §2 | 分布式追踪/Span/上下文传播 |
| `日志`, `Loki`, `结构化` | 可观测架构师 | `core/skills/observability.md` §4 | JSON 日志/日志聚合/查询 |
| `Grafana`, `仪表盘`, `Dashboard` | 可观测架构师 | `core/skills/observability.md` §5 | 仪表盘设计/模板 |
| `告警`, `Alert`, `阈值` | 可观测架构师 | `core/skills/observability.md` §6 | 告警规则/分级/通知 |
| `SRE`, `SLO`, `事故`, `复盘` | 可观测架构师 | `core/skills/observability.md` §8 | SLO 定义/错误预算/事故管理 |

### 性能优化

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `N+1`, `慢查询`, `索引`, `批量` | 性能工程师 | `core/skills/performance.md` §1 | JPA 优化/EXPLAIN/批量操作 |
| `缓存`, `Redis`, `Caffeine`, `TTL` | 性能工程师 | `core/skills/performance.md` §2 | 多级缓存/失效策略/雪崩防护 |
| `React`, `渲染`, `bundle`, `LCP` | 性能工程师 | `core/skills/performance.md` §3 | memo/Code Splitting/虚拟滚动 |
| `P95`, `P99`, `性能指标` | 性能工程师 | `core/skills/performance.md` §4 | SLA 指标/慢查询治理 |

### 平台工具

| 关键词 | 工程师 | section | 具体能力 |
|--------|--------|---------|---------|
| `脚手架`, `scaffold`, `模板` | 平台工程师 | `platform.md` §1 | 后端/前端模块一键生成 |
| `代码生成`, `OpenAPI`, `Entity` | 平台工程师 | `platform.md` §2 | 自动生成 TS Client/JPA Entity |
| `Feature Flag`, `开关`, `灰度` | 平台工程师 | `platform.md` §3 | 功能开关/前后端 Flag 管理 |
| `技术债`, `重构`, `清理` | 平台工程师 | `platform.md` §4 | 技术债分类/登记/治理节奏 |
| `dev.sh`, `效率`, `Git Hook` | 平台工程师 | `platform.md` §5 | 开发脚本/统一工具链 |
| `目录重组`, `重命名`, `迁移` | 平台工程师 | `platform.md` §7 | 重组后引用更新检查清单 |

## 域内协调规则

```
平台域通常独立于业务域:
  - 不依赖 Spec 中的业务需求
  - 通常由 CTO 主动发起 (非 PM 需求驱动)

内部依赖:
  - 性能问题 → 可能需联动 基建 (K8s 资源) + 可观测 (指标)
  - 告警配置 → 可观测架构师定义 + 基建架构师部署
  - 技术债治理 → 平台工程师主导, 全员参与

跨域场景:
  - 后端性能问题 → 联动 服务工程域 (data.md 慢查询 + backend.md 事务)
  - 前端性能问题 → 联动 产品工程域 (frontend.md §3 组件优化)

跨域联动:
  → 与 Service 域: 性能指标采集 / 日志格式 / 告警规则
  → 与 Product 域: 前端性能监控 / 静态资源优化
```

## L3 工具 (域级推荐)

| 场景 | 工具 | 路径 | 何时加载 |
|------|------|------|---------|
| 部署策略 | Ship 工作流 | `workflows/ship.md` | CI/CD + Docker + K8s 部署 |
| 故障排查 | Guard 工作流 | `workflows/guard.md` | TDD/审查/事故响应 |
| 代码审查 | ECC: Review §3 | `warehouse/tools/everything-claude-code/01-agents-review.md` | 配置/基建反模式检查 |
| 编码规范 | ECC: Rules §1 | `warehouse/tools/everything-claude-code/02-rules-hooks.md` | 文件组织/命名规范 |
| Skill 创建 | Anthropic Skills | `warehouse/tools/anthropic-skills/01-spec-template.md` | 新 Skill 文件规范 |
| Skill 生成 | Skill Seekers | `warehouse/tools/skill-seekers/01-commands-modules.md` | 文档→Skill 转换 |

---

*Version: 2.1.0 — 新增跨域联动标注*
