# 混沌工程参考

> **来源**: `skills/qa-auditor.md §8` 压缩时外迁
> **用途**: 故障注入实验设计 + 稳态验证，非日常使用，按需加载

---

## 原则

| 原则 | 说明 |
|------|------|
| **先定义稳态** | 实验前必须定义"正常"是什么（P95 < 500ms，错误率 < 0.1%） |
| **先在 staging** | 所有实验先在 staging 验证，通过后才在 prod 执行 |
| **最小爆炸半径** | 从单个 Pod 开始，逐步扩大范围 |
| **随时可停** | 有回滚机制，一旦超出预期立即终止 |
| **记录学习** | 每个实验结果写入 ERROR-BOOK 和 PROJECT-MEMORY |

---

## 工具

| 工具 | 场景 | 文档 |
|------|------|------|
| Chaos Mesh | K8s 原生故障注入（Pod/网络/磁盘） | https://chaos-mesh.org |
| Toxiproxy | 网络延迟/断开模拟（本地开发） | https://github.com/Shopify/toxiproxy |
| `kubectl` | Pod 强杀、资源限制 | K8s 内置 |

---

## 实验模板

### 实验 1：Pod 随机故障

**目标**: 验证 K8s 自愈 + HPA 扩容
**稳态**: P95 < 500ms，错误率 < 1%

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: PodChaos
metadata:
  name: pod-failure-test
  namespace: app-staging
spec:
  action: pod-failure
  mode: one                         # 随机选 1 个 Pod
  selector:
    namespaces: [app-staging]
    labelSelectors:
      app: api-server
  duration: "5m"                    # 故障持续 5 分钟
```

**验证步骤**:
1. 执行实验
2. 观察 Grafana：错误率是否超过稳态阈值？
3. 观察 K8s：新 Pod 是否在 2 分钟内重启并健康？
4. 记录结果（通过/失败 + 恢复时间）

---

### 实验 2：网络延迟注入

**目标**: 验证超时配置 + 熔断降级
**稳态**: 外部调用 timeout 正确触发，无级联失败

```yaml
apiVersion: chaos-mesh.org/v1alpha1
kind: NetworkChaos
metadata:
  name: network-delay-test
  namespace: app-staging
spec:
  action: delay
  mode: one
  selector:
    namespaces: [app-staging]
    labelSelectors:
      app: api-server
  delay:
    latency: "2s"                   # 注入 2s 延迟（超过大多数 timeout）
    correlation: "25"
    jitter: "500ms"
  direction: to
  duration: "3m"
```

---

### 实验 3：数据库连接池耗尽

**目标**: 验证连接池拒绝逻辑 + 友好错误返回
**工具**: 模拟高并发 DB 请求（k6 + 短 timeout）

```bash
# 使用 k6 模拟 100 VU 同时命中 DB 密集接口
k6 run -e BASE_URL=http://api-staging.internal \
  --vus 100 --duration 2m \
  scripts/db-heavy-load.js
```

**验证**: API 返回 503 (服务暂时不可用)，而非 500 或超时卡死。

---

### 实验 4：本地网络断开 (Toxiproxy)

```bash
# 启动 Toxiproxy
docker run -d -p 8474:8474 -p 5433:5433 shopify/toxiproxy

# 配置代理到真实 PG
toxiproxy-cli create --listen 0.0.0.0:5433 --upstream localhost:5432 postgres-proxy

# 注入延迟
toxiproxy-cli toxic add -t latency -a latency=3000 postgres-proxy

# 验证应用行为后清除
toxiproxy-cli toxic remove -n latency_downstream postgres-proxy
```

---

## 实验记录模板

```markdown
## 混沌实验记录 — YYYY-MM-DD

### 实验名称
{Pod 故障 / 网络延迟 / DB 连接耗尽}

### 稳态定义
- P95 响应时间: < {阈值}ms
- 错误率: < {阈值}%
- 恢复时间: < {阈值}min

### 实验结果
| 指标 | 目标 | 实测 | 通过? |
|------|------|------|-------|
| 错误率峰值 | < 1% | X.X% | ✅/❌ |
| 恢复时间 | < 2min | Xmin | ✅/❌ |

### 发现的问题
{描述发现的问题，写入 ERROR-BOOK}

### 改进措施
{需要修复的配置/代码}
```

---

*来源: qa-auditor.md §8 | Version: 1.0.0 | Created: 2026-02-19*
