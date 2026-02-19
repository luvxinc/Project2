---
name: impl-patterns-backend
description: MGMT 项目后端实现模式库（Kotlin + Spring Boot 3.3.x）。L1 通用 SOP 指向 CONTEXT.md §3 后，Agent 加载此文件获取具体实现代码。
---

# MGMT 后端实现模式 — Kotlin + Spring Boot 3.3.x

> **加载时机**: 当 L1 security.md / backend.md / integration.md 说"见 CONTEXT.md §3"时，加载此文件获取 MGMT 具体实现。
> **前置**: 先确认 `CONTEXT.md §3.1` 运行栈，再加载本文件。

---

## §1 认证授权实现（Spring Security 6.x + OAuth2）

### 1.1 Spring Security 配置

```kotlin
@Configuration @EnableWebSecurity @EnableMethodSecurity(prePostEnabled = true)
class SecurityConfig(
    private val jwtDecoder: JwtDecoder,
    private val customAuthConverter: CustomJwtAuthConverter
) {
    @Bean fun securityFilterChain(http: HttpSecurity): SecurityFilterChain {
        http {
            csrf { disable() }
            cors { configurationSource = corsConfig() }
            authorizeHttpRequests {
                authorize("/api/v1/auth/**", permitAll)
                authorize("/actuator/health", permitAll)
                authorize("/api/v1/admin/**", hasRole("SUPERUSER"))
                authorize("/api/v1/**", authenticated)
            }
            oauth2ResourceServer {
                jwt {
                    decoder = jwtDecoder
                    jwtAuthenticationConverter = customAuthConverter
                }
            }
        }
        return http.build()
    }
}
// CustomJwtAuthConverter: JWT claims("roles") → "ROLE_X" + claims("permissions") → 细粒度权限
```

### 1.2 SecurityLevel 安全等级 Aspect（L2/L3/L4 拦截）

```kotlin
annotation class SecurityLevel(val level: Int)

@Aspect @Component
class SecurityLevelAspect(private val securityCodeService: SecurityCodeService) {
    @Around("@annotation(securityLevel)")
    fun checkSecurityLevel(pjp: ProceedingJoinPoint, securityLevel: SecurityLevel): Any? {
        val request = (RequestContextHolder.getRequestAttributes() as ServletRequestAttributes).request
        when {
            securityLevel.level >= 3 -> {
                securityCodeService.verifyPassword(request.getHeader("X-Security-Password")
                    ?: throw SecurityException("Missing security password"))
                securityCodeService.verifyCode(securityLevel.level, request.getHeader("X-Security-Code")
                    ?: throw SecurityException("Missing security code"))
            }
            securityLevel.level >= 2 -> {
                securityCodeService.verifyPassword(request.getHeader("X-Security-Password")
                    ?: throw SecurityException("Missing security password"))
            }
        }
        return pjp.proceed()
    }
}
// 用法: @SecurityLevel(3) @PreAuthorize("hasRole('SUPERUSER')") fun deleteUser(...)
```

---

## §2 Vault 集成配置（Spring Cloud Vault）

```yaml
# bootstrap.yml
spring:
  cloud:
    vault:
      host: vault.my-app.com
      port: 8200
      scheme: https
      authentication: KUBERNETES  # K8s Service Account
      kv:
        enabled: true
        backend: secret
        default-context: mgmt-api
```

---

## §3 字段加密（AES-256 Hibernate Converter）

```kotlin
// 密钥从 Vault 注入 (@Value("${encryption.aes-key}"))
@Converter
class AesEncryptConverter : AttributeConverter<String, String> {
    override fun convertToDatabaseColumn(attr: String?) = attr?.let { AesUtil.encrypt(it, aesKey) }
    override fun convertToEntityAttribute(db: String?) = db?.let { AesUtil.decrypt(it, aesKey) }
}
// 使用: @Convert(converter = AesEncryptConverter::class) val ssn: String
```

---

## §4 审计日志 Entity（Append-only + HMAC 签名）

