---
description: 发 — 本地开发, CI/CD, Docker, K8s, 灰度发布
---

# /ship — 发

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `本地`, `local`, `开发服务器`, `dev` | → §1 本地开发 |
| `CI/CD`, `pipeline`, `GitHub Actions` | → §2 CI/CD |
| `docker`, `镜像`, `compose` | → §3 Docker |
| `k8s`, `kubernetes`, `部署`, `pod` | → §4 Kubernetes |
| `发布`, `灰度`, `canary`, `rollout` | → §5 灰度发布 |
| `terraform`, `IaC`, `基础设施` | → §6 Terraform |

---

## §1 本地开发

### 环境启动

```bash
# 基础设施 (PostgreSQL + Redis + Kafka + etc)
docker compose -f infra/docker-compose.yml up -d

# 后端
./gradlew bootRun --args='--spring.profiles.active=dev'

# 前端
pnpm --filter web dev
```

### 开发服务器管理

| 规则 | 说明 |
|------|------|
| **端口占用检查** | 启动前先 `lsof -i :8080` / `lsof -i :3000` |
| **进程堆积防范** | 停止前 kill 旧进程: `pkill -f 'bootRun'` |
| **热重载** | 后端: Spring DevTools, 前端: Next.js Fast Refresh |
| **日志级别** | 开发: DEBUG, 生产: INFO |

### 环境变量 (.env.local)

```bash
# 数据库
DB_HOST=localhost
DB_PORT=5432
DB_NAME=myapp_dev
DB_USER=dev
DB_PASSWORD=dev_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# API
API_PORT=8080
NEXT_PUBLIC_API_URL=http://localhost:8080
```

---

## §2 CI/CD

### 全链路流程

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
│    - Vitest (Frontend)                   │
├──────────────────────────────────────────┤
│ 3. Integration Tests                     │
│    - Testcontainers (PG + Redis + Kafka) │
│    - API Contract Tests                  │
├──────────────────────────────────────────┤
│ 4. Security Scan                         │
│    - SAST (SonarQube / Semgrep)          │
│    - SCA (Dependency Check / Snyk)       │
├──────────────────────────────────────────┤
│ 5. Build                                 │
│    - Gradle bootJar (API)                │
│    - next build (Web)                    │
│    - Docker build + push                 │
├──────────────────────────────────────────┤
│ 6. Deploy to Staging (自动)              │
├──────────────────────────────────────────┤
│ 7. Deploy to Production (审批)           │
│    - Canary 10% → 50% → 100%            │
└──────────────────────────────────────────┘
```

---

## §3 Docker

### API Dockerfile (多阶段构建)

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

### Web Dockerfile

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

---

## §4 Kubernetes

### 部署模板

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: ${NAMESPACE}
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
          image: ${REGISTRY}/api:${TAG}
          ports:
            - containerPort: 8080
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
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 60
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
spec:
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          averageUtilization: 70
```

---

## §5 灰度发布

### Canary 流程

```
1. 部署 Canary (10% 流量)
   kubectl set image deployment/api api=${REGISTRY}/api:${NEW_TAG}
   kubectl scale deployment/api-canary --replicas=1

2. 监控 Canary (15 分钟)
   - Error rate < 1%
   - P99 latency < 2s
   - 无 OOM/CrashLoop

3. 扩大 (50% 流量)
   kubectl scale deployment/api-canary --replicas=2

4. 全量 (100%)
   kubectl set image deployment/api api=${REGISTRY}/api:${NEW_TAG}
   kubectl delete deployment/api-canary
```

### 回滚

```bash
# 一键回滚
kubectl rollout undo deployment/api -n ${NAMESPACE}

# 验证回滚
kubectl rollout status deployment/api -n ${NAMESPACE}
```

---

## §6 Terraform

### 目录结构

```
infra/terraform/
├── modules/
│   ├── vpc/
│   ├── kubernetes/
│   ├── database/
│   ├── redis/
│   ├── kafka/
│   └── monitoring/
├── environments/
│   ├── dev/main.tf
│   ├── staging/main.tf
│   └── prod/main.tf
├── variables.tf
├── outputs.tf
└── backend.tf        # State 存储 (S3/GCS)
```

### 环境一致性

| 环境 | 数据库 | Redis | Kafka |
|------|--------|-------|-------|
| **dev** | 单实例 | 单节点 | 单 broker |
| **staging** | 单实例 (生产数据子集) | 单节点 | 3 brokers |
| **prod** | 主从 + 自动备份 | 集群 (3节点) | 3 brokers |

---

*Version: 1.0.0 — Generic Core*
