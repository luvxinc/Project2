# VMA P-VALVE Enterprise Audit Report

> **Date:** 2026-02-16  
> **Scope:** VMA P-VALVE module — all backend (V3 Spring Boot/Kotlin) + frontend (Next.js 16/React 19)  
> **Auditor:** QA Agent (Guard §2 Code Review)  
> **Previous Baseline:** VMA Enterprise Audit 2026-02-11 (综合评分 7.2/10)

---

## 📊 Executive Summary

| Dimension | Score | Status |
|-----------|-------|--------|
| Architecture | 7.5/10 | 🟡 Good, minor issues |
| Security | 5.0/10 | 🔴 Critical gaps |
| Data Integrity | 7.0/10 | 🟡 Mostly solid |
| API Design | 8.0/10 | 🟢 Well-structured |
| Code Quality (Backend) | 7.5/10 | 🟡 Clean, some debt |
| Code Quality (Frontend) | 4.0/10 | 🔴 Monolithic, urgent |
| Performance | 5.5/10 | 🔴 Full-table scans |
| Logging & Audit Trail | 7.5/10 | 🟡 Good, gaps exist |
| i18n | 8.0/10 | 🟢 3-language coverage |
| Testing | 3.0/10 | 🔴 Near zero for P-VALVE |
| Compliance (FDA) | 4.0/10 | 🔴 Missing fundamental requirements |
| Frontend-Backend Alignment | 6.5/10 | 🟡 TypeScript mismatch |
| **Composite Score** | **6.1/10** | 🟡 **Significant improvements needed** |

---

## Files Audited

### Backend (V3 Kotlin/Spring Boot) — 10 files, ~1,690 lines
| File | Lines | Purpose |
|------|-------|---------|
| `VmaEntities.kt` | 365 | Domain entities (P-Valve, DS, Fit, Inventory, ClinicalCase, Site) |
| `VmaRepositories.kt` | 230 | Spring Data JPA repositories |
| `VmaPValveProductController.kt` | 97 | P-Valve + DS + Fit REST API (10 endpoints) |
| `VmaPValveProductService.kt` | 222 | Product CRUD business logic |
| `VmaClinicalCaseController.kt` | 149 | Clinical Case REST API (13 endpoints) |
| `VmaClinicalCaseService.kt` | 484 | Clinical case lifecycle + PDF |
| `VmaInventoryController.kt` | 171 | Inventory REST API (13 endpoints) |
| `VmaInventoryTransactionService.kt` | 388 | Inventory CRUD + query/summary/detail |
| `VmaSiteController.kt` | 40 | Site REST API (3 endpoints) |
| `VmaSiteService.kt` | 57 | Site CRUD |
| `VmaPackingListPdfService.kt` | 140 | Packing List PDF generation |
| `VmaReceivingPdfService.kt` | 229 | Receiving Inspection PDF generation |
| `dto/VmaInventoryDtos.kt` | 264 | All P-VALVE related DTOs |
| `dto/VmaDtos.kt` | 137 | Employee/Dept DTOs (context) |

### Frontend (Next.js) — 9 files, ~130,000+ characters
| File | Size (chars) | Purpose |
|------|-------------|---------|
| `inventory/page.tsx` | ~49K | P-Valve inventory management |
| `clinical-case/page.tsx` | ~9K | Clinical case management |
| `product-management/page.tsx` | ~14K | Product CRUD |
| `demo-inventory/page.tsx` | ~25K | Demo inventory |
| `delivery-system/page.tsx` | ~15K | Delivery system management |
| `fridge-shelf/page.tsx` | ~2K | Fridge shelf management |
| `site-management/page.tsx` | ~16K | Site CRUD |
| `overview/page.tsx` | ~9K | P-Valve overview dashboard |
| `components/PValveTabSelector.tsx` | ~6K | Tab navigation (Apple-style) |

---

## 🔴 P0 — Critical Issues (Must Fix)

### S-1 · Permission Granularity — ALL 39 P-VALVE endpoints share `vma.employees.manage`