```kotlin
@Entity
@Table(name = "audit_trail")
@Immutable  // Hibernate: 禁止修改
class AuditTrailEntry(
    @Id val id: UUID = UUID.randomUUID(),
    val timestamp: Instant = Instant.now(),
    val userId: UUID,
    val userName: String,
    val action: String,          // CREATE / UPDATE / DELETE / LOGIN / EXPORT
    val module: String,
    val resourceType: String,
    val resourceId: String,
    @Column(columnDefinition = "JSONB") val before: String?,
    @Column(columnDefinition = "JSONB") val after: String?,
    val ipAddress: String,
    val userAgent: String?,
    val traceId: String?,
    val signature: String,       // HMAC-SHA256 签名
)

fun sign(entry: AuditTrailEntry, secretKey: String): String {
    val payload = "${entry.id}|${entry.timestamp}|${entry.userId}|${entry.action}|${entry.resourceId}"
    return HmacUtils.hmacSha256Hex(secretKey, payload)
}
```

---

## §5 OpenAPI 配置（Springdoc）

```kotlin
@OpenAPIDefinition(
    info = Info(title = "MGMT ERP API", version = "3.0.0"),
    security = [SecurityRequirement(name = "bearerAuth")]
)
@Configuration
class OpenApiConfig {
    @Bean fun customOpenAPI() = OpenAPI().components(
        Components().addSecuritySchemes("bearerAuth",
            SecurityScheme().type(SecurityScheme.Type.HTTP).scheme("bearer").bearerFormat("JWT"))
    )
}
```

### DTO 文档化（@Schema 注解）

```kotlin
@Schema(description = "创建产品请求")
data class CreateProductCmd(
    @field:NotBlank
    @Schema(description = "产品名称", example = "P-Valve Model A")
    val name: String,

    @field:NotBlank
    @Schema(description = "SKU", example = "PV-001-A")
    val sku: String,

    @Schema(description = "单价", example = "1500.00")
    val unitPrice: BigDecimal? = null
)
```

---

## §6 第三方 API 封装（Resilience4j）

```kotlin
@Component
class ExternalPaymentClient(private val restTemplate: RestTemplate) {
    @Retryable(maxAttempts = 3, backoff = Backoff(delay = 1000))
    @CircuitBreaker(name = "payment", fallbackMethod = "paymentFallback")
    fun processPayment(request: PaymentRequest): PaymentResponse {
        log.info("Calling payment API: {}", request.orderId)
        return restTemplate.postForObject(
            "${config.paymentUrl}/api/charge",
            request,
            PaymentResponse::class.java
        )!!
    }

    fun paymentFallback(request: PaymentRequest, ex: Exception): PaymentResponse {
        log.error("Payment API unavailable, queuing for retry", ex)
        return PaymentResponse(status = "PENDING")
    }
}
```

---

## §7 Webhook 接收（Spring MVC）

```kotlin
@PostMapping("/webhooks/{provider}")
fun receiveWebhook(
    @PathVariable provider: String,
    @RequestHeader("X-Signature") signature: String,
    @RequestBody payload: String
): ResponseEntity<Void> {
    if (!webhookVerifier.verify(provider, payload, signature)) {
        return ResponseEntity.status(401).build()
    }
    val eventId = extractEventId(payload)
    if (webhookEventRepo.existsById(eventId)) {
        return ResponseEntity.ok().build()
    }
    webhookProcessor.processAsync(provider, payload)
    return ResponseEntity.ok().build()
}
```

---

## §8 Gradle 构建配置（Kotlin DSL）

> **来源**: 从 `core/skills/backend.md §2` 迁移（v4.1 L1 泛化）

```kotlin
// build.gradle.kts — 核心插件 + 依赖分组
plugins {
    kotlin("jvm") version "2.0.x"
    kotlin("plugin.spring") + kotlin("plugin.jpa") version "2.0.x"
    id("org.springframework.boot") version "3.3.x"
    id("io.spring.dependency-management") version "1.1.x"
}
dependencies {
    // Spring Boot: web, data-jpa, security, validation, cache, actuator, oauth2-resource-server, batch
    // Kotlin: jackson-module-kotlin, kotlin-reflect, kotlinx-coroutines-core
    // DB: postgresql, flyway-core, flyway-database-postgresql
    // Cache/MQ: spring-boot-starter-data-redis, spring-kafka, opensearch-java
    // API Doc: springdoc-openapi-starter-webmvc-ui:2.x
    // Test: spring-boot-starter-test, mockk, testcontainers (postgresql, kafka)
}
```

---

## §9 Spring Boot 关键配置（application.yml）

> **来源**: 从 `core/skills/backend.md §7` 迁移（v4.1 L1 泛化）

