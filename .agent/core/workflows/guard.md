---
description: 守 — TDD, 代码审查, 安全审查, 构建错误, 故障排查, 事故响应
---

# /guard — 守

> **内部路由: Agent 根据关键词自动跳转到对应 section。不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `TDD`, `测试`, `test`, `覆盖率` | → §1 TDD |
| `审查`, `review`, `PR`, `代码质量` | → §2 代码审查 |
| `安全`, `security`, `漏洞`, `权限` | → §3 安全审查 |
| `构建错误`, `build error`, `编译失败` | → §4 构建错误 |
| `bug`, `故障`, `排查`, `debug` | → §5 故障排查 |
| `事故`, `incident`, `P0`, `宕机` | → §6 事故响应 |

---

## §1 TDD (测试驱动开发)

### 核心原则

```
红 → 绿 → 重构

1. 红: 写一个失败的测试
2. 绿: 写最少代码让测试通过
3. 重构: 优化代码, 保持测试通过
```

### 后端: JUnit 5 + MockK

```kotlin
@ExtendWith(MockKExtension::class)
class CreateProductUseCaseTest {
    @MockK lateinit var repository: ProductRepository
    @InjectMockKs lateinit var useCase: CreateProductUseCase

    @Test
    fun `should create product with valid data`() {
        val cmd = CreateProductCommand(sku = "TEST-001", name = "Test")
        every { repository.findBySku(any()) } returns null
        every { repository.save(any()) } answers { firstArg() }

        val result = useCase.execute(cmd)

        assertEquals("TEST-001", result.sku)
        verify { repository.save(any()) }
    }

    @Test
    fun `should throw if SKU already exists`() {
        every { repository.findBySku("DUP") } returns mockk()

        assertThrows<DuplicateSkuException> {
            useCase.execute(CreateProductCommand(sku = "DUP", name = "Dup"))
        }
    }
}
```

### 前端: Vitest + React Testing Library

```tsx
describe('DataTable', () => {
  const columns = [
    { accessorKey: 'name', header: 'Name' },
    { accessorKey: 'sku', header: 'SKU' },
  ];

  it('renders table headers', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
  });

  it('renders empty state when no data', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText(/no data/i)).toBeInTheDocument();
  });
});
```

### 覆盖率标准

| 层级 | 最低 | 目标 |
|------|------|------|
| Service/UseCase | 80% | 95% |
| Repository | 70% | 90% |
| Controller | 60% | 80% |
| 前端组件 | 70% | 90% |

### 测试反模式 (禁止)

| 反模式 | 后果 | 替代方案 |
|--------|------|----------|
| 测试依赖外部服务 | 不稳定 | Testcontainers |
| 测试间共享状态 | 互相影响 | `@BeforeEach` 重置 |
| 只测 happy path | 遗漏边界 | 分支覆盖率检查 |
| Mock 过度 | 测试脆弱 | 只 Mock 外部边界 |

---

## §2 代码审查

### Review 清单

| 维度 | 检查项 |
|------|--------|
| **架构** | 是否符合 DDD 分层? Controller 有无业务逻辑? |
| **安全** | 权限注解? 输入验证? SQL 注入风险? |
| **事务** | `@Transactional` 在正确层级? 传播级别正确? |
| **性能** | N+1 查询? 缺少索引? 大批量操作? |
| **错误处理** | 异常类型明确? 统一错误格式? |
| **测试** | 有新测试? 覆盖核心路径? |
| **i18n** | 新 UI 文本通过翻译? |
| **命名** | 类名/变量名清晰? 遵循命名规范? |
| **文档** | API 注释? 复杂逻辑有 why-comment? |

### Review 命令 (Agent 自动执行)

```bash
# 查看变更
git diff --stat
git diff --name-only

# 检查代码风格
./gradlew ktlintCheck      # Backend
pnpm --filter web lint      # Frontend

# 运行测试
./gradlew test              # Backend
pnpm --filter web build     # Frontend type-check
```

---

## §3 安全审查

### 12 项安全检查