**Severity:** 🔴 CRITICAL  
**Files:** ALL Controller files  
**Finding:** Every single endpoint across 4 controllers (39 total) uses the same permission string `vma.employees.manage`. This means:
- A user with "employee management" permission can **delete clinical cases**
- A user with "employee management" permission can **modify inventory transactions**  
- A user with "employee management" permission can **create/delete P-Valve products**
- **No granular authorization** between read vs. write operations

```kotlin
// VmaPValveProductController.kt — ALL 10 endpoints
@RequirePermission("vma.employees.manage")  // ← Same for GET, POST, PATCH, DELETE

// VmaClinicalCaseController.kt — ALL 13 endpoints  
@RequirePermission("vma.employees.manage")  // ← Should be vma.clinical.manage or similar

// VmaInventoryController.kt — ALL 13 endpoints
@RequirePermission("vma.employees.manage")  // ← Should be vma.inventory.manage or similar

// VmaSiteController.kt — ALL 3 endpoints
@RequirePermission("vma.employees.manage")  // ← Should be vma.site.manage or similar
```

**Recommendation:** Implement domain-specific permissions:
- `vma.products.read`, `vma.products.manage`
- `vma.inventory.read`, `vma.inventory.manage`
- `vma.clinical.read`, `vma.clinical.manage`
- `vma.site.read`, `vma.site.manage`

---

### S-2 · No Request Validation (Jakarta `@Valid`) — Zero input validation on ANY DTO

**Severity:** 🔴 CRITICAL  
**Files:** All DTOs in `VmaInventoryDtos.kt`, All Controllers  
**Finding:** No `@Valid` annotation on ANY `@RequestBody` parameter. No Jakarta Bean Validation annotations (`@NotBlank`, `@Size`, `@Positive`, etc.) on ANY DTO field. The DTOs are pure data classes with no constraints whatsoever.

**Impact:**
- Arbitrary-length strings can be inserted into the database
- Negative quantities can be submitted (`qty = -100`)
- Invalid enum values will cause unhandled `IllegalArgumentException`
- SQL injection via string fields is mitigated by JPA but XSS is unguarded
- Empty `model` or `specification` strings bypass application-level uniqueness

```kotlin
// dto/VmaInventoryDtos.kt — NO validation annotations
data class CreatePValveProductRequest(
    val model: String,            // ← No @NotBlank, no @Size
    val specification: String,    // ← No @NotBlank, no @Size limit
    val diameterA: Double? = null, // ← No @Positive, no @DecimalMin
    // ...
)

// Controller — NO @Valid
fun createPValveProduct(@RequestBody dto: CreatePValveProductRequest)  // ← Missing @Valid
```

**Recommendation:** 
1. Add `@Valid` to all `@RequestBody` parameters
2. Add `@field:NotBlank`, `@field:Size(max=255)`, `@field:Positive` etc. to DTO fields

---

### T-1 · Zero P-VALVE Integration Tests

**Severity:** 🔴 CRITICAL  
**File:** `VmaIntegrationTest.kt` (326 lines)  
**Finding:** The existing integration test file covers Employee/Department CRUD only (17 tests). There are **zero tests** for:
- P-Valve Product CRUD (0/4 endpoints tested)
- Delivery System Product CRUD (0/4 endpoints tested)
- Fit Matrix operations (0/2 endpoints tested)
- Inventory Transaction CRUD (0/5 endpoints tested)
- Inventory Query/Report (0/5 endpoints tested)
- Receiving operations (0/2 endpoints tested)
- Clinical Case lifecycle (0/13 endpoints tested)
- Site CRUD (0/3 endpoints tested)
- **Total: 0/39 P-VALVE endpoints have integration tests**

**Impact:** Any regression in business logic, query logic, or data integrity is undetectable.

**Recommendation:** Create `VmaPValveIntegrationTest.kt` covering:
1. Product CRUD + uniqueness constraints
2. Fit Matrix update/query
3. Inventory receiving + summary + detail buckets
4. Clinical Case full lifecycle (create → pick → complete → reverse)
5. Edge cases: expiry tracking, MOVE_DEMO flow

