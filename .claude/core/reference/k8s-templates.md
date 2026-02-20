# Kubernetes 模板参考

> **来源**: `skills/infrastructure.md §2` 压缩时外迁
> **用途**: 标准 Deployment / HPA / Service / ConfigMap 完整 YAML，供部署时参考
> **项目特定**: `{REGISTRY}` = 镜像仓库地址，`{PROJECT}` = 项目名，`{VERSION}` = 镜像标签，namespace → 见 `CONTEXT.md §3`

---

## API Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-server
  namespace: app-prod
  labels:
    app: api-server
    version: "1.0.0"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-server
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1           # 最多多起 1 个新 Pod
      maxUnavailable: 0     # 零停机：旧 Pod 等新 Pod 健康才删
  template:
    metadata:
      labels:
        app: api-server
    spec:
      containers:
        - name: api-server
          image: {REGISTRY}/{PROJECT}/api-server:latest
          ports:
            - containerPort: 8080
          resources:
            requests:
              cpu: "500m"
              memory: "1Gi"
            limits:
              cpu: "2000m"
              memory: "4Gi"
          readinessProbe:
            httpGet:
              path: /actuator/health/readiness
              port: 8080
            initialDelaySeconds: 30
            periodSeconds: 10
            failureThreshold: 3
          livenessProbe:
            httpGet:
              path: /actuator/health/liveness
              port: 8080
            initialDelaySeconds: 60
            periodSeconds: 30
            failureThreshold: 3
          envFrom:
            - secretRef:
                name: api-server-secrets    # 禁止硬编码凭据
            - configMapRef:
                name: api-server-config
          env:
            - name: SPRING_PROFILES_ACTIVE
              value: "production"
            - name: POD_NAME
              valueFrom:
                fieldRef:
                  fieldPath: metadata.name
```

---

## Web Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
  namespace: app-prod
spec:
  replicas: 2
  selector:
    matchLabels:
      app: web-app
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
  template:
    metadata:
      labels:
        app: web-app
    spec:
      containers:
        - name: web-app
          image: {REGISTRY}/{PROJECT}/web-app:latest
          ports:
            - containerPort: 3000
          resources:
            requests:
              cpu: "200m"
              memory: "256Mi"
            limits:
              cpu: "1000m"
              memory: "1Gi"
          readinessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /api/health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 30
          envFrom:
            - configMapRef:
                name: web-app-config
```

---

## HPA (Horizontal Pod Autoscaler)

```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-server-hpa
  namespace: app-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-server
  minReplicas: 3
  maxReplicas: 10
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70    # CPU 超 70% 触发扩容
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

---

## Service

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-server
  namespace: app-prod
spec:
  selector:
    app: api-server
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: ClusterIP    # 内部服务；对外通过 Ingress 暴露
```

---

## ConfigMap (非敏感配置)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: api-server-config
  namespace: app-prod
data:
  SPRING_PROFILES_ACTIVE: "production"
  SERVER_PORT: "8080"
  MANAGEMENT_PORT: "8081"
```

---

## 关键设计原则

| 原则 | 配置说明 |
|------|---------|
| **零停机** | `maxUnavailable: 0` — 新 Pod 健康后才删旧 Pod |
| **弹性扩缩** | HPA minReplicas 3 防单点；cpu 70% 扩容防突刺 |
| **凭据安全** | 所有密钥从 `secretRef` 注入，禁止写在 ConfigMap 或镜像中 |
| **健康探针分离** | readiness（流量切入）vs liveness（重启）探针路径不同 |
| **资源保障** | requests 保证最低资源；limits 防止单 Pod OOM 蔓延 |

---

*来源: infrastructure.md §2 | Version: 1.0.0 | Created: 2026-02-19*
