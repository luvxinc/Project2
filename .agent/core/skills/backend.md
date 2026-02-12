---
name: backend
description: 后端架构师 — Kotlin + Spring Boot 3 + DDD。负责业务模块/API/事务/测试。含构建系统/模块结构/Security/事务/测试/配置。
---

# 后端规范 — Kotlin + Spring Boot 3

> **你是后端架构师。你的职责是: 设计+实现后端业务模块、API 接口、事务管理、数据持久化。**
> **⚠️ 本文件 ~13KB。根据下方路由表跳到需要的 section, 不要全部阅读。**

## 路由表

| 关键词 | 跳转 |
|--------|------|
| `为什么 kotlin`, `技术选型` | → §1 技术选型 |
| `gradle`, `依赖`, `构建` | → §2 构建系统 |
| `模块`, `DDD`, `领域`, `entity`, `service`, `controller` | → §3 模块结构 |
| `security`, `认证`, `JWT` | → §4 Security 配置 |
| `事务`, `transaction`, `回滚` | → §5 事务管理 |
| `测试`, `test`, `mock` | → §6 测试规范 |
| `配置`, `yml`, `application` | → §7 配置管理 |

---

> **企业级后端最佳实践: Kotlin + Spring Boot, DDD 分层, 声明式事务, 结构化并发。**
> **本文件是泛化模板。 项目特定的模块列表/业务规则请参考 `projects/{project}/` 目录。**

---

## 1. 为什么是 Kotlin + Spring Boot

### 1.1 语言选择: Kotlin over Java

| 能力 | Java | Kotlin | 优势 |
|------|------|--------|------|
| Null Safety | 运行时 NPE | **编译期** `?` 标注 | 消灭生产环境最大 bug 类 |
| 数据类 | Record (Java 16+) | `data class` | 原生不可变值对象 |
| 密封类 | sealed (Java 17+) | `sealed class/interface` | 穷举模式匹配, 完美表达业务状态机 |
| 协程 | Virtual Thread (Java 21) | `suspend fun` + 结构化并发 | 轻量级并发, 适合 I/O 密集 ERP |
| 扩展函数 | 无 | `fun String.toSku()` | 领域语言化 |
| DSL 构建 | 无 | builder DSL | 类型安全配置 |
| Spring 兼容 | ✅ 原生 | ✅ 一等公民 (官方支持) | 零迁移成本 |

### 1.2 框架选择: Spring Boot

| 能力 | Node.js 框架 | Spring Boot | 差距 |
|------|-------------|-------------------|------|
| 事务管理 | `prisma.$transaction()` 手动 | `@Transactional(propagation=...)` 声明式 | 🔴 致命 |
| 事务传播 | 不支持 | REQUIRED, REQUIRES_NEW, NESTED... | 🔴 致命 |
| 并发模型 | 单线程事件循环 | 多线程 + 协程 | 🔴 百万数据处理 |
| 内存上限 | ~1.5GB (V8) | 无限制 (JVM 可配) | 🔴 大批量 |
| 批处理 | 无标准方案 | Spring Batch | 🔴 ETL 需求 |
| 安全框架 | Passport (基础) | Spring Security 6 (企业级) | 🔴 SSO/RBAC |
| 领域事件 | EventEmitter (基础) | Spring Modulith (企业级) | 🟡 模块化 |
| 测试 | Jest | JUnit 5 + Testcontainers | 🟡 集成测试 |
| 生态 | npm (Web 偏向) | Maven Central (企业偏向) | 🟡 中间件 SDK |

---

## 2. 构建系统

### 2.1 Gradle (Kotlin DSL)

```kotlin
// build.gradle.kts (根)
plugins {
    kotlin("jvm") version "2.0.x"
    kotlin("plugin.spring") version "2.0.x"
    kotlin("plugin.jpa") version "2.0.x"
    id("org.springframework.boot") version "3.3.x"
    id("io.spring.dependency-management") version "1.1.x"
    id("org.flywaydb.flyway") version "10.x"
}

dependencies {
    // Spring Boot Starters
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-cache")
    implementation("org.springframework.boot:spring-boot-starter-actuator")
    
    // Kotlin
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core")
    
    // Database
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")
    
    // Redis
    implementation("org.springframework.boot:spring-boot-starter-data-redis")
    
    // Kafka
    implementation("org.springframework.kafka:spring-kafka")
    
    // OpenSearch
    implementation("org.opensearch.client:opensearch-java")
    
    // OpenAPI
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.x")
    
    // Security
    implementation("org.springframework.boot:spring-boot-starter-oauth2-resource-server")
    
    // Batch
    implementation("org.springframework.boot:spring-boot-starter-batch")
    
    // PDF/Document
    implementation("com.itextpdf:itext7-core:8.x")
    
    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("io.mockk:mockk:1.13.x")
    testImplementation("org.testcontainers:postgresql")
    testImplementation("org.testcontainers:kafka")
}
```