---

### F-1 · Frontend Files Are Monolithic Giants

**Severity:** 🔴 CRITICAL  
**Files:** `inventory/page.tsx` (49K), `demo-inventory/page.tsx` (25K), `site-management/page.tsx` (16K), `delivery-system/page.tsx` (15K), `product-management/page.tsx` (14K)  
**Finding:** Frontend pages are single-file monoliths with **thousands of characters each**. `inventory/page.tsx` alone is approximately **49,000 characters**. Common symptoms:
- 30+ `useState` hooks per file
- Mixed UI rendering, data fetching, and business logic
- Inline modal components not extracted
- Duplicated patterns across files (table rendering, modal handling, API calls)

**Impact:** Unmaintainable, untestable, high cognitive load, impossible to review in PRs.

**Recommendation:** Extract per-page into 3-4 files:
```
inventory/
  page.tsx              (routing shell + composition)
  InventoryTable.tsx    (table component)
  ReceiveModal.tsx      (receiving modal)
  useInventoryData.ts   (custom hook for data + mutations)
```

---

### F-2 · No React Query — All Pages Use Raw `fetch` + `useState`

**Severity:** 🔴 CRITICAL  
**Files:** ALL frontend page files  
**Finding:** Every frontend page uses:
- `useState` for data storage
- `useEffect` + raw `fetch()` for data loading  
- Manual loading/error state management
- No cache invalidation strategy
- No optimistic updates
- No automatic refetch on focus

**Impact:** Poor UX (no loading states, stale data), code duplication, manual error handling everywhere.

**Recommendation:** Implement TanStack Query (React Query v5) with:
- `useQuery` for all GET operations
- `useMutation` for all write operations with `onSuccess: () => queryClient.invalidateQueries()`
- Shared query keys factory

---

## 🟡 P1 — Important Issues (Should Fix Soon)

### S-3 · Missing Audit Logs on Write Operations

**Severity:** 🟡 HIGH  
**Files:** `VmaPValveProductController.kt`, `VmaClinicalCaseController.kt`, `VmaSiteController.kt`  
**Finding:** Several write operations lack `@AuditLog`:

| Endpoint | Audited? |
|----------|----------|
| `PATCH /pvalve-products/{id}` (Update P-Valve) | ❌ **Missing** |
| `PATCH /delivery-system-products/{id}` (Update DS) | ❌ **Missing** |
| `PATCH /fit-relationship` (Update Fit) | ❌ **Missing** |
| `PATCH /clinical-cases/{caseId}` (Update Case Info) | ❌ **Missing** |
| `PATCH /clinical-cases/{caseId}/items/{txnId}` (Update Case Item) | ❌ **Missing** |
| `POST /clinical-cases/{caseId}/items` (Add Case Item) | ❌ **Missing** |
| `POST /case-pick-products` (Pick Products) | ❌ **Missing** |
| `PATCH /sites/{siteId}` (Update Site) | ❌ **Missing** |
| `PATCH /inventory-transactions/{id}` (Update Txn) | ❌ **Missing** |

**9 out of 39 write endpoints (23%) have no audit trail.**

**Recommendation:** Add `@AuditLog` to all PATCH/PUT/POST/DELETE endpoints.

---

### D-1 · `caseRepo.findAll()` for Uniqueness Check — Full Table Scan

**Severity:** 🟡 HIGH  
**File:** `VmaClinicalCaseService.kt` lines 92, 211  
**Finding:** Two locations load ALL clinical cases into memory just to check `caseNo` uniqueness:

```kotlin
// Line 92: updateCaseInfo()
val all = caseRepo.findAll()
if (all.any { it.caseNo == dto.caseNo && it.caseId != caseId }) {
    throw ConflictException(...)
}

// Line 211: createCase()
if (caseRepo.findAll().any { it.caseNo == dto.caseNo }) {
    throw ConflictException(...)
}
```

**Impact:** As clinical cases grow, this becomes O(n) memory + CPU per request. With 10,000 cases, each create/update loads all cases.