| # | 检查项 | 严重级 | 检查方法 |
|---|--------|--------|----------|
| 1 | SQL 注入 | 🔴 Critical | JPA 参数化查询, 禁止字符串拼接 |
| 2 | XSS | 🔴 Critical | React 默认转义 + CSP Header |
| 3 | CSRF | 🟡 Medium | API-only 无状态 Token |
| 4 | 权限绕过 | 🔴 Critical | `@PreAuthorize` + 安全等级注解 |
| 5 | 敏感数据泄露 | 🔴 Critical | DTO 过滤, 禁止返回密码/Token |
| 6 | 硬编码密钥 | 🔴 Critical | `.env` / Vault, 禁止代码中写密钥 |
| 7 | 依赖漏洞 | 🟡 Medium | `./gradlew dependencyCheckAnalyze` |
| 8 | 文件上传 | 🟡 Medium | 白名单后缀 + 大小限制 + 扫描 |
| 9 | 日志泄露 | 🟡 Medium | 禁止日志中输出密码/Token |
| 10 | 错误信息泄露 | 🟡 Medium | 生产环境泛化错误消息 |
| 11 | 限流缺失 | 🟡 Medium | API Gateway + `@RateLimited` |
| 12 | 传输加密 | 🔴 Critical | 全链路 TLS/HTTPS |

---

## §4 构建错误

### 后端 (Gradle/Kotlin)

| 错误 | 原因 | 修复 |
|------|------|------|
| `Unresolved reference` | 缺少导入/拼写错误 | 检查 import + 类名 |
| `Type mismatch` | 类型不匹配 | 检查泛型/返回类型 |
| `Overload resolution ambiguity` | 多个重载匹配 | 明确参数类型 |
| `Bean not found` | Spring 没扫描到 | 检查包路径/注解 |
| `No qualifying bean` | 依赖注入失败 | `@Component`/`@Service` |
| `Flyway migration error` | SQL 错误/checksum 不匹配 | 检查 SQL 语法, 禁止修改已执行迁移 |

### 前端 (Next.js/TypeScript)

| 错误 | 原因 | 修复 |
|------|------|------|
| `Module not found` | 依赖缺失 | `pnpm add {package}` |
| `Type error` | TS 类型不匹配 | 检查类型定义 |
| `Hydration mismatch` | SSR/CSR 不一致 | 包裹 `use client` / 条件渲染 |
| `Dynamic server usage` | Server Component 用了 Hooks | 拆 Client Component |
| `NEXT_REDIRECT` | redirect() 在 try 中 | 把 redirect 移到 try 外 |

### 通用排查流程

```
1. 读完整错误消息
2. 定位出错文件和行号
3. 检查最近变更 (git diff)
4. 搜索相同错误 (ripgrep)
5. 修复 → 编译 → 验证
```

---

## §5 故障排查

### 5 步诊断流程

```
1. 复现: 确认可稳定复现
2. 隔离: 缩小范围 (前端? API? 数据库? 网络?)
3. 假设: 基于日志/错误信息提出假设
4. 验证: 增加日志/断点验证假设
5. 修复: 修复根因, 不只修症状
```

### 常用排查命令

```bash
# 日志查看
tail -f logs/application.log
kubectl logs -f deployment/api -n prod

# 数据库
psql -c "SELECT * FROM pg_stat_activity WHERE state = 'active';"
psql -c "SELECT * FROM pg_locks WHERE NOT granted;"

# 网络
curl -v https://api.example.com/health
nc -zv db-host 5432

# 资源
docker stats
kubectl top pods -n prod
```

---

## §6 事故响应

### 事故分级

| 等级 | 定义 | 响应时间 |
|------|------|----------|
| **P0** | 全站不可用 / 数据丢失 | 15 分钟 |
| **P1** | 核心功能不可用 | 30 分钟 |
| **P2** | 非核心功能降级 | 2 小时 |
| **P3** | 轻微问题 / 用户报告 | 24 小时 |

### 响应流程

```
1. 确认严重级 → 通知团队
2. 止血: 回滚/关闭功能/限流
3. 诊断: 日志 + Traces + Metrics
4. 修复: 根因修复 + 验证
5. Postmortem: 原因 + 时间线 + 改进措施
```

### Postmortem 模板

```markdown
## 事故报告

- **日期**: YYYY-MM-DD
- **严重级**: P0/P1/P2/P3
- **影响**: 受影响用户数/持续时间
- **时间线**:
  - HH:MM 发现问题
  - HH:MM 开始排查
  - HH:MM 修复部署
  - HH:MM 确认恢复
- **根因**: ...
- **改进措施**:
  - [ ] 短期: ...
  - [ ] 长期: ...
```

---

*Version: 1.0.0 — Generic Core*
