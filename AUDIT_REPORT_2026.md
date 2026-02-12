# MGMT V2 TypeScript Architecture - Enterprise Audit Report

**Project**: MGMT ERP V2 (Eaglestar)
**Audit Date**: 2026-02-11
**Scope**: V2 TypeScript Architecture Only (NestJS API + Next.js Web + Shared Packages + Prisma + DevOps)
**Tech Stack**: NestJS 11 / Next.js 16 / React 19 / Prisma 5 / PostgreSQL / Redis / pnpm + Turborepo

---

## Executive Summary

MGMT V2 is an enterprise ERP system undergoing migration from Django+MySQL to TypeScript+NestJS+PostgreSQL. The V2 architecture demonstrates strong security awareness (multi-level security codes, IP blacklist, account lockout, audit logging) and solid infrastructure patterns (Redis caching, distributed locks, log buffering). However, the audit uncovered **critical credential exposure**, **cryptographic weaknesses**, **frontend architecture degradation**, and **significant code duplication** that must be addressed before production deployment.

### Risk Score Overview

| Severity | Count | Description |
|----------|-------|-------------|
| **CRITICAL** | 8 | Credential exposure, weak token generation, missing error boundaries |
| **HIGH** | 19 | Code duplication, architecture violations, security gaps |
| **MEDIUM** | 32 | Type safety, performance, configuration issues |
| **LOW** | 18 | Minor improvements, style inconsistencies |
| **INFO (Positive)** | 19 | Well-designed patterns and good practices |

---

## PART 1: Backend Architecture (NestJS API)

### 1.1 Application Entry & Module Organization

**main.ts** (`apps/api/src/main.ts`)

| ID | Severity | Finding |
|----|----------|---------|
| BE-1 | Medium | **CORS `origin: true` without environment check** -- allows all origins in all environments. No `NODE_ENV` branching to restrict origins in production. Combined with `credentials: true`, any malicious site can send authenticated requests. |
| BE-2 | Medium | **TraceIdMiddleware double instantiation** -- `app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()))` creates two instances, `bind` targets the second one. Semantically incorrect. |
| BE-3 | Low | **Global interceptors/filters bypass DI container** -- `new AccessLogInterceptor()` and `new AllExceptionsFilter()` are manually instantiated instead of using `APP_INTERCEPTOR`/`APP_FILTER` tokens in AppModule. Cannot leverage `Scope.REQUEST`. |

**app.module.ts** -- Guard ordering (IpBlacklist -> JWT -> Throttler) is correct. Three-tier rate limiting (1s/10, 10s/50, 1min/200) is well-designed.

### 1.2 Authentication Module