**Recommendation:** Add repository method:
```kotlin
fun findByCaseNo(caseNo: String): VmaClinicalCase?
```

---

### D-2 · `VmaSiteService.update()` Missing `updatedAt` Timestamp

**Severity:** 🟡 MEDIUM  
**File:** `VmaSiteService.kt` line 42-55  
**Finding:** The `update()` method modifies site fields but never sets `site.updatedAt = Instant.now()`.

```kotlin
fun update(siteId: String, dto: UpdateSiteRequest): VmaSite {
    val site = siteRepo.findBySiteId(siteId) ?: throw ...
    dto.siteName?.let { site.siteName = it }
    // ... other fields
    // ❌ MISSING: site.updatedAt = Instant.now()
    return siteRepo.save(site)
}
```

**Impact:** `updatedAt` column stays stale, breaking audit trail accuracy.

---

### D-3 · `condition` Field Uses `Array<Int>` — JPA/Hibernate Risk

**Severity:** 🟡 MEDIUM  
**File:** `VmaEntities.kt` line 331  
**Finding:** `VmaInventoryTransaction.condition` is typed as `Array<Int>` with `@Column(columnDefinition = "integer[]")`. While PostgreSQL supports this, JPA/Hibernate can have issues with:
- Array comparison semantics (`equals`/`hashCode`)
- Lazy loading edge cases
- Portability concerns

```kotlin
@Column(columnDefinition = "integer[]") var condition: Array<Int> = arrayOf(),
```

**Recommendation:** Consider using a `@Convert` with a JSON string, or a dedicated junction table for inspection conditions.

---

### P-1 · `getDemoInventory()` Loads ALL Transactions Twice

**Severity:** 🟡 HIGH  
**File:** `VmaInventoryTransactionService.kt` lines 317-386  
**Finding:** `getDemoInventory()` calls `findAllByDeletedAtIsNullOrderByDateDesc()` **twice**:
1. Line 322: For MOVE_DEMO transactions
2. Line 343: For expired on-shelf detection

Both calls load the **entire** `vma_inventory_transactions` table into memory.

```kotlin
// Line 322 — First full table load
val demoTxns = txnRepo.findAllByDeletedAtIsNullOrderByDateDesc()
    .filter { it.action == VmaInventoryAction.MOVE_DEMO }

// Line 343 — Second full table load (same data!)
val allTxns = txnRepo.findAllByDeletedAtIsNullOrderByDateDesc()
```

**Impact:** 2x memory consumption, 2x database roundtrips. With 100K transactions, this could cause OOM.

**Recommendation:** 
1. Single query, partition in-memory
2. Or add dedicated repository queries: `findAllByActionAndDeletedAtIsNull(action)`

---

### P-2 · `getInventorySummary()` Loads ALL Transactions for a Product Type

**Severity:** 🟡 MEDIUM  
**File:** `VmaInventoryTransactionService.kt` lines 162-231  
**Finding:** Summary endpoint loads all transactions for a product type into memory, then performs two in-memory passes (grouped aggregation + expiry tracking). No pagination, no database-level aggregation.

**Recommendation:** Use native SQL with `GROUP BY` for aggregation, or at minimum, consider caching the result.

---

### P-3 · `getInventoryDetail()` No Pagination, Full In-Memory Processing

**Severity:** 🟡 MEDIUM  
**File:** `VmaInventoryTransactionService.kt` lines 235-313  
**Finding:** Detail endpoint loads all transactions for a specific spec/productType, groups by serialNo in-memory, and returns all serialNo buckets. No pagination support.

---

### P-4 · `getActiveOperators()` Uses `employeeRepo.findAll()` Instead of Filtered Query

**Severity:** 🟡 LOW  
**File:** `VmaInventoryTransactionService.kt` line 52  
**Finding:** Loads ALL employees, then filters active ones in-memory.

```kotlin
fun getActiveOperators(): List<String> {
    val employees = employeeRepo.findAll()  // ← Loads ALL employees
        .filter { it.status == VmaEmployeeStatus.ACTIVE && it.deletedAt == null }
    // ...
}
```

