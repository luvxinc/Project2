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

---

## 2. Spring Boot/Kotlin 反模式黑名单

| # | 反模式 | 问题 | 正确做法 |
|---|--------|------|---------|
| B1 | Controller 直接注入 Repository | 跳过 Service 层, 业务逻辑散落 | Controller → UseCase → Repository |
| B2 | `open-in-view: true` (默认) | 懒加载导致 N+1, 事务泄漏到 Controller | 设 `open-in-view: false` |
| B3 | `catch(e: Exception) {}` | 静默吞错, 问题无法追踪 | 记录日志 + 抛业务异常 |
| B4 | Entity 上用 `@Data` (Lombok) | equals/hashCode 不正确 | Kotlin `data class` 或手写 |
| B5 | 把 Entity 当 DTO 返回 API | 内部结构暴露, 修改困难 | 返回专用 Response DTO |
| B6 | 循环依赖 (ServiceA → ServiceB → ServiceA) | Spring 启动失败/维护困难 | 领域事件解耦 |
| B7 | `@Transactional` 在 private 方法 | 事务不生效 (代理机制) | 只在 public 方法上用 |
| B8 | 在 Controller 中写业务逻辑 | 职责混乱 | 提取到 UseCase |
| B9 | 不可变对象用 `var` | 数据可能被意外修改 | 用 `val` + `copy()` |
| B10 | 手动管理数据库连接 | 连接泄漏 | 用 Spring Data/HikariCP |

---

## 3. 性能红线

| 指标 | 红线 | 检测方式 |
|------|------|---------|
| API P99 延迟 | ≤ 200ms (简单 CRUD) | Actuator metrics |
| API P99 延迟 | ≤ 2s (复杂报表) | Actuator metrics |
| 批处理吞吐 | ≥ 1000 条/秒 | 日志打点 |
| DB 连接池 | 空闲 ≥ 5, 峰值 ≤ 80% max | HikariCP metrics |
| 单个查询 | ≤ 100ms (EXPLAIN ANALYZE) | SQL 分析 |
| 无全表扫描 | 高频查询有索引 | EXPLAIN ANALYZE |

---

## 4. 验证命令

```bash
# 1. 编译
./gradlew build --no-daemon 2>&1 | tail -20
# 标准: BUILD SUCCESSFUL

# 2. 测试
./gradlew test 2>&1 | tail -20
# 标准: 全部 PASS

# 3. 覆盖率
./gradlew jacocoTestReport
# 标准: ≥ 80%

# 4. 架构约束 (如果有 ArchUnit)
./gradlew test --tests "*ArchitectureTest*"
# 标准: 全部 PASS

# 5. 安全检查
grep -rn "!!" src/main/kotlin/ | head -20
# 标准: 零匹配 (无强制解包)
grep -rn "password\|secret\|api_key" src/main/kotlin/ --include="*.kt" | grep -v "test"
# 标准: 只有变量名引用, 无硬编码值

# 6. SQL 分析 (手动)
# 对每个新增的 Repository 方法:
# EXPLAIN ANALYZE <query>
# 标准: 无 Seq Scan on 大表
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

*Version: 1.0.0 — 后端自检 Rules*
*Created: 2026-02-15*
