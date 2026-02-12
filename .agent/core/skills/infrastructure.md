---
name: infrastructure
description: 基建架构师 — Kubernetes + Terraform + Docker + CI/CD。负责容器编排/基础设施即代码/持续交付/灾备。
---

# 基础设施规范 — Kubernetes + Terraform + CI/CD

> **你是基建架构师。你的职责是: 设计+实现容器编排、基础设施自动化、CI/CD 管道、灾备方案。**
> **⚠️ 本文件 ~12KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

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

```
┌─────────────────────────────────────────────────────────┐
│                    Kubernetes Cluster                    │
│                                                         │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │  Namespace:  │  │  Namespace:  │  │  Namespace:   │  │
│  │  production  │  │  staging     │  │  monitoring   │  │
│  │             │  │              │  │               │  │
│  │ ┌─────────┐ │  │              │  │ ┌───────────┐ │  │
│  │ │ API     │ │  │              │  │ │ Prometheus│ │  │
│  │ │ (3 pods)│ │  │              │  │ │ Grafana   │ │  │
│  │ └─────────┘ │  │              │  │ │ Loki      │ │  │
│  │ ┌─────────┐ │  │              │  │ │ Tempo     │ │  │
│  │ │ Web     │ │  │              │  │ └───────────┘ │  │
│  │ │ (2 pods)│ │  │              │  │               │  │
│  │ └─────────┘ │  │              │  │               │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │              Infrastructure Services             │    │
│  │  PostgreSQL · Redis · Kafka · OpenSearch · CH    │    │
│  │  (Managed services or StatefulSets)              │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

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

### 2.2 API 部署示例

```yaml
# kubernetes/api-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: app-api
  namespace: app-prod
spec:
  replicas: 3
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    spec:
      containers:
        - name: api
          image: harbor.app.com/app/api:${TAG}
          ports:
            - containerPort: 8080
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: production
            - name: DB_HOST
              valueFrom:
                secretKeyRef:
                  name: app-secrets
                  key: db-host
          resources:
            requests:
              cpu: 500m
              memory: 1Gi
            limits:
              cpu: 2000m
              memory: 4Gi
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 30
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: app-api-hpa
  namespace: app-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: app-api
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
```

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

### 4.1 API Dockerfile (多阶段构建)

```dockerfile
# Stage 1: Build
FROM gradle:8-jdk21-alpine AS builder
WORKDIR /app
COPY build.gradle.kts settings.gradle.kts ./
COPY src/ src/
RUN gradle bootJar --no-daemon -x test

# Stage 2: Runtime
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/build/libs/*.jar app.jar
USER appuser
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://localhost:8080/actuator/health || exit 1
ENTRYPOINT ["java", "-jar", "app.jar"]
```

### 4.2 Web Dockerfile

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable pnpm
COPY pnpm-lock.yaml package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/ packages/
RUN pnpm install --frozen-lockfile
COPY apps/web/ apps/web/
RUN pnpm --filter web build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
```

### 4.3 本地开发 (docker-compose)

```yaml
# infra/docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: app_erp
      POSTGRES_USER: app
      POSTGRES_PASSWORD: dev_password
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  kafka:
    image: confluentinc/cp-kafka:7.6.0
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@kafka:9093
      KAFKA_LISTENERS: PLAINTEXT://0.0.0.0:9092,CONTROLLER://0.0.0.0:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      CLUSTER_ID: MkU3OEVBNTcwNTJENDM2Qk

  opensearch:
    image: opensearchproject/opensearch:2.12.0
    ports: ["9200:9200"]
    environment:
      discovery.type: single-node
      DISABLE_SECURITY_PLUGIN: "true"

  clickhouse:
    image: clickhouse/clickhouse-server:24
    ports: ["8123:8123", "9000:9000"]

volumes:
  pgdata:
```

---

## 5. CI/CD 管道

### 5.1 全链路流程

```
Push / PR
    ↓
┌──────────────────────────────────────────┐
│ 1. Lint & Format Check                   │
│    - ktlint (Kotlin)                     │
│    - eslint + prettier (Frontend)        │
├──────────────────────────────────────────┤
│ 2. Unit Tests                            │
│    - JUnit 5 + MockK (Backend)           │
│    - Jest (Frontend)                     │
├──────────────────────────────────────────┤
│ 3. Integration Tests                     │
│    - Testcontainers (PG + Redis + Kafka) │
│    - API Contract Tests                  │
├──────────────────────────────────────────┤
│ 4. Security Scan                         │
│    - SAST (SonarQube / Semgrep)          │
│    - SCA (Dependency Check / Snyk)       │
│    - SBOM Generation                     │
├──────────────────────────────────────────┤
│ 5. Build                                 │
│    - Gradle bootJar (API)                │
│    - next build (Web)                    │
│    - Docker build + push to Harbor       │
├──────────────────────────────────────────┤
│ 6. Deploy to Staging (自动)              │
│    - K8s rolling update                  │
│    - Smoke tests                         │
├──────────────────────────────────────────┤
│ 7. Deploy to Production (审批)           │
│    - Canary deployment (10% → 50% → 100%)│
│    - Health check gates                  │
│    - Automatic rollback on failure       │
└──────────────────────────────────────────┘
```

### 5.2 GitHub Actions 示例

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports: ["5432:5432"]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
      - run: ./gradlew test
      - run: ./gradlew ktlintCheck

  frontend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'pnpm'
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web lint
      - run: pnpm --filter web build

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: returntocorp/semgrep-action@v1
      - run: ./gradlew dependencyCheckAnalyze

  deploy-staging:
    needs: [backend-test, frontend-test, security-scan]
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - run: |
          docker build -t harbor.app.com/app/api:${{ github.sha }} apps/api/
          docker push harbor.app.com/app/api:${{ github.sha }}
          kubectl set image deployment/app-api api=harbor.app.com/app/api:${{ github.sha }} -n app-staging
```

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

*Version: 1.0.0 — Generic Core*
*Based on: battle-tested enterprise patterns*
