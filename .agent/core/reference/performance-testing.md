# 性能测试参考

> **来源**: `skills/qa-auditor.md §7` 压缩时外迁
> **用途**: k6 性能测试脚本模板 + 阈值标准

---

## 工具

| 场景 | 工具 | 安装 |
|------|------|------|
| HTTP 负载测试 | k6 | `brew install k6` / Docker |
| 数据库查询分析 | `EXPLAIN ANALYZE` | PostgreSQL 内置 |
| JVM 剖析 | Async Profiler | 附加到 JVM 进程 |
| 前端性能 | Lighthouse CI | `npm install -g @lhci/cli` |

---

## k6 基础脚本模板

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// 自定义指标
const errorRate = new Rate('errors');
const apiLatency = new Trend('api_latency');

export const options = {
  stages: [
    { duration: '1m', target: 10 },   // 预热: 10 VU
    { duration: '3m', target: 50 },   // 压测: 50 VU
    { duration: '1m', target: 100 },  // 峰值: 100 VU
    { duration: '1m', target: 0 },    // 冷却
  ],
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],  // P95 < 500ms
    errors: ['rate<0.01'],                            // 错误率 < 1%
    http_req_failed: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8080';

export default function () {
  // 场景 1: 列表查询
  const listRes = http.get(`${BASE_URL}/api/v1/users?page=0&size=20`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  });
  check(listRes, {
    'list status 200': (r) => r.status === 200,
    'list response time < 200ms': (r) => r.timings.duration < 200,
  });
  apiLatency.add(listRes.timings.duration);
  errorRate.add(listRes.status !== 200);

  sleep(1);

  // 场景 2: 单记录查询
  const detailRes = http.get(`${BASE_URL}/api/v1/users/1`, {
    headers: { Authorization: `Bearer ${__ENV.TEST_TOKEN}` },
  });
  check(detailRes, {
    'detail status 200': (r) => r.status === 200,
    'detail response time < 100ms': (r) => r.timings.duration < 100,
  });

  sleep(0.5);
}
```

---

## 执行命令

```bash
# 本地运行
k6 run \
  -e BASE_URL=http://localhost:8080 \
  -e TEST_TOKEN=xxx \
  scripts/load-test.js

# Docker 运行（CI 推荐）
docker run --rm -i grafana/k6 run \
  -e BASE_URL=http://api-server \
  - < scripts/load-test.js

# 输出到 InfluxDB（可视化）
k6 run --out influxdb=http://localhost:8086/k6 scripts/load-test.js
```

---

## 性能基线标准

| 指标 | 目标 | 告警阈值 |
|------|------|---------|
| P50 响应时间 | < 100ms | > 200ms |
| P95 响应时间 | < 500ms | > 1000ms |
| P99 响应时间 | < 1000ms | > 2000ms |
| 错误率 | < 0.1% | > 1% |
| 吞吐量 | > 500 RPS | < 100 RPS |
| CPU 使用率 | < 70% | > 85% |
| 内存使用率 | < 75% | > 85% |

---

## 数据库慢查询分析

```sql
-- 找出慢查询（执行时间 > 100ms）
SELECT query, calls, total_exec_time, mean_exec_time, rows
FROM pg_stat_statements
WHERE mean_exec_time > 100
ORDER BY mean_exec_time DESC
LIMIT 20;

-- EXPLAIN ANALYZE（执行计划分析）
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM users WHERE email = 'test@example.com';
-- 关注: Seq Scan（全表扫描）→ 需要加索引
```

---

## JVM 性能剖析

```bash
# 附加 Async Profiler 到运行中的 JVM
./profiler.sh -d 30 -f flamegraph.html $(pgrep -f bootJar)

# JVM GC 日志分析
-Xlog:gc*:file=gc.log:time,uptime:filecount=5,filesize=20m

# JVM 堆 dump（OOM 排查）
jmap -dump:format=b,file=heap.hprof $(pgrep -f bootJar)
```

---

*来源: qa-auditor.md §7 | Version: 1.0.0 | Created: 2026-02-19*