| ID | Severity | Finding |
|----|----------|---------|
| BE-4 | **CRITICAL** | **JWT_SECRET has hardcoded default value** in `auth.module.ts:21` -- `configService.get('JWT_SECRET', 'default-secret-change-me')`. JwtModule will use this weak key if env var is missing. Contradicts JwtStrategy's strict check (min 32 chars, no default). |
| BE-5 | **HIGH** | **Refresh Token uses `Math.random()`** (`auth.service.ts:341-347`) -- not cryptographically secure. Predictable output enables token prediction attacks. Must use `crypto.randomBytes()`. |
| BE-6 | **HIGH** | **Security Token uses `Math.random()`** (`security.service.ts:191-197`) -- same CSPRNG issue. Only 32 chars (vs refresh token's 64), further reducing entropy. These tokens authorize L2-L4 high-risk operations. |
| BE-7 | Medium | **Access Token 6h expiry hardcoded** -- `auth.module.ts:23` uses `expiresIn: '6h'` ignoring `JWT_ACCESS_EXPIRATION` env var (set to 900s in .env.v2.example). 6h is excessive for enterprise apps (recommend 15-30min). |
| BE-8 | Medium | **No Refresh Token rotation** -- on refresh, only a new access token is issued. Stolen refresh tokens remain valid for 7 days. Best practice: rotate refresh token on every use. |
| BE-9 | Medium | **JWT Payload contains full permissions object** -- causes token bloat (may exceed HTTP header limits) and permissions won't update until token expires. Redundant since PermissionsGuard dynamically fetches from Redis/DB. |
| BE-10 | Medium | **`mapUserToDto` and `flattenPermissions` use `any` type** -- loses Prisma model type information. |

### 1.3 Roles Module

| ID | Severity | Finding |
|----|----------|---------|
| BE-11 | **HIGH** | **DTO uses `interface` instead of `class` + class-validator** (`roles.service.ts:464-484`) -- `CreateRoleDto` and `UpdateRoleDto` are interfaces without validation decorators. Global `ValidationPipe` cannot validate them: no input validation, no field whitelist, `level` accepts any value including negatives. |
| BE-12 | Medium | **SecurityPolicyService re-instantiated in RolesModule** -- already registered and exported by AuthModule, but RolesModule redeclares it in providers, creating a separate instance with potentially unsynchronized cache. |
| BE-13 | Medium | **`forceLogoutUsersByRole` duplicated** in both UsersService and RolesService with nearly identical logic. DRY violation. |

### 1.4 VMA Module

| ID | Severity | Finding |
|----|----------|---------|
| BE-14 | **HIGH** | **God Module anti-pattern** -- single VmaModule contains 8 Controllers and 12 Services (employees, training-sop, training-record, p-valve products, inventory, sites, clinical-case, PDF generators). Violates Single Responsibility Principle. Should be split into sub-modules. |
| BE-15 | **HIGH** | **`any` type abuse** -- 20+ occurrences across VMA services (`employees.service.ts`: 10+, `training-record.service.ts`: 3+, `clinical-case.service.ts`: 2+). Severely undermines TypeScript type safety. |

### 1.5 Logs Module

| ID | Severity | Finding |
|----|----------|---------|
| BE-16 | Medium | **`where: any` in all query methods** (`logs.service.ts`) -- 4 occurrences. Loses Prisma type inference (`Prisma.ErrorLogWhereInput` etc). |
| BE-17 | Medium | **`requireSuperadmin` bypasses Guard system** -- manual role check inside Controller instead of using `@Roles` decorator + RolesGuard. Naming is misleading (also allows `admin` role). |

### 1.6 Products Module

| ID | Severity | Finding |
|----|----------|---------|
| BE-18 | Low | **`batchCreate` uses loop instead of bulk operation** -- calls `create()` per item in a loop. Should use `createMany` or transaction wrapping for large batches. |

### 1.7 Common Infrastructure

**Positive Findings:**
- Log architecture is excellent: 4-type separation (Access/Audit/Business/Error), batch buffered writes (100/batch, 1s flush), fire-and-forget async, error aggregation
- Sensitive data masking is comprehensive: field blacklist + HTTP header whitelist, Authorization header replaced with `[BEARER TOKEN]`
- Redis architecture is well-designed: namespace conventions, clear TTL strategy, graceful degradation, distributed locks, account lockout integration
- `@AuditLog`/`@BusinessLog` decorators are well-designed (but underutilized)

| ID | Severity | Finding |
|----|----------|---------|
| BE-19 | Medium | **`KEYS` command used in `delByPattern`** (`cache.service.ts`) -- blocks entire Redis server on large instances. Must use `SCAN` instead. |
| BE-20 | Low | **Distributed lock release is non-atomic** -- GET then DEL has race condition. Should use Lua script for atomicity. |
| BE-21 | Medium | **Error trend query has N+1 problem** -- 7-day trend requires 7 separate COUNT queries. Should use `groupBy` or raw SQL aggregation. |
| BE-22 | Medium | **500 errors may expose internal details** -- `error.name` (e.g., `PrismaClientKnownRequestError`) and `error.message` returned in response body. Production should return generic message for 5xx. |

### 1.8 Code Duplication (DRY Violations)

| ID | Severity | Finding |
|----|----------|---------|
| BE-23 | **HIGH** | **`extractClientIp`/`getClientIP` duplicated in 15 files** -- nearly identical IP extraction logic in every Controller, Guard, Filter, Interceptor, and Decorator. Must extract to `common/utils/request.utils.ts`. |
| BE-24 | **HIGH** | **`AuthenticatedRequest` interface duplicated in 10+ files** -- each Controller defines its own copy. Must unify in `common/interfaces/`. |
| BE-25 | **HIGH** | **`SecurityCodeFields` DTO base class duplicated** -- identical definition in both `users/dto/users.dto.ts` and `products/dto/products.dto.ts`. |
| BE-26 | Medium | **Audit logging pattern is manual despite `@AuditLog` decorator existing** -- Controllers manually build audit log context with boilerplate code. The existing declarative decorator is barely used. |
| BE-27 | Low | **Test coverage is minimal** -- only 5 spec files (auth, users, app). Products, Roles, Logs, and entire VMA module have zero test coverage. |

---

## PART 2: Frontend Architecture (Next.js Web)

### 2.1 App Router Architecture

| ID | Severity | Finding |
|----|----------|---------|
| FE-1 | **CRITICAL** | **Zero Server Components -- complete CSR degradation** -- ALL page.tsx and module layout.tsx files are marked `'use client'` (63 files). No Suspense, no streaming SSR, no meaningful FCP. Completely negates App Router's core value proposition. |
| FE-2 | **CRITICAL** | **No Error Boundary anywhere** -- no `error.tsx`, no React ErrorBoundary component. Any unhandled runtime error causes full white-screen crash. |
| FE-3 | **HIGH** | **Module layouts contain 90% duplicate code** -- `vma/layout.tsx`, `users/layout.tsx`, `products/layout.tsx`, `logs/layout.tsx` are nearly identical (same locale parsing, same ModalProvider+ThemedBackground+AppleNav wrapper, same `isHubPage` logic). |
| FE-4 | **HIGH** | **Double navigation rendering** -- `(dashboard)/layout.tsx` (Server Component) renders `<AppleNav>`, and each child module layout (Client Component) renders `<AppleNav>` again. Navigation bar is rendered twice. |

### 2.2 State Management

| ID | Severity | Finding |
|----|----------|---------|
| FE-5 | **CRITICAL** | **TanStack Query installed but barely used** -- configured in `providers.tsx` but only 7 files use `useQuery`/`useMutation` (users/products only). **All 18 VMA page files bypass it entirely**, using raw `fetch` + `getAuthHeaders()` with no caching, no retry, no loading/error state management. |
| FE-6 | **HIGH** | **User state scattered across localStorage** -- `localStorage.getItem('user')` + `JSON.parse` is repeated in 8+ files with no centralized Auth Context or User Store. Each component independently manages user state. |
| FE-7 | Medium | **`useAutoRefresh` hook reimplements TanStack Query features** -- implements pause/resume, visibility change detection, which TanStack Query provides natively via `refetchInterval` and `refetchOnWindowFocus`. |

### 2.3 Authentication Flow

| ID | Severity | Finding |
|----|----------|---------|
| FE-8 | **CRITICAL** | **Tokens stored in localStorage** (`LoginModal.tsx:65-67`) -- `accessToken`, `refreshToken`, and full `user` object stored in `localStorage`. Any XSS vulnerability enables complete token theft. Enterprise apps should use `HttpOnly` cookies. |
| FE-9 | **CRITICAL** | **`auth_session` cookie stores plaintext accessToken without HttpOnly** (`LoginModal.tsx`) -- `document.cookie = \`auth_session=${accessToken}\`` is readable by JavaScript. 6h max-age may desync with JWT expiry. |
| FE-10 | **HIGH** | **Middleware only checks cookie existence, not validity** (`middleware.ts:43-53`) -- any non-empty `auth_session` cookie value passes the check. Expired or forged tokens are not detected. |
| FE-11 | **HIGH** | **Refresh Token stored but never used** -- `refreshToken` is saved on login and cleared on logout, but no auto-refresh logic exists anywhere. Users are force-logged-out when access token expires. |
| FE-12 | Medium | **PermissionGuard is pure client-side control** -- based entirely on `localStorage` user permissions. Attackers can modify localStorage to bypass frontend permission checks. Comment says "backend will catch it", but users see UI they shouldn't. |

### 2.4 API Layer

| ID | Severity | Finding |
|----|----------|---------|
| FE-13 | **CRITICAL** | **`logs.ts` hardcodes `http://localhost:3001`** (`lib/api/logs.ts:1`) -- unlike `client.ts` which uses `NEXT_PUBLIC_API_URL`, logs API always calls localhost. Will break in any non-local deployment. |
| FE-14 | **HIGH** | **Two parallel API architectures** -- (1) Normalized: `client.ts` + `users.ts` + `products.ts` with unified error handling, (2) Ad-hoc: `logs.ts` + 18 VMA files each defining their own `fetch` + headers. |
| FE-15 | **HIGH** | **`lib/api/index.ts` exports are incomplete** -- missing `logsApi` and `rolesApi` exports, indicating the API layer isn't used as a unified entry point. |

### 2.5 Internationalization

| ID | Severity | Finding |
|----|----------|---------|
| FE-16 | Medium | **All 33 translation files statically imported** -- all three languages loaded regardless of user selection. Should use dynamic `import()` for current language only. |
| FE-17 | Medium | **Language switch triggers `window.location.reload()`** -- full page refresh instead of using `next-intl`'s native switching capability. |
| FE-18 | Medium | **Locale parsing logic duplicated in 4 module layouts** -- identical cookie parsing code. Should extract to `useLocale()` hook or use `next-intl` context. |
| FE-19 | Low | **Hardcoded English strings** in `dashboard/page.tsx` ("System Status", "Running", "API Server", etc.) and `PermissionGuard.tsx` ("Access Denied"). |

### 2.6 Performance & UI

| ID | Severity | Finding |
|----|----------|---------|
| FE-20 | **HIGH** | **No `loading.tsx` or Suspense boundaries** -- no route transition indicators anywhere in the app. |
| FE-21 | Medium | **Theme via inline styles, not CSS variables** -- `ThemeContext.tsx` applies themes through `style={{ color: colors.text }}`. Causes full re-render on theme switch, prevents CSS-native performance, causes FOUC (defaults to dark, switches in useEffect). |
| FE-22 | Medium | **Dual theme systems** -- `globals.css` has complete shadcn/ui CSS variables (`:root` and `.dark`), but actual theming is controlled by JavaScript `themeColors` object. Two systems coexist but are unconnected. |
| FE-23 | Medium | **Hub pages duplicate carousel implementation** -- VMA and Users hub pages contain near-identical carousel logic (scrollCarousel, updateScrollButtons, anime.js stagger). Should extract to `<FeatureCarousel>`. |

### 2.7 Code Quality

| ID | Severity | Finding |
|----|----------|---------|
| FE-24 | **HIGH** | **`NAV_TO_PERMISSION_PREFIX` duplicated in 3 files** -- `dashboard/page.tsx`, `AppleNav.tsx`, `PermissionGuard.tsx`. `hasModulePermission` function also duplicated. |
| FE-25 | **HIGH** | **Module definitions duplicated** -- full module config in both `AppleNav.tsx` (groups/items) and `dashboard/page.tsx` (subs), with different structures increasing sync maintenance risk. |
| FE-26 | Medium | **`AppleNav` is 580 lines** -- contains module definitions, permission checks, user menu, theme toggle, dropdown panels, CSS animations. Should be split into sub-components. |
| FE-27 | Medium | **DashboardLayout.tsx is likely dead code** -- contains hardcoded `"A"`, `"admin"`, `"Superuser"`. Appears to be replaced by `AppleNav` but still in codebase. Also uses `setInterval(100ms)` polling localStorage for sidebar state. |
| FE-28 | Medium | **Component placement inconsistent in VMA** -- three different patterns: `vma/components/`, `_` prefix files, co-located with `page.tsx`. |

---

## PART 3: Security Audit

### 3.1 Authentication Security

| ID | Severity | Finding |
|----|----------|---------|
| SEC-1 | **CRITICAL** | **JWT_SECRET default value** -- (see BE-4) |
| SEC-2 | **HIGH** | **Math.random() for security tokens** -- (see BE-5, BE-6) |
| SEC-3 | **HIGH** | **CORS allows all origins with credentials** -- (see BE-1) expanded: any website can make authenticated cross-origin requests |
| SEC-4 | **HIGH** | **Security code env fallback uses plaintext comparison** (`security-policy.service.ts:259-264`, `security.service.ts:134-144`) -- when DB code doesn't exist, falls back to `code === expectedCode` (not constant-time, vulnerable to timing side-channel). |
| SEC-5 | **HIGH** | **Token storage in localStorage** -- (see FE-8, FE-9) |
| SEC-6 | **HIGH** | **IP address spoofable via X-Forwarded-For** (`ip-blacklist.guard.ts:51-63`) -- directly trusts `X-Forwarded-For` and `X-Real-IP` headers without `app.set('trust proxy', ...)`. Attacker can bypass IP blacklist or cause false blocks. Same logic duplicated in 15 files. |

### 3.2 Authorization Security

| ID | Severity | Finding |
|----|----------|---------|
| SEC-7 | Medium | **Superuser bypasses all permission checks** (`permissions.guard.ts:44-50`) -- if superuser account is compromised, attacker gets full system access without any additional verification. |
| SEC-8 | Medium | **RolesGuard/PermissionsGuard not registered globally** -- must be manually added per controller/route. Missing decorator = missing authorization check. |
| SEC-9 | Medium | **Password complexity insufficient** (`auth.dto.ts:36-50`) -- only requires `@MinLength(8)`, no uppercase/lowercase/number/special character requirements. |
| SEC-10 | Medium | **No CSRF protection** -- while Bearer token auth theoretically doesn't need it, the `auth_session` Cookie + `credentials: true` CORS creates a Cookie-based state surface. |

### 3.3 Infrastructure Security

| ID | Severity | Finding |
|----|----------|---------|
| SEC-11 | Medium | **Redis failure degrades all security to "allow-all"** (`cache.service.ts:394-396`) -- when Redis is down, account lockout, IP blacklist, rate limiting, and permission caching all return permissive defaults. |
| SEC-12 | Medium | **Frontend middleware can be bypassed** -- (see FE-10) |

### 3.4 Positive Security Findings

- Helmet configuration is comprehensive (CSP, HSTS 1yr+preload, frameguard deny, hidePoweredBy)
- Three-tier rate limiting + endpoint-specific limits (login: 5/min, security-code: 3/5min)
- ValidationPipe with `whitelist: true` + `forbidNonWhitelisted: true` (prevents mass assignment)
- Prisma ORM prevents SQL injection (no `$queryRaw` usage found)
- JwtStrategy has fail-fast key validation (min 32 chars, no default)
- Password hashing uses bcrypt with salt rounds 10
- Stack traces hidden by default (`EXPOSE_STACK` env flag required)
- Log sensitive data masking is thorough (field blacklist + header whitelist)
- Alert email system with throttling to prevent alert bombing
- IP blacklist as first global guard layer

---

## PART 4: Database Audit (Prisma + PostgreSQL)

### 4.1 Schema Design

| ID | Severity | Finding |
|----|----------|---------|
| DB-1 | Medium | **Permissions stored as unstructured JSON** (`users_auth.prisma:17`) -- `permissions Json @default("{}")`. Code handles two formats (flat keys and nested objects). Increases complexity and inconsistency risk. |
| DB-2 | Low | **Soft-delete fields lack indexes** -- `User.deletedAt` and `Product.deletedAt` have no corresponding index. |
| DB-3 | Low | **Missing `category` index on Product table** -- ProductQueryDto supports category filtering but no index exists. |

**Positive:** Schema uses modular multi-file design (13 `.prisma` files by domain). UUID primary keys with `@default(uuid())`, proper timestamps with `@updatedAt`.

### 4.2 Index Strategy

Log tables have excellent indexing (ErrorLog: 10 indexes including composite). Audit logs properly indexed on traceId, userId, module, action, riskLevel, createdAt.

| ID | Severity | Finding |
|----|----------|---------|
| DB-4 | Low | **AccessLog missing `[userId, createdAt]` composite index** -- common query pattern "user's recent access" not optimized. |

### 4.3 Relationships & Cascade

Cascade strategies are generally well-designed (User->RefreshToken: Cascade, User->AuditLog: SetNull, Department->EmployeeDepartment: Restrict).

| ID | Severity | Finding |
|----|----------|---------|
| DB-5 | Medium | **VmaInventoryTransaction foreign keys lack cascade protection** -- append-only ledger records should use `onDelete: Restrict` to prevent batch/case deletion. |
| DB-6 | Low | **VmaTrainingRecord->Session missing cascade protection** -- deleted Session leaves dangling `sessionId` references. |

### 4.4 Unique Constraints

All critical business uniqueness constraints are correctly set (User.username, User.email, RefreshToken.token, SecurityCode.[level,isActive], Role.name, Role.level, Product.sku, VmaEmployee.employeeNo, etc.).

### 4.5 Migration Management

| ID | Severity | Finding |
|----|----------|---------|
| DB-7 | **HIGH** | **Migration contains unlabeled destructive changes** -- `20260206060552_add_logging_system/migration.sql` drops 8 business tables (purchase_orders, suppliers, shipments, etc.) without data migration scripts. Migration name doesn't reflect deletion. |
| DB-8 | Low | **Manual migration directory exists** (`prisma/migrations/manual/`) -- bypasses Prisma Migrate workflow, may cause schema/migration history drift. |

---

## PART 5: DevOps & Configuration

### 5.1 Credential Exposure (CRITICAL CLUSTER)

| ID | Severity | Finding |
|----|----------|---------|
| OPS-1 | **CRITICAL** | **`.env` and `.env.v2` contain all production credentials** -- DB passwords, JWT secret, SMTP credentials (Gmail App Password), security codes in plaintext. Must verify git tracking status. |
| OPS-2 | **CRITICAL** | **`.env.v2.example` contains real security codes** -- L1=7951, L2=1522, L3=6130, L4=***REDACTED_SYSTEM_CODE*** (should be placeholders). If committed to git, codes are permanently exposed in history. |
| OPS-3 | **CRITICAL** | **`scripts/restore-credentials.ts` hardcodes ALL credentials** -- admin password `1522P`, simon password `topmorrow`, all 4 security codes, default password `12345`. Also prints them to console. |
| OPS-4 | **CRITICAL** | **`ops/start_server.sh` contains Cloudflare Tunnel token** -- full JWT token hardcoded at line 21. Can be used to establish tunnels to internal services. |
| OPS-5 | **HIGH** | **`prisma/seed.ts` uses weak defaults** -- admin password `Admin@123`, all security codes `1234`. Prints credentials to console. |

### 5.2 TypeScript Configuration

| ID | Severity | Finding |
|----|----------|---------|
| OPS-6 | **HIGH** | **API `tsconfig.json` lacks full `strict` mode** -- manually picks subset of strict options, missing `strictPropertyInitialization`, `strictFunctionTypes`, `alwaysStrict`. |
| OPS-7 | Medium | **No root `tsconfig.base.json`** -- each subproject has independent, inconsistent TS config (target: ES2017 vs ES2022 vs ES2023, module: CommonJS vs ESM vs NodeNext). |

### 5.3 Build & Monorepo

| ID | Severity | Finding |
|----|----------|---------|
| OPS-8 | Medium | **Turbo `globalDependencies` incomplete** -- only watches `.env.*local`, misses `.env` and `.env.v2`. Config changes won't invalidate build cache. |
| OPS-9 | Medium | **Empty package placeholders** -- `packages/config/` and `packages/ui/` are empty directories (no `package.json`), matched by workspace glob. |

### 5.4 Dependency Management

| ID | Severity | Finding |
|----|----------|---------|
| OPS-10 | **HIGH** | **Runtime dependencies in root `package.json`** -- `@prisma/client`, `bcrypt`, `mysql2`, `dotenv` in root `dependencies`. `@types/bcrypt` in `dependencies` instead of `devDependencies`. In monorepo, runtime deps should be in consuming app packages. |
| OPS-11 | **HIGH** | **`apps/web` does not reference `@mgmt/shared`** -- no `@mgmt/shared` in web's package.json, no imports found. Web independently defines `ApiResponse` with a completely different structure than shared. Frontend-backend type contract is broken. |
| OPS-12 | Medium | **Prisma version inconsistency** -- root pins `5.22.0`, apps/api uses `^5.22.0`. May cause resolution conflicts in pnpm strict mode. |
| OPS-13 | Medium | **Duplicate dependencies** -- `dotenv`, `bcrypt`, `@types/bcrypt` appear in both root and apps/api. |
| OPS-14 | Low | **Four document generation libraries** -- `pdf-lib`, `pdfkit`, `docx`, `docxtemplater` all installed. Consider consolidating. |

### 5.5 ESLint & Code Quality

| ID | Severity | Finding |
|----|----------|---------|
| OPS-15 | Medium | **API ESLint disables `@typescript-eslint/no-explicit-any`** -- completely off, enabling the 30+ `any` usages found. Should be at least `warn`. |
| OPS-16 | Medium | **No root-level Prettier config** -- only `apps/api` has `.prettierrc`. Root `pnpm format` applies inconsistent rules. |
| OPS-17 | Low | **`packages/shared` has no ESLint config** -- code quality relies on developer discipline. |

### 5.6 Git Configuration

| ID | Severity | Finding |
|----|----------|---------|
| OPS-18 | **HIGH** | **.gitignore missing key exclusions** -- `*.pid`, `.turbo/`, `node_modules/` (not explicit), `dist/`, `.next/`, `coverage/`. |
| OPS-19 | Medium | **`.env.*` glob too aggressive** -- excludes `.env.v2.example` (template file that should be tracked, but only with placeholder values). |
| OPS-20 | Low | **.DS_Store files present** in app/, vma/, vma/data/ directories. |

### 5.7 Shared Package

| ID | Severity | Finding |
|----|----------|---------|
| OPS-21 | **HIGH** | **Business domain types missing** -- `packages/shared/src/types/` only has `auth.ts` and `api.ts`. No types for products, roles, logs, users-management, or VMA. Estimated type coverage: ~25-30% of API surface. |
| OPS-22 | Medium | **`SecurityLevel` type defined in two files** -- `types/auth.ts` and `constants/security.ts` both export `SecurityLevel` with different derivation. Export order in `index.ts` determines which wins, fragile. |
| OPS-23 | Medium | **`sanitizeString` is insufficient** -- only removes `<>`, doesn't handle `&`, `"`, `'`. Not adequate for XSS prevention. Use `DOMPurify` or similar. |
| OPS-24 | Medium | **i18n resources in shared package but no export mechanism** -- `i18n/` directory not exposed via `package.json` exports, consumers must use direct file paths. |

---

## PART 6: Consolidated Findings Summary

### Critical (8 findings) -- Immediate Action Required

| # | Area | Finding | Impact |
|---|------|---------|--------|
| 1 | Security | Credentials hardcoded in scripts (`restore-credentials.ts`, `seed.ts`) and `.env.v2.example` | Full system compromise if git history is accessible |
| 2 | Security | Cloudflare Tunnel token in `ops/start_server.sh` | Unauthorized tunnel access to internal services |
| 3 | Security | `Math.random()` for refresh tokens and security tokens | Token prediction, session hijacking |
| 4 | Security | JWT_SECRET has hardcoded default `'default-secret-change-me'` | JWT forgery if env var is missing |
| 5 | Security | Tokens stored in localStorage (XSS-vulnerable) | Complete credential theft via any XSS |
| 6 | Frontend | No Error Boundary (no `error.tsx`, no React ErrorBoundary) | Full white-screen crash on any runtime error |
| 7 | Frontend | TanStack Query installed but VMA module (18 pages) uses raw fetch | No caching, no retry, no loading states for primary business module |
| 8 | Frontend | `logs.ts` hardcodes `http://localhost:3001` | Logs module broken in any non-local deployment |

### High (19 findings) -- Fix Before Production

| # | Area | Finding |
|---|------|---------|
| 1 | Backend | `extractClientIp` duplicated in 15 files |
| 2 | Backend | `AuthenticatedRequest` interface duplicated in 10+ files |
| 3 | Backend | `SecurityCodeFields` DTO duplicated in 2 files |
| 4 | Backend | VMA "God Module" (8 Controllers, 12 Services) |
| 5 | Backend | `any` type: 30+ occurrences in non-test code |
| 6 | Backend | Roles DTO uses interface without validation |
| 7 | Security | CORS `origin: true` with credentials in all environments |
| 8 | Security | Security code plaintext comparison fallback (timing attack) |
| 9 | Security | IP spoofable via X-Forwarded-For (no trust proxy config) |
| 10 | Frontend | Module layouts 90% duplicate code (4 files) |
| 11 | Frontend | Double navigation rendering (dashboard layout + module layout) |
| 12 | Frontend | Two parallel API architectures (client.ts vs raw fetch) |
| 13 | Frontend | User state scattered across localStorage (8+ files) |
| 14 | Frontend | Refresh token stored but never used for auto-refresh |
| 15 | Frontend | Middleware doesn't validate token, only checks existence |
| 16 | Frontend | Permission mapping (`NAV_TO_PERMISSION_PREFIX`) duplicated 3x |
| 17 | Frontend | No `loading.tsx` or Suspense boundaries |
| 18 | Database | Migration drops 8 tables without data migration |
| 19 | DevOps | Web app doesn't use `@mgmt/shared` (broken type contract) |

---

## PART 7: Prioritized Remediation Plan

### P0 -- Immediate (Security-Critical)

1. **Credential Rotation & History Cleanup**
   - Verify if `.env`, `.env.v2.example`, `restore-credentials.ts`, `start_server.sh` are git-tracked
   - If yes: use `git filter-repo` or BFG Repo-Cleaner to purge history
   - Rotate ALL exposed credentials: DB passwords, JWT secret, SMTP password, Cloudflare token, all security codes
   - Replace hardcoded credentials with environment variable references

2. **Fix Token Generation**
   - Replace `Math.random()` with `crypto.randomBytes()` in `auth.service.ts` and `security.service.ts`
   - Remove JWT_SECRET default value in `auth.module.ts`

3. **Add Error Boundaries**
   - Create `app/(dashboard)/error.tsx` at minimum
   - Consider adding per-module `error.tsx` files

### P1 -- Short-term (Architecture)

4. **Unify API Layer**
   - Fix `logs.ts` to use `NEXT_PUBLIC_API_URL`
   - Migrate all VMA pages to use `lib/api/client.ts` + TanStack Query
   - Create centralized `AuthContext` for user state management

5. **Token Storage Migration**
   - Move token storage to `HttpOnly + Secure + SameSite=Strict` cookies
   - Implement server-side token refresh flow
   - Remove all `localStorage.getItem('accessToken')` patterns

6. **CORS Environment Branching**
   - Add `NODE_ENV`-based CORS origin whitelist
   - Configure `app.set('trust proxy', 1)` if behind reverse proxy

7. **Eliminate Code Duplication**
   - Extract `extractClientIp()` to `common/utils/request.utils.ts`
   - Unify `AuthenticatedRequest` in `common/interfaces/`
   - Extract `SecurityCodeFields` to `common/dto/`
   - Create shared module layout component

### P2 -- Medium-term (Quality)

8. **Type Safety**
   - Enable full `strict: true` in `apps/api/tsconfig.json`
   - Enable `@typescript-eslint/no-explicit-any: 'warn'` in ESLint
   - Replace all `any` with proper types (Prisma types, custom interfaces)
   - Create root `tsconfig.base.json` for consistent settings

9. **Shared Package Enhancement**
   - Add `@mgmt/shared` as dependency to `apps/web`
   - Add business domain types (products, roles, logs, VMA)
   - Fix `SecurityLevel` duplicate definition

10. **VMA Module Split**
    - Split into sub-modules: `VmaEmployeesModule`, `VmaTrainingModule`, `VmaInventoryModule`, etc.
    - Convert Roles DTOs from interfaces to validated classes

### P3 -- Long-term (Optimization)

11. **Server Component Migration**
    - Identify pages that can be Server Components (data display, no interactivity)
    - Add `loading.tsx` files for route transitions
    - Implement Suspense boundaries

12. **Theme System Consolidation**
    - Unify shadcn/ui CSS variables with ThemeContext
    - Migrate from inline styles to CSS variable-driven theming

13. **Testing**
    - Add unit tests for Products, Roles, Logs, VMA modules
    - Add integration tests for critical auth flows
    - Add E2E tests for key user journeys

14. **Infrastructure Hardening**
    - Implement Refresh Token rotation
    - Add Redis failure circuit breaker (fail-closed for security operations)
    - Add database-level CHECK constraints via migrations
    - Consolidate PDF generation libraries

---

## Appendix: Files Audited

### Backend (112 TypeScript files)
- `apps/api/src/main.ts`, `app.module.ts`
- `apps/api/src/modules/auth/**` (controller, service, security.service, dto, guards, strategies, decorators)
- `apps/api/src/modules/users/**` (controller, service, dto)
- `apps/api/src/modules/roles/**` (controller, service, module)
- `apps/api/src/modules/products/**` (controller, service, dto)
- `apps/api/src/modules/logs/**` (controller, service, dto)
- `apps/api/src/modules/vma/**` (8 controllers, 12 services, DTOs)
- `apps/api/src/common/**` (guards, filters, interceptors, middleware, decorators, redis, logging, alert)

### Frontend (63+ TypeScript/TSX files)
- `apps/web/src/app/**` (all layouts, pages, route groups)
- `apps/web/src/components/**` (ui, layout, guards, modal, forms, tables)
- `apps/web/src/lib/api/**` (client, users, products, logs, roles, index)
- `apps/web/src/contexts/**`, `hooks/**`, `middleware.ts`, `i18n.ts`

### Database (13 Prisma schema files + migrations + seeds)
- `prisma/schema/*.prisma`
- `prisma/migrations/**`
- `prisma/seed.ts`

### DevOps & Configuration
- Root: `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`
- Per-app: `tsconfig.json`, `eslint.config.mjs`, `.prettierrc`
- Scripts: `scripts/*.ts`, `scripts/*.sh`
- Ops: `ops/*.sh`, `ops/*.py`
- Environment: `.env`, `.env.v2`, `.env.v2.example`, `apps/web/.env.local`

---

*Report generated by Claude Code enterprise audit*
*Audit methodology: Static code analysis with file-by-file review*
