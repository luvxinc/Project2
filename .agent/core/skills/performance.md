---
name: performance
description: 性能工程 — N+1 检测, 缓存策略, 慢查询治理, 前端性能, 批量操作优化。
---

# 性能工程 (Performance Engineering)

> **你是性能工程师。你的职责是: 诊断+优化 N+1、缓存策略、慢查询、前端渲染、批量操作性能。**
> **原则: 先测量, 后优化。过早优化是万恶之源, 但已知的性能陷阱必须提前规避。**


> **⚠️ 本文件 ~7KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `N+1`, `JPA`, `索引`, `批量`, `慢查询` | → §1 后端性能 |
| `缓存`, `Redis`, `Caffeine`, `TTL` | → §2 缓存策略 |
| `React`, `Next.js`, `bundle`, `渲染` | → §3 前端性能 |
| `P95`, `指标`, `告警`, `EXPLAIN` | → §4 性能指标和告警 |
| `反模式`, `禁止` | → §5 反模式清单 |

---
---

## 1. 后端性能

### 1.1 N+1 查询检测与修复

```kotlin
// ❌ N+1: 循环中逐条查询
val orders = orderRepository.findAll()
orders.forEach { order ->
    val items = itemRepository.findByOrderId(order.id)  // N 次查询!
}

// ✅ JOIN FETCH: 一次查询
@Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.status = :status")
fun findAllWithItems(@Param("status") status: OrderStatus): List<Order>

// ✅ EntityGraph: 声明式
@EntityGraph(attributePaths = ["items", "items.product"])
fun findAllByStatus(status: OrderStatus): List<Order>
```

### 1.2 检测工具

| 工具 | 用途 | 配置 |
|------|------|------|
| **Hibernate Statistics** | 查询计数 | `spring.jpa.properties.hibernate.generate_statistics=true` |
| **P6Spy** | SQL 日志 + 耗时 | `spy.properties` |
| **Hypersistence Optimizer** | JPA 反模式扫描 | Gradle 插件 |
| **EXPLAIN ANALYZE** | 慢查询执行计划 | 手动分析 |

### 1.3 数据库索引策略

```sql
-- 必须有索引的场景
CREATE INDEX idx_{table}_{column} ON {table}({column});

-- 高频查询字段
WHERE status = ?              -- 枚举字段: B-tree
WHERE created_at > ?          -- 时间范围: B-tree
WHERE sku ILIKE '%keyword%'   -- 模糊搜索: 考虑 GIN + pg_trgm
WHERE tenant_id = ? AND ...   -- 多租户: 复合索引, tenant 在前

-- 索引审计查询
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0            -- 未使用的索引 → 考虑删除
ORDER BY pg_relation_size(indexrelid) DESC;
```

### 1.4 批量操作

```kotlin
// ❌ 逐条保存
items.forEach { repository.save(it) }  // N 次 INSERT

// ✅ 批量保存
@Modifying
@Query("INSERT INTO items (name, sku) VALUES (:name, :sku)")
fun batchInsert(@Param("name") names: List<String>, @Param("sku") skus: List<String>)

// ✅ JPA 批量配置
// application.yml
spring:
  jpa:
    properties:
      hibernate:
        jdbc.batch_size: 50
        order_inserts: true
        order_updates: true
```

---

## 2. 缓存策略

### 2.1 缓存层级

```
请求 → L1 本地缓存 → L2 Redis → L3 数据库
         (Caffeine)    (共享)     (真相源)
```

| 层级 | 技术 | TTL | 适用场景 |
|------|------|-----|----------|
| **L1** | Caffeine (进程内) | 5-30 分钟 | 配置/权限/枚举 |
| **L2** | Redis | 15-60 分钟 | Session/热点数据/排行 |
| **L3** | PostgreSQL | — | 所有持久化数据 |

### 2.2 缓存模式

```kotlin
// Read-Through (最常用)
@Cacheable(value = ["products"], key = "#sku")
fun findBySku(sku: String): Product?

// Write-Through
@CachePut(value = ["products"], key = "#product.sku")
fun save(product: Product): Product

// Cache Eviction
@CacheEvict(value = ["products"], key = "#sku")
fun delete(sku: String)

// 批量清除
@CacheEvict(value = ["products"], allEntries = true)
fun refreshAll()
```