**Recommendation:** Use `VmaEmployeeRepository` method with `findAllByStatusAndDeletedAtIsNull`.

---

### A-1 · Controller Returns `ResponseEntity<Any>` Everywhere

**Severity:** 🟡 MEDIUM  
**Files:** All Controllers  
**Finding:** All controller methods return `ResponseEntity<Any>`, which:
- Loses type safety
- Makes OpenAPI/Swagger documentation useless (no schema generation)
- Frontend developers can't auto-generate TypeScript types

```kotlin
fun findAllPValveProducts(): ResponseEntity<Any> =  // ← Should be ResponseEntity<List<PValveProductResponse>>
```

**Recommendation:** Use typed responses: `ResponseEntity<List<PValveProductResponse>>`, `ResponseEntity<ClinicalCaseDetail>`, etc.

---

### A-2 · Service Methods Return `Map<String, Any?>` Instead of Typed DTOs

**Severity:** 🟡 MEDIUM  
**File:** `VmaClinicalCaseService.kt`  
**Finding:** Multiple service methods return `Map<String, Any?>` instead of typed response DTOs:
- `findAll()` → returns `List<Map<String, Any?>>`
- `findOne()` → returns `Map<String, Any?>`
- `updateCaseInfo()` → returns `Map<String, Any?>`
- `completeCase()` → returns `Map<String, Any>`

```kotlin
fun findAll(): List<Map<String, Any?>> {
    // ...
    return cases.map { c ->
        mapOf("caseId" to c.caseId, "caseNo" to c.caseNo, ...)  // ← Should be ClinicalCaseResponse
    }
}
```

**Impact:** No compile-time type checking on response shapes, easy to introduce typos in map keys, impossible to generate API documentation.

---

### A-3 · `createCase()` Returning PDF Binary OR JSON — Polymorphic Response

**Severity:** 🟡 MEDIUM  
**File:** `VmaClinicalCaseController.kt` lines 58-71  
**Finding:** `POST /clinical-cases` can return either:
- `application/pdf` (if PDF generation succeeds)
- `application/json` with status 201 (if PDF generation fails)

```kotlin
fun createCase(@RequestBody dto: CreateClinicalCaseRequest): ResponseEntity<Any> {
    val result = caseService.createCaseWithPdf(dto)
    return if (result.pdfBytes != null) {
        ResponseEntity.ok().contentType(MediaType.APPLICATION_PDF).body(result.pdfBytes)
    } else {
        ResponseEntity.status(HttpStatus.CREATED).body(result.caseData)
    }
}
```

**Impact:** Frontend must handle two completely different response types from the same endpoint. This is fragile and makes error handling complex.

**Recommendation:** Separate into two endpoints:
1. `POST /clinical-cases` → always returns JSON `ClinicalCaseResponse`
2. `GET /clinical-cases/{caseId}/pdf` → returns PDF (already exists)

---

### L-1 · PDF Template Path Hardcoded via Relative Path

**Severity:** 🟡 MEDIUM  
**Files:** `VmaPackingListPdfService.kt` line 331, `VmaReceivingPdfService.kt` line 44  
**Finding:** PDF template paths are resolved relative to `user.dir`:

```kotlin
// VmaClinicalCaseService.kt
val templatePath = Paths.get(System.getProperty("user.dir"))
    .resolve("../apps/web/src/app/(dashboard)/vma/data/PackingList_UVP.pdf")

// VmaReceivingPdfService.kt
private val templatePath: Path = Paths.get(System.getProperty("user.dir"))
    .resolve("../apps/web/src/app/(dashboard)/vma/data/receiving-inspection.pdf")
```

**Impact:** 
- Breaks if CWD changes (Docker, CI, different deployment paths)
- Template lives inside the **frontend app** directory — wrong separation of concerns
- Will fail in production if frontend is deployed separately

**Recommendation:** Move templates to `mgmt-v3/src/main/resources/templates/vma/` and use classpath resolution.

