---
name: infrastructure
description: 基建架构师 SOP（Kubernetes/Terraform/Docker/CI-CD）。Use when 需要部署、基础设施变更、发布流水线或灾备方案。
---

# 基础设施规范 — Kubernetes + Terraform + CI/CD

> **你是基建架构师。你的职责是: 设计+实现容器编排、基础设施自动化、CI/CD 管道、灾备方案。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `架构`, `总览`, `云原生` | → §1 云原生架构总览 |
| `k8s`, `kubernetes`, `pod`, `namespace`, `deployment` | → §2 Kubernetes 部署 |
| `terraform`, `IaC`, `模块` | → §3 Terraform |
| `docker`, `dockerfile`, `compose`, `镜像` | → §4 Docker |
| `CI/CD`, `pipeline`, `github actions`, `部署` | → §5 CI/CD 管道 |
| `灾备`, `高可用`, `备份`, `回滚` | → §6 灾备与高可用 |

---

> **企业级云原生: 高可用, 自动扩缩, 基础设施即代码, 全链路 CI/CD。**

---

## 1. 云原生架构总览

K8s 集群包含三类 Namespace：`production`（后端实例 + 前端实例）、`staging`、`monitoring`（可观测性栈），底层基础设施（数据库/缓存/消息队列/搜索 — 托管服务或 StatefulSet）。见 `CONTEXT.md §3` 获取当前服务清单。

---

## 2. Kubernetes 部署

### 2.1 命名空间

| Namespace | 用途 |
|-----------|------|
| `app-prod` | 生产环境 |
| `app-staging` | 预发布/灰度测试 |
| `app-dev` | 开发环境 |
| `monitoring` | 可观测性栈 (Prometheus/Grafana/Loki) |
| `infra` | 基础设施服务 (Kafka/Redis/PG — 如不用托管) |

### 2.2 API 部署规范

**Deployment 关键配置**（完整模板 → `core/reference/k8s-templates.md`）：
- `strategy: RollingUpdate` (maxSurge: 1, maxUnavailable: 0)
- `resources.requests`: cpu 500m / memory 1Gi；`limits`: cpu 2000m / memory 4Gi
- `readinessProbe`: `{health_readiness_path}`（见 `CONTEXT.md §3`） delay 30s period 10s
- `livenessProbe`: `{health_liveness_path}`（见 `CONTEXT.md §3`） delay 60s period 30s
- 环境变量从 `secretKeyRef` 注入（禁止硬编码）

**HPA 规范**：minReplicas 3 / maxReplicas 10 / cpu averageUtilization 70

---

## 3. Terraform (基础设施即代码)

### 3.1 目录结构

```
infra/terraform/
├── modules/
│   ├── vpc/              # 网络
│   ├── kubernetes/       # K8s 集群
│   ├── database/         # PostgreSQL (RDS/CloudSQL)
│   ├── redis/            # Redis (ElastiCache)
│   ├── kafka/            # Kafka (MSK/Confluent)
│   ├── opensearch/       # OpenSearch (托管)
│   ├── vault/            # HashiCorp Vault
│   └── monitoring/       # Prometheus + Grafana 栈
│
├── environments/
│   ├── dev/
│   │   └── main.tf
│   ├── staging/
│   │   └── main.tf
│   └── prod/
│       └── main.tf
│
├── variables.tf
├── outputs.tf
└── backend.tf            # Terraform state (S3/GCS)
```

### 3.2 环境一致性

| 环境 | 数据库 | Redis | Kafka | 用途 |
|------|--------|-------|-------|------|
| **dev** | PG (单实例) | 单节点 | 单 broker | 本地/团队开发 |
| **staging** | PG (单实例, 生产数据子集) | 单节点 | 3 brokers | 预发布测试 |
| **prod** | PG (主从, 自动备份) | 集群 (3节点) | 3 brokers | 生产 |

---

## 4. Docker