### 2.3 缓存铁律

| 规则 | 说明 |
|------|------|
| **不缓存写多读少的数据** | 频繁失效 = 缓存无意义 |
| **不缓存大对象** | 序列化成本高, 内存浪费 |
| **必须有 TTL** | 禁止永不过期 |
| **缓存穿透防护** | 空值也缓存 (短 TTL) |
| **缓存雪崩防护** | TTL 加随机偏移 |

---

## 3. 前端性能

### 3.1 Next.js 优化

| 技术 | 用途 | 实现 |
|------|------|------|
| **Server Components** | 减少 JS bundle | 默认 Server, 按需 `'use client'` |
| **Dynamic Import** | 按需加载重组件 | `dynamic(() => import('./HeavyChart'))` |
| **Image 优化** | 自动压缩/WebP | `<Image>` 组件 |
| **Route Prefetch** | 预加载链接 | Next.js 自动, `<Link prefetch>` |

### 3.2 React 渲染优化

```tsx
// ❌ 不必要的重渲染
function ParentComponent() {
  const [count, setCount] = useState(0);
  return <ExpensiveChild data={data} />  // 每次都重渲染
}

// ✅ memo 避免重渲染
const ExpensiveChild = React.memo(({ data }) => {
  return <div>{/* 复杂渲染 */}</div>
});

// ✅ useMemo 缓存计算
const sortedData = useMemo(
  () => data.sort((a, b) => a.name.localeCompare(b.name)),
  [data]
);

// ✅ useCallback 稳定回调
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

### 3.3 React Query 性能

```tsx
// 智能缓存配置
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,     // 5 分钟内不重新请求
      gcTime: 30 * 60 * 1000,        // 30 分钟后垃圾回收
      refetchOnWindowFocus: false,    // 切窗口不重请求
      retry: 1,                       // 失败重试 1 次
    },
  },
});
```

### 3.4 大数据表格

| 数据量 | 方案 | 组件 |
|--------|------|------|
| < 500 行 | 客户端分页 | `@tanstack/react-table` |
| 500-5000 行 | 服务端分页 | `@tanstack/react-table` + API 分页 |
| > 5000 行 | 虚拟滚动 | AG Grid Enterprise |

---

## 4. 性能指标和告警

### 4.1 关键指标

| 指标 | 目标 | 告警阈值 |
|------|------|----------|
| **API P50** | < 100ms | — |
| **API P95** | < 500ms | > 1s |
| **API P99** | < 2s | > 5s |
| **页面 LCP** | < 2.5s | > 4s |
| **数据库连接池** | < 70% | > 85% |
| **JVM 堆内存** | < 70% | > 85% |

### 4.2 慢查询治理

```sql
-- 找到慢查询
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 20;

-- 分析执行计划
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM products WHERE status = 'ACTIVE';
```

---

## 5. 反模式清单 (禁止)

| 反模式 | 后果 | 替代 |
|--------|------|------|
| 循环内查询 (N+1) | 请求耗时 x N | JOIN FETCH / EntityGraph |
| SELECT * | 传输浪费 | 只查需要的列 (Projection) |
| 无分页查询 | OOM 风险 | 强制分页 `Pageable` |
| 同步调用外部 API | 阻塞线程池 | 异步 / 超时 / 熔断 |
| 前端大 bundle | 首屏慢 | Code splitting / Dynamic import |
| 缓存没 TTL | 数据不一致 | 强制 TTL |

---

## 6. L3 工具库引用 (按需加载)

| 场景 | 工具 | 路径 | 说明 |
|------|------|------|------|
| 后端性能审查 | ECC: Review | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | N+1/连接池/超时反模式 |
| 前端性能审查 | UI UX Pro | `warehouse/tools/ui-ux-pro-max/03-ux-rules-checklist.md` | 渲染性能 UX 准则 |
| 编码规范 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | 批量操作/错误处理规范 |

---

*Version: 1.1.0 — 含路由表 + L3 工具引用*