| 配置项 | 值 | 原因 |
|--------|-----|------|
| `jpa.open-in-view` | `false` | 性能陷阱，必须关闭 |
| `jpa.hibernate.ddl-auto` | `validate` | 只验证，迁移由 Flyway 管理 |
| `hibernate.default_batch_fetch_size` | `100` | 防 N+1 |
| `hibernate.jdbc.batch_size` | `50` | 批量写入性能 |
| `hikari.maximum-pool-size` | `20` | 连接池上限 |
| `management.endpoints.exposure.include` | `health,info,prometheus` | 暴露监控端点 |
| `tracing.sampling.probability` | `1.0` (dev) / `0.1` (prod) | 全采样开发，生产降频 |
| `kafka.consumer.auto-offset-reset` | `earliest` | 消费者从最早开始 |
| `security.oauth2.resourceserver.jwt.issuer-uri` | `${OIDC_ISSUER_URI}` | OIDC 验证入口 |

---

---

## §10 DDD 四层结构模板（Kotlin + Spring Boot）

> **来源**: 从 `core/skills/backend.md §3.2` 迁移

```kotlin
// Domain Layer — 零框架依赖
data class Product(val id: ProductId, val sku: Sku, val status: ProductStatus) {
    fun activate() = copy(status = ProductStatus.ACTIVE)
}
@JvmInline value class ProductId(val value: UUID)
interface ProductRepository { fun findById(id: ProductId): Product?; fun save(p: Product): Product }
sealed interface ProductEvent { data class Created(val product: Product) : ProductEvent }

// Application Layer
@Service class CreateProductUseCase(private val repo: ProductRepository, private val events: ApplicationEventPublisher) {
    @Transactional fun execute(cmd: CreateProductCommand): ProductResponse {
        val saved = repo.save(Product(ProductId(UUID.randomUUID()), cmd.sku, ProductStatus.ACTIVE))
        events.publishEvent(ProductEvent.Created(saved))
        return saved.toResponse()
    }
}

// Infrastructure Layer — JPA
@Entity @Table(name = "products") class ProductJpaEntity(@Id val id: UUID, @Column(unique = true) val sku: String, ...)
@Repository class ProductJpaRepositoryImpl(private val jpa: JpaProductRepository) : ProductRepository {
    override fun save(p: Product) = jpa.save(p.toEntity()).toDomain()
}

// API Layer
@RestController @RequestMapping("/api/v1/products")
class ProductController(private val useCase: CreateProductUseCase) {
    @PostMapping @ResponseStatus(HttpStatus.CREATED)
    fun create(@Valid @RequestBody cmd: CreateProductCommand) = ApiResponse.success(useCase.execute(cmd))
}
```

---

## §11 事务管理（Kotlin + Spring @Transactional）

> **来源**: 从 `core/skills/backend.md §5` 迁移

```kotlin
@Service class ProcessPurchaseOrderUseCase(...) {
    @Transactional fun execute(command: ProcessPOCommand) {
        val po = poRepository.findById(command.poId) ?: throw NotFoundException("PO not found")
        poRepository.save(po.markAsReceived())
        inventoryService.receive(po.items)
        financeService.createVoucher(po)
    }
}
@Service class AuditLogService {
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun log(event: AuditEvent) { repository.save(event) }
}
```

---

## §12 测试框架（JUnit 5 + ArchUnit）

> **来源**: 从 `core/skills/backend.md §6` 迁移

| 测试类型 | 框架 | 覆盖目标 | 要求 |
|----------|------|----------|------|
| 单元测试 | JUnit 5 + MockK | Domain + UseCase | ≥80% |
| 集成测试 | Testcontainers | Repository + API | 核心 100% |
| 契约测试 | Spring Cloud Contract | API 契约 | 所有公开 API |
| 架构测试 | ArchUnit | DDD 分层约束 | 100% |

```kotlin
@Test fun `domain layer should not depend on Spring`() {
    noClasses().that().resideInAPackage("..domain..")
        .should().dependOnClassesThat().resideInAPackage("org.springframework..").check(importedClasses)
}
```

---

*Version: 1.2.0 — §10-§12 从 L1 backend.md 迁移*
*Created: 2026-02-19*
*Tech Stack: Kotlin 2.0.x + Spring Boot 3.3.x*