---

### C-1 · No Electronic Signature or Audit Evidence for FDA Compliance

**Severity:** 🟡 HIGH  
**Scope:** Entire P-VALVE module  
**Finding:** For a medical device management system, the following FDA 21 CFR Part 11 requirements are unmet:
1. **No electronic signatures** on any operations (receiving, case completion, product approval)
2. **No signature manifest** linking action → user → timestamp → hash
3. **Incomplete audit trail**: 9/39 endpoints lack `@AuditLog` (23%)
4. **No data integrity verification** (no checksums on inventory transactions)
5. **No "Meaning of Signature"** attribute (e.g., "I reviewed and approved this receiving inspection")

---

## 🟢 P2/P3 — Minor Issues / Improvements

### Q-1 · `deleteCaseItem()` Uses Hard Delete, Not Soft Delete
**File:** `VmaClinicalCaseService.kt` line 371  
**Finding:** Uses `txnRepo.delete(txn)` (hard delete) while `remove()` in inventory service uses soft delete (`deletedAt`).

### Q-2 · `reverseCompletion()` Hard-Deletes COMPLETION_AUTO Transactions
**File:** `VmaClinicalCaseService.kt` line 474  
**Finding:** Uses `txnRepo.deleteAll(autoTxns)` — hard delete. This means reversal actions leave no trace in the database, violating audit trail requirements.

### Q-3 · Unused `InventorySummaryRow` DTO
**File:** `VmaInventoryDtos.kt` lines 145-154  
**Finding:** `InventorySummaryRow` is defined but never used. `getInventorySummary()` returns `List<Map<String, Any>>`.

### Q-4 · `parsePacificDate()` Doesn't Actually Use Pacific Timezone
**File:** `VmaInventoryTransactionService.kt` lines 35-36  
**Finding:** `pacific` ZoneId is declared but `parsePacificDate()` just does `LocalDate.parse(dateStr)` — ignoring timezone entirely.

```kotlin
private val pacific = ZoneId.of("America/Los_Angeles")  // ← Declared but...
private fun parsePacificDate(dateStr: String): LocalDate =
    LocalDate.parse(dateStr)  // ← Never used!
```

### Q-5 · `VmaDeliverySystemProduct` Has No Dimensional Fields
**File:** `VmaEntities.kt` lines 236-245  
**Finding:** Unlike `VmaPValveProduct` which has diameter/length fields, `VmaDeliverySystemProduct` only has `model` and `specification`. If DS products have physical dimensions, they're untracked.

### Q-6 · `PValveTabSelector` Missing `delivery-system` Tab
**File:** `PValveTabSelector.tsx` line 12-14  
**Finding:** The tab selector lists 7 tabs but does NOT include `delivery-system` as a separate tab. However, a `delivery-system/page.tsx` exists. Users may not be able to navigate to it via tabs.

```typescript
type PValveTab = 'inventory' | 'clinicalCase' | 'overview' | 'demoInventory' | 
                 'fridgeShelf' | 'productManagement' | 'siteManagement';
// ❌ Missing: 'deliverySystem'
```

### Q-7 · `VmaPValveProduct` Soft Delete via `isActive=false` vs `deletedAt`
**File:** `VmaPValveProductService.kt` line 87  
**Finding:** Product "deletion" sets `isActive = false` but never sets a `deletedAt` timestamp. Meanwhile, inventory transactions use `deletedAt`. Inconsistent soft-delete patterns.

### Q-8 · Missing `@Transactional(readOnly = true)` on Read Operations
**Files:** All Service files  
**Finding:** All services are annotated with `@Transactional` at class level, meaning read-only queries also open read-write transactions. This adds unnecessary overhead.

---

## 📋 Audit Log Coverage Matrix