---

## 3. 模块结构详解

### 3.1 模块组织 (Spring Modulith)

每个业务域是一个独立模块, 包名遵循 `com.{company}.{app}.modules.{module}` 格式:

| 模块类型 | 包名模式 | 典型示例 |
|----------|---------|----------|
| **核心模块** | `modules.auth` | 认证 (OAuth2/OIDC/JWT) |
| **核心模块** | `modules.users` | 用户 + 角色 + 权限 (RBAC) |
| **业务模块** | `modules.{domain}` | 按领域划分 (产品/订单/库存...) |
| **支撑模块** | `modules.logs` | 审计日志 + 错误日志 + 告警 |

> **项目的具体模块列表在 `projects/{project}/overview.md` 中定义。**

### 3.2 模块内部模板 (Kotlin)

```kotlin
// ==========================================
// Domain Layer — 零框架依赖
// ==========================================

// domain/model/Product.kt
data class Product(
    val id: ProductId,
    val sku: Sku,
    val name: String,
    val category: Category,
    val cost: Money,
    val status: ProductStatus,
) {
    fun activate(): Product = copy(status = ProductStatus.ACTIVE)
    fun deactivate(): Product = copy(status = ProductStatus.INACTIVE)
}

// domain/model/ValueObjects.kt
@JvmInline value class ProductId(val value: UUID)
@JvmInline value class Sku(val value: String) {
    init { require(value.isNotBlank()) { "SKU cannot be blank" } }
}

data class Money(val amount: BigDecimal, val currency: Currency = Currency.USD) {
    init { require(amount >= BigDecimal.ZERO) { "Amount must be non-negative" } }
}

// domain/event/ProductEvents.kt
sealed interface ProductEvent {
    data class Created(val product: Product) : ProductEvent
    data class Activated(val productId: ProductId) : ProductEvent
    data class Deactivated(val productId: ProductId) : ProductEvent
}

// domain/repository/ProductRepository.kt (接口, 非实现)
interface ProductRepository {
    fun findById(id: ProductId): Product?
    fun findBySku(sku: Sku): Product?
    fun save(product: Product): Product
    fun findAll(page: Int, size: Int): Page<Product>
}

// ==========================================
// Application Layer — 用例编排
// ==========================================

// application/usecase/CreateProductUseCase.kt
@Service
class CreateProductUseCase(
    private val repository: ProductRepository,
    private val eventPublisher: ApplicationEventPublisher,
) {
    @Transactional
    fun execute(command: CreateProductCommand): ProductResponse {
        // 业务规则校验
        repository.findBySku(command.sku)?.let {
            throw DuplicateSkuException(command.sku)
        }
        
        val product = Product(
            id = ProductId(UUID.randomUUID()),
            sku = command.sku,
            name = command.name,
            category = command.category,
            cost = command.cost,
            status = ProductStatus.ACTIVE,
        )
        
        val saved = repository.save(product)
        eventPublisher.publishEvent(ProductEvent.Created(saved))
        
        return saved.toResponse()
    }
}

// application/dto/ProductDtos.kt
data class CreateProductCommand(
    @field:NotBlank val sku: String,
    @field:NotBlank val name: String,
    val category: String,
    @field:Positive val cost: BigDecimal,
)

data class ProductResponse(
    val id: UUID,
    val sku: String,
    val name: String,
    val category: String,
    val cost: BigDecimal,
    val status: String,
)

// ==========================================
// Infrastructure Layer — 可替换实现
// ==========================================

// infrastructure/persistence/ProductJpaEntity.kt
@Entity
@Table(name = "products")
class ProductJpaEntity(
    @Id val id: UUID,
    @Column(unique = true) val sku: String,
    val name: String,
    val category: String,
    @Column(precision = 12, scale = 2) val cost: BigDecimal,
    @Enumerated(EnumType.STRING) val status: ProductStatus,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
    val createdBy: String? = null,
    val updatedBy: String? = null,
)

// infrastructure/persistence/ProductJpaRepositoryImpl.kt
@Repository
class ProductJpaRepositoryImpl(
    private val jpa: JpaProductRepository,
) : ProductRepository {
    override fun findById(id: ProductId) = jpa.findByIdOrNull(id.value)?.toDomain()
    override fun save(product: Product) = jpa.save(product.toEntity()).toDomain()
    // ...
}

interface JpaProductRepository : JpaRepository<ProductJpaEntity, UUID>

// ==========================================
// API Layer — Controller
// ==========================================

// api/ProductController.kt
@RestController
@RequestMapping("/api/v1/products")
class ProductController(
    private val createProduct: CreateProductUseCase,
) {
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody command: CreateProductCommand): ApiResponse<ProductResponse> {
        return ApiResponse.success(createProduct.execute(command))
    }
}
```

---

## 4. Spring Security 配置

