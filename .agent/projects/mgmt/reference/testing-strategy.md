---
description: 完整测试策略 — 测试金字塔, 覆盖率, 契约测试, E2E, 性能, 混沌工程
---

# 测试策略 (Testing Strategy)

> **原则**: 测试是质量保障的生命线, 不是可选项。
> **目标**: 每次 CI 通过 = 可安全部署。
> **权威规范**: `core/skills/qa-auditor.md`

---

## 1. 测试金字塔

```
                    ┌────────────┐
                    │    E2E     │  少量 (~5%)
                    │ Playwright │
                   ┌┴────────────┴┐
                   │  Integration  │  适量 (~25%)
                   │ Testcontainers│
                  ┌┴──────────────┴┐
                  │   Unit Tests    │  大量 (~70%)
                  │ JUnit + MockK  │
                  └────────────────┘
```

---

## 2. 各层测试规范

### 2.1 单元测试 (Unit)

| 指标 | 目标 |
|------|------|
| 覆盖率 | ≥ 80% (Domain + Application 层) |
| 速度 | 全部 < 3 分钟 |
| 工具 | JUnit 5 + MockK (Kotlin) |
| 原则 | 不依赖数据库/网络/文件系统 |

```kotlin
class CreateProductUseCaseTest {
    private val productRepository = mockk<ProductRepository>()
    private val outboxRepository = mockk<OutboxRepository>()
    private val useCase = CreateProductUseCase(productRepository, outboxRepository, jacksonObjectMapper())

    @Test
    fun `should create product and publish outbox event`() {
        val cmd = CreateProductCommand(sku = "TEST-001", name = "Test Product")
        every { productRepository.save(any()) } answers { firstArg() }
        every { outboxRepository.save(any()) } answers { firstArg() }

        val result = useCase.execute(cmd)

        assertEquals("TEST-001", result.sku)
        verify(exactly = 1) { outboxRepository.save(match { it.eventType == "PRODUCT_CREATED" }) }
    }
}
```

### 2.2 集成测试 (Integration)

| 指标 | 目标 |
|------|------|
| 覆盖 | 所有 Repository + 关键 UseCase |
| 速度 | 全部 < 10 分钟 |
| 工具 | Testcontainers (PG + Redis + Kafka) |
| 原则 | 使用真实数据库, 测试 SQL/JPA 行为 |

```kotlin
@SpringBootTest
@Testcontainers
class ProductRepositoryIntegrationTest {
    companion object {
        @Container
        val postgres = PostgreSQLContainer("postgres:16-alpine")
            .withDatabaseName("test_erp")
    }

    @Autowired lateinit var productRepository: ProductJpaRepository

    @Test
    fun `should find product by SKU`() {
        productRepository.save(ProductEntity(sku = "INT-001", name = "Integration Test"))
        val found = productRepository.findBySku("INT-001")
        assertNotNull(found)
        assertEquals("Integration Test", found!!.name)
    }
}
```

### 2.3 架构测试 (ArchUnit)

自动验证 DDD 分层规则:

```kotlin
@AnalyzeClasses(packages = ["com.mgmt.erp"])
class ArchitectureTest {
    @ArchTest
    val domainShouldNotDependOnInfrastructure: ArchRule =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAPackage("..infrastructure..")

    @ArchTest
    val domainShouldNotDependOnSpring: ArchRule =
        noClasses().that().resideInAPackage("..domain..")
            .should().dependOnClassesThat().resideInAPackage("org.springframework..")

    @ArchTest
    val controllerShouldNotAccessRepository: ArchRule =
        noClasses().that().resideInAPackage("..api..")
            .should().dependOnClassesThat().resideInAPackage("..infrastructure.persistence..")
}
```

### 2.4 契约测试 (Contract)

前后端通过 OpenAPI Spec 验证一致性:

```yaml
# CI Pipeline Step
- name: Contract Test
  steps:
    - run: ./gradlew generateOpenApiSpec          # 生成最新 spec
    - run: npx openapi-diff old-spec.json new-spec.json  # 检测 breaking change
    - run: npx openapi-typescript-codegen --input openapi.json --output packages/api-client/src
    - run: pnpm --filter @mgmt/web build          # 前端类型检查
```

### 2.5 E2E 测试 (End-to-End)

| 指标 | 目标 |
|------|------|
| 覆盖 | 核心用户流程 (登录→创建PO→审批→收货) |
| 速度 | 全部 < 15 分钟 |
| 工具 | **Playwright** (跨浏览器) |
| 频率 | 每次 merge to main |

```typescript
test('采购流程 - 创建到审批', async ({ page }) => {
  await page.goto('/login');
  await page.fill('#username', 'admin');
  await page.fill('#password', '****');
  await page.click('#login-btn');

  await page.goto('/purchase/new');
  await page.fill('#supplier', 'TruValve Inc.');
  await page.fill('#amount', '5000');
  await page.click('#submit-po');

  await expect(page.locator('#po-status')).toHaveText('Pending');
});
```

### 2.6 性能测试 (Load/Stress)

| 指标 | 目标 |
|------|------|
| 工具 | **k6** (或 Gatling) |
| 频率 | 每次大版本发布前 |
| 基线 | API P95 < 200ms, P99 < 500ms |

```javascript
// k6 脚本
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  stages: [
    { duration: '2m', target: 100 },   // Ramp up
    { duration: '5m', target: 500 },   // Sustain
    { duration: '2m', target: 0 },     // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<200', 'p(99)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const res = http.get('http://localhost:8080/api/v1/products');
  check(res, { 'status 200': (r) => r.status === 200 });
}
```

### 2.7 安全测试

| 类型 | 工具 | CI 集成 |
|------|------|---------|
| SAST (静态分析) | SonarQube + detekt (Kotlin) | 每次 PR |
| SCA (依赖漏洞) | Snyk / OWASP Dependency-Check | 每次 PR |
| SBOM | syft | 每次构建 |
| Secrets 扫描 | trufflehog / gitleaks | 每次 PR |

### 2.8 混沌工程

| 工具 | 用途 | 频率 |
|------|------|------|
| Chaos Monkey for Spring Boot | 随机杀 Bean/延迟/异常 | 开发/测试环境 |
| Litmus (K8s) | Pod/Node/Network 故障注入 | Staging |

---

## 3. CI Pipeline (完整)

```yaml
name: CI
on: [push, pull_request]

jobs:
  backend:
    steps:
      - uses: actions/checkout@v4
      - name: Unit Tests
        run: ./gradlew test

      - name: Integration Tests
        run: ./gradlew integrationTest

      - name: Architecture Tests
        run: ./gradlew archTest

      - name: SAST (SonarQube)
        run: ./gradlew sonarqube

      - name: Dependency Scan (Snyk)
        run: snyk test

      - name: Generate OpenAPI Spec
        run: ./gradlew generateOpenApiSpec

      - name: Contract Diff
        run: npx openapi-diff main-spec.json current-spec.json

  frontend:
    steps:
      - name: Type Check
        run: pnpm typecheck

      - name: Unit Tests (Vitest)
        run: pnpm test

      - name: E2E Tests (Playwright)
        run: pnpm e2e

      - name: Accessibility Audit (axe)
        run: pnpm a11y:audit

      - name: Build
        run: pnpm build
```

---

*Version: 1.0.0 — 2026-02-11*