| Controller | Endpoint | Method | `@AuditLog` | Status |
|-----------|----------|--------|------------|--------|
| **PValveProduct** | GET `/pvalve-products` | GET | — | ✅ N/A |
| | POST `/pvalve-products` | POST | `CREATE_PVALVE_PRODUCT` | ✅ |
| | PATCH `/pvalve-products/{id}` | PATCH | ❌ **MISSING** | 🔴 |
| | DELETE `/pvalve-products/{id}` | DELETE | `DELETE_PVALVE_PRODUCT` (HIGH) | ✅ |
| | GET `/delivery-system-products` | GET | — | ✅ N/A |
| | POST `/delivery-system-products` | POST | `CREATE_DS_PRODUCT` | ✅ |
| | PATCH `/delivery-system-products/{id}` | PATCH | ❌ **MISSING** | 🔴 |
| | DELETE `/delivery-system-products/{id}` | DELETE | `DELETE_DS_PRODUCT` (HIGH) | ✅ |
| | GET `/fit-matrix` | GET | — | ✅ N/A |
| | PATCH `/fit-relationship` | PATCH | ❌ **MISSING** | 🔴 |
| **ClinicalCase** | GET `/clinical-cases` | GET | — | ✅ N/A |
| | GET `/clinical-cases/{id}` | GET | — | ✅ N/A |
| | POST `/clinical-cases` | POST | `CREATE_CLINICAL_CASE` | ✅ |
| | PATCH `/clinical-cases/{id}` | PATCH | ❌ **MISSING** | 🔴 |
| | PATCH `.../items/{txnId}` | PATCH | ❌ **MISSING** | 🔴 |
| | DELETE `.../items/{txnId}` | DELETE | `DELETE_CASE_ITEM` (HIGH) | ✅ |
| | POST `.../items` | POST | ❌ **MISSING** | 🔴 |
| | POST `/case-pick-products` | POST | ❌ **MISSING** | 🔴 |
| | POST `/case-available-products` | POST | — | ✅ N/A (query) |
| | GET `/case-compatible-ds` | GET | — | ✅ N/A |
| | POST `.../complete` | POST | `COMPLETE_CLINICAL_CASE` | ✅ |
| | POST `.../reverse` | POST | `REVERSE_CLINICAL_CASE` (HIGH) | ✅ |
| | GET `.../pdf` | GET | — | ✅ N/A |
| **Inventory** | GET `/inventory-transactions` | GET | — | ✅ N/A |
| | GET `/inventory-transactions/{id}` | GET | — | ✅ N/A |
| | POST `/inventory-transactions` | POST | `CREATE_INVENTORY_TRANSACTION` | ✅ |
| | PATCH `/inventory-transactions/{id}` | PATCH | ❌ **MISSING** | 🔴 |
| | DELETE `/inventory-transactions/{id}` | DELETE | `DELETE_INVENTORY_TRANSACTION` (HIGH) | ✅ |
| | GET `...spec-options` | GET | — | ✅ N/A |
| | GET `...summary` | GET | — | ✅ N/A |
| | GET `...detail` | GET | — | ✅ N/A |
| | GET `...demo` | GET | — | ✅ N/A |
| | GET `...operators` | GET | — | ✅ N/A |
| | POST `...receive-from-china` | POST | `RECEIVE_FROM_CHINA` | ✅ |
| | GET `...receive-pdf/{id}` | GET | — | ✅ N/A |
| **Site** | GET `/sites` | GET | — | ✅ N/A |
| | POST `/sites` | POST | `CREATE_SITE` | ✅ |
| | PATCH `/sites/{siteId}` | PATCH | ❌ **MISSING** | 🔴 |

**Result: 9 write endpoints lacking audit logs (23% gap)**

---

## 📋 Prioritized Action Plan

### 🔴 Sprint 1 (Immediate — 1-2 days)
| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 1 | **S-2**: Add `@Valid` + Jakarta annotations to ALL DTOs | 4h | 🔴 Security |
| 2 | **S-3**: Add `@AuditLog` to 9 missing write endpoints | 1h | 🔴 Compliance |
| 3 | **D-1**: Replace `caseRepo.findAll()` with `findByCaseNo()` | 30m | 🟡 Performance |
| 4 | **D-2**: Add `updatedAt` to `VmaSiteService.update()` | 10m | 🟡 Data Integrity |
| 5 | **Q-4**: Fix `parsePacificDate()` to use Pacific timezone | 15m | 🟡 Data Integrity |