### 4.1 API Dockerfile（完整模板 → `core/reference/dockerfile-templates.md`）

多阶段构建：构建镜像（含构建工具）→ 运行镜像（最小 Runtime）。
非 root 用户 + `HEALTHCHECK {health_path}` + `EXPOSE {port}`。

> **基础镜像版本**: 见 `CONTEXT.md §3 后端技术栈`（gradle/maven 构建基础镜像 + JRE/runtime 运行镜像）。

### 4.2 Web Dockerfile（完整模板 → `core/reference/dockerfile-templates.md`）

多阶段构建：构建镜像（含 Node.js + 包管理器）→ 运行镜像（standalone/output 模式）。
`EXPOSE {port}`、`CMD ["{start_command}"]`。

> **镜像版本**: 见 `CONTEXT.md §3 前端技术栈`（Node.js 版本 + 包管理器 + 框架 output 模式）。

### 4.3 本地开发 (docker-compose)

`infra/docker-compose.yml` 包含以下服务：

| 服务 | 镜像 | 端口 |
|------|------|------|
| 关系型数据库 | 见 CONTEXT.md §3 | 见 CONTEXT.md §5 |
| 缓存 | 见 CONTEXT.md §3 | 见 CONTEXT.md §5 |
| 消息队列 | 见 CONTEXT.md §3 | 见 CONTEXT.md §5 |
| 搜索引擎 | 见 CONTEXT.md §3 | 见 CONTEXT.md §5 |
| OLAP | 见 CONTEXT.md §3 | 见 CONTEXT.md §5 |

> **具体镜像版本**: 见 `CONTEXT.md §3 数据存储层` 的版本锁定列表。

---

## 5. CI/CD 管道

Push/PR 触发，7 个阶段顺序执行：

1. **Lint** — 见 `CONTEXT.md §5 lint_cmd`
2. **Unit Tests** — 见 `CONTEXT.md §5 test_cmd`
3. **Integration Tests** — 见 `CONTEXT.md §5 integration_test_cmd`
4. **Security Scan** — Semgrep (SAST) + 依赖扫描 (SCA) + SBOM
5. **Build** — 见 `CONTEXT.md §5 build_cmd` + Docker → 镜像仓库
6. **Deploy Staging**（自动）— K8s rolling update + smoke tests
7. **Deploy Production**（人工审批）— Canary 10%→50%→100%，失败自动回滚

### 5.2 GitHub Actions 关键模式

```yaml
# 通用 CI 模式（具体命令见 CONTEXT.md §5）
jobs:
  backend-test:
    # 1. 安装运行时（版本见 CONTEXT.md §3）
    # 2. 运行 lint_cmd + test_cmd
  frontend-test:
    # 1. 安装 Node.js + 包管理器（版本见 CONTEXT.md §3）
    # 2. 运行 frontend_lint_cmd + frontend_build_cmd
  security-scan:
    # semgrep-action + 依赖漏洞扫描
  deploy-staging:
    needs: [backend-test, frontend-test, security-scan]
    if: github.ref == 'refs/heads/main'
    # build_cmd → docker build + push → kubectl rollout
```

> **具体版本和命令**: 见 `CONTEXT.md §3 技术栈` + `§5 工具命令速查`。

---

## 6. 灾备与高可用

| 维度 | 方案 | SLA |
|------|------|-----|
| **数据库备份** | 每日全量 + 持续 WAL 归档 | RPO < 1h |
| **数据库副本** | PostgreSQL Streaming Replication | 自动故障转移 |
| **应用高可用** | K8s 3+ Pod + HPA | 99.9% uptime |
| **跨区域灾备** | 异地冷备 (数据库副本 + MinIO 镜像) | RTO < 4h |
| **回滚** | K8s Revision History + Flyway undo | < 5min |

---

---

*Version: 2.1.0 — L1 泛化：移除 ktlint/gradle/docker 特定命令，改为 CONTEXT.md §5 引用*
*Updated: 2026-02-19*