```kotlin
@Configuration
@EnableWebSecurity
class SecurityConfig {

    @Bean
    fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            csrf { disable() }  // API-only, 用 Token
            cors { configurationSource = corsConfig() }
            
            authorizeHttpRequests {
                // 公开端点
                authorize("/api/v1/auth/login", permitAll)
                authorize("/api/v1/auth/refresh", permitAll)
                authorize("/actuator/health", permitAll)
                
                // 安全等级
                authorize("/api/v1/admin/**", hasRole("SUPERUSER"))
                authorize("/api/v1/**", authenticated)
            }
            
            oauth2ResourceServer { jwt { } }  // OIDC JWT 验证
            
            exceptionHandling {
                authenticationEntryPoint = CustomAuthEntryPoint()
                accessDeniedHandler = CustomAccessDeniedHandler()
            }
        }
        return http.build()
    }
}
```

---

## 5. 事务管理模式

```kotlin
// ✅ 正确: 事务在 UseCase 层
@Service
class ProcessPurchaseOrderUseCase(
    private val poRepository: PurchaseOrderRepository,
    private val inventoryService: InventoryService,
    private val financeService: FinanceService,
) {
    @Transactional  // 整个用例是一个事务
    fun execute(command: ProcessPOCommand) {
        val po = poRepository.findById(command.poId)
            ?: throw NotFoundException("PO not found")
        
        // 1. 更新 PO 状态
        poRepository.save(po.markAsReceived())
        
        // 2. 入库 (同一事务)
        inventoryService.receive(po.items)
        
        // 3. 生成财务凭证 (同一事务)
        financeService.createVoucher(po)
    }
}

// ✅ 需要独立事务的场景
@Service
class AuditLogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun log(event: AuditEvent) {
        // 即使主事务回滚, 审计日志也必须保留
        repository.save(event)
    }
}
```

---

## 6. 测试规范

| 测试类型 | 框架 | 覆盖目标 | 要求 |
|----------|------|----------|------|
| **单元测试** | JUnit 5 + MockK | Domain + UseCase | ≥80% 覆盖率 |
| **集成测试** | Testcontainers (PG+Redis+Kafka) | Repository + API | 核心路径 100% |
| **契约测试** | Spring Cloud Contract | API 契约不破坏 | 所有公开 API |
| **架构测试** | ArchUnit | DDD 分层约束 | 100% 通过 |

```kotlin
// ArchUnit 测试: 确保分层约束
@Test
fun `domain layer should not depend on Spring`() {
    noClasses()
        .that().resideInAPackage("..domain..")
        .should().dependOnClassesThat()
        .resideInAPackage("org.springframework..")
        .check(importedClasses)
}

@Test
fun `controllers should not access repositories directly`() {
    noClasses()
        .that().resideInAPackage("..api..")
        .should().dependOnClassesThat()
        .resideInAPackage("..infrastructure.persistence..")
        .check(importedClasses)
}
```

---

## 7. 配置管理

```yaml
# application.yml
spring:
  application:
    name: my-app  # 替换为项目名
  
  datasource:
    url: jdbc:postgresql://${DB_HOST:localhost}:5432/${DB_NAME:myapp}
    username: ${DB_USER}
    password: ${DB_PASSWORD}
    hikari:
      maximum-pool-size: 20
      minimum-idle: 5
  
  jpa:
    open-in-view: false  # 强制关闭 (性能陷阱)
    hibernate:
      ddl-auto: validate  # 只验证, 迁移交给 Flyway
    properties:
      hibernate:
        default_batch_fetch_size: 100
        jdbc:
          batch_size: 50
  
  flyway:
    enabled: true
    locations: classpath:db/migration
  
  data:
    redis:
      host: ${REDIS_HOST:localhost}
      port: 6379
  
  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP:localhost:9092}
    consumer:
      group-id: my-app
      auto-offset-reset: earliest
  
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: ${OIDC_ISSUER_URI}

springdoc:
  api-docs:
    path: /api-docs
  swagger-ui:
    path: /swagger-ui

management:
  endpoints:
    web:
      exposure:
        include: health,info,prometheus
  tracing:
    sampling:
      probability: 1.0  # 生产环境调低
```

---

## 8. L3 工具库引用 (按需加载)

| 场景 | 推荐加载 | 文件路径 | 作用 |
|------|---------|---------|------|
| 编码规范参考 | ECC: Rules | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | 强制规则: 不可变性/输入验证/错误处理/文件组织 |
| 后端代码审查 | ECC: Backend 模式 | `warehouse/tools/everything-claude-code/01-agents-review.md` §3 | N+1 查询 / 未验证输入 / 缺少超时 / 错误泄漏 |
| TDD 流程 | ECC: 测试规则 | `warehouse/tools/everything-claude-code/02-rules-hooks.md` §1 | RED→GREEN→REFACTOR + 80% 覆盖率 |

---

*Version: 1.1.0 — Generic Core + 工具引用*
*Based on: battle-tested enterprise patterns*
