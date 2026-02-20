# 后端自检规则 (Backend Engineer Self-Check)

> **用途**: 后端工程师提交前必须逐项过关。违反 🔴 项 = 驳回。
> **与 `skills/backend.md` 区别**: Skills = 学习, Rules = 强制检查。

---

## 1. 提交前 Checklist (逐项打勾)

### 🔴 CRITICAL — 违反即驳回

- [ ] **无 SQL 注入** — 所有查询用参数化/ORM, 无字符串拼接
- [ ] **输入验证在边界** — 所有 DTO 用 `@Valid` + `@NotBlank`/`@Positive` 等
- [ ] **事务注解正确** — 写操作有 `@Transactional`, 传播策略正确
- [ ] **无敏感信息泄漏** — 错误响应不暴露内部异常/堆栈/SQL
- [ ] **无硬编码凭据** — API key/密码/token 全部在环境变量中
- [ ] **Null Safety** — Kotlin 中无 `!!` 强制解包 (用 `?.` 或 Elvis `?:`)
- [ ] **迁移脚本有回退** — Flyway migration 新加字段有 DEFAULT 或允许 NULL

### 🟡 HIGH — 必须修复后合并

- [ ] **无 N+1 查询** — 关联数据用 JOIN/FETCH JOIN/batch fetch
- [ ] **无无界查询** — `findAll()` 必须有分页 (Page/Pageable)
- [ ] **外部 HTTP 有超时** — WebClient/RestTemplate 必须设 timeout
- [ ] **审计日志** — 所有写操作有 AuditLog 记录
- [ ] **Domain 层零框架依赖** — `domain/model/` 下无 Spring 注解
- [ ] **DTO ⇄ Entity 分离** — Controller 不直接暴露 JPA Entity
- [ ] **测试覆盖** — 新 UseCase ≥ 80% 覆盖率
- [ ] **无同步 I/O 阻塞** — 协程/异步上下文中无阻塞调用 (B11)
- [ ] **缓存策略** — 高频读取的数据有缓存层 (Redis/本地), 写操作有失效策略

---

## 2. 后端反模式黑名单（通用，适用于所有框架）

| # | 反模式 | 问题 | 正确做法 |
|---|--------|------|---------|
| B1 | Controller 直接访问 Repository | 跳过 Service 层, 业务逻辑散落 | Controller → UseCase → Repository |
| B2 | ORM 默认 eager/lazy loading 陷阱 | N+1 查询 / 事务泄漏 | 显式配置加载策略（见 CONTEXT.md §3） |
| B3 | 静默吞异常 `catch(e) {}` | 问题无法追踪 | 记录日志 + 抛业务异常 |
| B4 | ORM Entity 用于 API 返回 | 内部结构暴露, 修改困难 | 返回专用 Response DTO |
| B5 | 循环依赖 (ServiceA ↔ ServiceB) | 启动失败/维护困难 | 领域事件解耦 |
| B6 | 事务注解在 private 方法 | 事务不生效（代理机制） | 只在 public 方法上用 |
| B7 | Controller 写业务逻辑 | 职责混乱 | 提取到 UseCase |
| B8 | 可变状态用于值对象 | 数据被意外修改 | 不可变类型 + copy 模式 |
| B9 | 手动管理数据库连接 | 连接泄漏 | 使用框架连接池（见 CONTEXT.md §3）|
| B10 | 无界查询 (SELECT * 无 LIMIT) | 内存溢出 | 必须有分页或 LIMIT |
| B11 | 同步 I/O 在协程/异步上下文中 | 线程池饥饿, 吞吐量骤降 | 用异步客户端 (WebClient) 或 `Dispatchers.IO` 隔离 |

---

## 3. 性能红线

| 指标 | 红线 | 检测方式 |
|------|------|---------|
| API P99 延迟 | ≤ 200ms (简单 CRUD) | 监控 metrics（见 CONTEXT.md §3）|
| API P99 延迟 | ≤ 2s (复杂报表) | 监控 metrics |
| 批处理吞吐 | ≥ 1000 条/秒 | 日志打点 |
| DB 连接池 | 空闲 ≥ 5, 峰值 ≤ 80% max | 连接池 metrics（见 CONTEXT.md §3）|
| 单个查询 | ≤ 100ms (EXPLAIN ANALYZE) | SQL 分析 |
| 无全表扫描 | 高频查询有索引 | EXPLAIN ANALYZE |
| 缓存命中率 | 高频数据 ≥ 90% 命中率 | Redis metrics / 日志打点 |

---

## 4. 验证命令

```bash
# 所有命令见 CONTEXT.md §5 工具命令速查

# 1. 编译 — 标准: BUILD SUCCESSFUL
{build_cmd}

# 2. 测试 — 标准: 全部 PASS
{test_cmd}

# 3. 覆盖率 — 标准: ≥ 80%
{coverage_cmd}

# 4. 架构约束（如有）— 标准: 全部 PASS
{arch_test_cmd}

# 5. 安全检查 — 标准: 无硬编码密钥
{lint_security_cmd}

# 6. SQL 分析（手动）— 标准: 无 Seq Scan on 大表
# 对每个新增的 Repository 方法: EXPLAIN ANALYZE <query>
```

---

## 5. 迁移脚本安全检查

```bash
# 对每个新 Flyway migration 文件:
# 1. 有 DEFAULT 值 or NULL 允许 → ✅
# 2. 有对应的回退 SQL → ✅
# 3. 在测试环境跑过 → ✅

# 检查新 migration:
find src/main/resources/db/migration -name "*.sql" -newer .git/HEAD
```

---

*Version: 1.1.0 — 新增 B11 同步I/O阻塞 + 缓存策略检查 + 缓存命中率红线 (ECC 对齐)*
*Created: 2026-02-15 | Updated: 2026-02-19*
