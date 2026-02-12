# Phase 4 Audit Report — VMA Module (Employees + Training + Inventory + Clinical + Sites)

> **Phase:** 4
> **Date:** 2026-02-12
> **Files Reviewed:** 39 vma/ files
> **Total Lines Audited:** ~5,800 lines

---

## 审计总结

| 服务 | 行数 | 评级 |
|------|:----:|:----:|
| EmployeesService | 614 | ✅ 好 |
| SmartFillService | 801 | 🟡 2 个问题 |
| TrainingRecordService | 701 | 🟡 1 个问题 |
| TrainingSopService | 213 | ✅ 干净 |
| InventoryTransactionService | 505 | ✅ 已优化 (P-2/P-4) |
| ClinicalCaseService | 514 | 🟡 1 个问题 |
| PValveProductService | 289 | ✅ 好 |
| PdfGeneratorService | 339 | ✅ 好 |
| SiteService | 34 | ✅ 简洁 |

---

## 发现问题

### VMA-1 🔴 SmartFill writeToDB() 极端 N+1

```typescript
// smart-fill.service.ts:707-763
private async writeToDB(plans: TrainingSessionPlan[]): Promise<string[]> {
  for (const plan of plans) {
    const session = await this.prisma.vmaTrainingSession.create({ ... });
    for (const emp of plan.employees) {
      for (const sop of plan.sops) {
        await this.prisma.vmaTrainingRecord.upsert({ ... });
      }
    }
  }
}
```

假设 10 个 session × 5 员工 × 8 SOP = **400 次 upsert** 逐条执行。

**V3:** 使用单事务 + createMany + ON CONFLICT:
```kotlin
@Transactional
fun writeToDB(plans: List<Plan>) {
  val sessions = sessionRepository.saveAll(plans.map { it.toSession() })
  val records = plans.flatMap { plan -> 
    plan.employees.flatMap { emp ->
      plan.sops.map { sop -> TrainingRecord(emp, sop, plan) }
    }
  }
  recordRepository.saveAll(records) // JPA batch insert
}
```

---

### VMA-2 🟡 computeAllMissing() 加载全表

```typescript
// smart-fill.service.ts:197
const allRecords = await this.prisma.vmaTrainingRecord.findMany();
```

**全量加载** vmaTrainingRecord 表到内存。如果有 10K 培训记录, 全部加载。

**V3:** 只查询 ACTIVE 员工的记录:
```sql
SELECT employee_no, sop_no, sop_version
FROM vma_training_records
WHERE employee_no IN (SELECT employee_no FROM vma_employees WHERE status = 'ACTIVE')
```

---

### VMA-3 🟡 TrainingRoadmap 逻辑复杂度 O(E × S × V)

`getTrainingRoadmap()` (700 行) 包含三重嵌套循环:
- E = 员工数, S = SOP 数, V = 版本数

对于中型团队 (50 员工 × 20 SOP × 3 版本), 内循环执行 3000 次。
目前可接受, 但需要监控增长。

**V3:** 预计算快照表 + 增量更新, 避免每次实时计算。

---

### VMA-4 🟡 ClinicalCaseService 无事务保护

```typescript
// clinical-case.service.ts:251-308  createCase()
// 先查可用库存, 再创建 case + 多条 OUT_CASE 交易
// 没有 $transaction 包裹
```

并发创建 case 可能导致同一产品被重复分配 (race condition)。

**V3:** 使用 `@Transactional(isolation = SERIALIZABLE)` 或 SELECT FOR UPDATE:
```sql
SELECT * FROM vma_inventory_transactions 
WHERE serial_no = :sn AND deleted_at IS NULL
FOR UPDATE
```

---

## 保留的优秀设计 ✅

| 设计 | 文件 | 评价 |
|------|------|------|
| **Go-Live 日期锚定** | smart-fill.service.ts:10 | 培训体系统一起点 — **标准化** |
| **渐进式培训判定** | smart-fill.service.ts:258-282 | 基线 → 更新 → trainingRequired 分层 — **精确** |
| **贪心 SOP 分组** | smart-fill.service.ts:477-615 | 最大公共 SOP 集 → 最少 session — **算法优秀** |
| **时间槽级联** | smart-fill.service.ts:659-702 | 溢出自动移到下一工作日 — **健壮** |
| **安全上限 (500 plans)** | smart-fill.service.ts:489 | 防止无限循环 — **防御性编程** |
| **栈式编辑规则** | employees.service.ts:343-358 | 只允许修改最近一条 — **数据完整性** |
| **SOP 历史栈式规则** | employees.service.ts:596-612 | 只允许修改最近日期分组 — **一致** |
| **DB-level groupBy (P-2 fix)** | inventory-transaction.service.ts:187-211 | 避免全表加载 — **性能好** |
| **Raw SQL 过期库存 (P-4 fix)** | inventory-transaction.service.ts:438-479 | CASE WHEN + HAVING — **正确** |
| **PDF AcroForm 填充** | pdf-generator.service.ts | pdf-lib 模板填充 + 分页 — **完善** |
| **FEFO 拣货算法** | clinical-case.service.ts:158-189 | 近效期优先 → 可用 — **合规** |
| **Case 完成/撤回双向** | clinical-case.service.ts:380-512 | complete + reverse — **灵活** |
| **产品适配矩阵** | pvalve-product.service.ts:220-287 | fit 关系 CRUD — **清晰** |
| **Pacific Time 归一化** | vma-shared.util.ts | parsePacificDate — **时区安全** |

---

## V3 迁移映射

| V2 NestJS | V3 Spring Boot | 关键变化 |
|-----------|---------------|----------|
| SmartFillService (801行) | SmartFillUseCase | 事务 + batch insert |
| EmployeesService (614行) | EmployeeUseCase | 保留栈式规则 |
| TrainingRecordService (701行) | TrainingUseCase | Roadmap 预计算 |
| TrainingSopService (213行) | SopUseCase | 保持不变 |
| InventoryTransactionService (505行) | InventoryUseCase | 保留 groupBy 优化 |
| ClinicalCaseService (514行) | ClinicalCaseUseCase | 加事务 + FOR UPDATE |
| PValveProductService (289行) | PValveProductUseCase | 保持不变 |
| PdfGeneratorService (339行) | PdfService | iText 或保留 pdf-lib |
| SiteService (34行) | SiteUseCase | 保持不变 |

---

## Phase 4 GATE 状态

| 门禁项 | 状态 |
|--------|:----:|
| 审计报告完成 | ✅ |
| VMA-1 到 VMA-4 已记录 | ✅ |
| 优秀设计已标记保留 | ✅ |
| V3 迁移映射已建立 | ✅ |
| 阻塞性问题 | **1** (VMA-1 N+1 写入) |

**Phase 4 审计: PASS ✅**