### 🟡 Sprint 2 (This week — 3-5 days)
| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 6 | **S-1**: Implement domain-specific permissions | 8h | 🔴 Security |
| 7 | **A-1+A-2**: Replace `ResponseEntity<Any>` and `Map<String, Any?>` with typed DTOs | 4h | 🟡 Quality |
| 8 | **P-1**: Fix double-load in `getDemoInventory()` | 2h | 🟡 Performance |
| 9 | **Q-1+Q-2**: Unify soft-delete pattern (replace hard deletes with `deletedAt`) | 2h | 🟡 Compliance |
| 10 | **Q-8**: Add `@Transactional(readOnly = true)` to read operations | 1h | 🟢 Performance |

### 🟢 Sprint 3 (Next 2 weeks)
| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 11 | **T-1**: Create P-VALVE integration test suite | 16h | 🔴 Quality |
| 12 | **F-1**: Refactor monolithic frontend files | 24h | 🔴 Maintainability |
| 13 | **F-2**: Implement TanStack Query | 16h | 🔴 Frontend Quality |
| 14 | **A-3**: Separate case creation from PDF generation | 2h | 🟡 API Design |
| 15 | **L-1**: Move PDF templates to classpath resources | 2h | 🟡 DevOps |

### 🔵 Backlog
| # | Issue | Effort | Impact |
|---|-------|--------|--------|
| 16 | **C-1**: FDA 21 CFR Part 11 compliance framework | 40h+ | 🔴 Compliance |
| 17 | **P-2+P-3**: Database-level aggregation for summary/detail | 8h | 🟡 Performance |
| 18 | **D-3**: Migrate `condition` from `Array<Int>` to safer pattern | 4h | 🟡 Maintainability |
| 19 | **Q-6**: Add delivery-system tab to PValveTabSelector | 30m | 🟢 UX |
| 20 | **Q-7**: Unify soft-delete pattern (isActive vs deletedAt) | 2h | 🟡 Consistency |

---

## ✅ What's Working Well

1. **Clean Controller-Service Separation** — All controllers delegate to services, no direct repository access from controllers.
2. **Append-Only Ledger Pattern** — Inventory uses an append-only transaction ledger, which is the correct pattern for audit-sensitive inventory systems.
3. **DTO Pattern Adopted** — Dedicated request/response DTOs exist for all operations (just missing validation annotations).
4. **PDF Generation** — V2 parity achieved, template-based AcroForm filling is correct.
5. **Soft Delete** — Properly implemented for inventory transactions with `deletedAt` filtering.
6. **Fit Matrix Design** — Junction table (`VmaDeliverySystemFit`) correctly models many-to-many relationship.
7. **i18n Coverage** — 3-language support (en/zh/vi) exists for P-VALVE tab labels.
8. **Consistent API Naming** — RESTful naming conventions followed throughout.
9. **Exception Handling** — Uses custom `NotFoundException`, `ConflictException` for clear error responses.
10. **PValveTabSelector** — Apple-style animated tab with smooth transitions, well-implemented.

---

## 📝 Conclusion

The P-VALVE backend (V3 Kotlin/Spring Boot) is well-architected at the structural level — clean separation of concerns, proper entity/repository/service/controller layering, and correct use of the append-only ledger pattern. However, it has **critical security gaps** (zero input validation, single permission for all 39 endpoints) and **zero P-VALVE-specific test coverage**.

The frontend remains in a **legacy monolithic state** — single-file pages up to 49KB, no React Query, and raw `fetch` calls everywhere. This is the largest area of technical debt.

**Composite Score: 6.1/10** — The module is functional but carries significant security, testing, and maintenance risk. Sprint 1 items (validation + audit logs) should be addressed before any new feature development.

---

*Report generated: 2026-02-16T00:52:00-08:00 PST*  
*Next audit due: After Sprint 2 completion*
