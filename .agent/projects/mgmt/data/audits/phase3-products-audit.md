# Phase 3 Audit Report — Products Module

> **Phase:** 3
> **Date:** 2026-02-12
> **Files Reviewed:** 7 products/ files
> **Total Lines Audited:** ~1,100 lines

---

## 审计总结

| 服务 | 行数 | 评级 |
|------|:----:|:----:|
| ProductsService | 376 | 🟡 2 个问题 |
| BarcodeService | 254 | ✅ 好 |
| ProductsController | 410 | 🟡 1 个问题 |

---

## 发现问题

### PROD-1 🟡 batchCreate() 顺序 N+1 创建

```typescript
// products.service.ts:208-235
async batchCreate(dto: BatchCreateProductDto) {
  for (const item of dto.products) {
    await this.create(item);  // 每个 SKU 独立 2 条 SQL (SELECT + INSERT)
  }
}
```

30 个 SKU = 60 条 SQL 顺序执行。

**V3:** 使用 `createMany` 或 `INSERT ... ON CONFLICT DO NOTHING`:
```kotlin
productRepository.saveAll(products) // JPA batch insert
```

---

### PROD-2 🟡 batchUpdateCogs() 事务内逐个更新 + Cache 清除

```typescript
// products.service.ts:270-292
await this.prisma.$transaction(async (tx) => {
  for (const item of dto.items) {
    await tx.product.update({ ... });      // SQL per item
    await this.cacheService.del(`sku:...`); // Redis per item
  }
});
```

事务内混合了 DB 操作和外部 Redis 调用。如果 Redis 超时, 事务回滚但缓存已删除。

**V3:**
1. DB 批量更新用 `UPDATE ... FROM VALUES` 单条 SQL
2. 缓存清除在事务成功后统一执行

---

### PROD-3 🟡 extractClientIp() 再次重复 (INFRA-1)

```typescript
// products.controller.ts:63-76
private extractClientIp(req: AuthenticatedRequest): string { ... }
```

第 5 处 `getClientIP()` 重复。V3 统一使用 `IpUtils.extractClientIp()`。

---

## 保留的优秀设计 ✅

| 设计 | 文件 | 评价 |
|------|------|------|
| **SKU 缓存 (1h TTL)** | products.service.ts:146 | Redis-first, DB-fallback — **标准** |
| **分类缓存 (15min TTL)** | products.service.ts:330-354 | 避免重复 DISTINCT — **好** |
| **SKU 大写归一化** | products.service.ts:176 | 一致性保证 — **必要** |
| **软删除** | products.service.ts:310-325 | deletedAt + INACTIVE — **安全** |
| **条形码 PDF 生成** | barcode.service.ts | bwip-js + pdfkit, 多格式支持 — **功能完善** |
| **安全分级控制** | products.controller.ts | 读=无, 创建/更新=L2, 删除=L3 — **合理** |
| **操作日志记录** | products.controller.ts | 每个写操作都有 Business/Audit Log — **全覆盖** |
| **Decimal → Number 转换** | products.service.ts:109-111 | 防止 Prisma Decimal 序列化问题 — **细致** |

---

## V3 迁移映射

| V2 NestJS | V3 Spring Boot | 关键变化 |
|-----------|---------------|----------|
| ProductsService (376行) | ProductUseCase | 批量操作 SQL 优化 |
| BarcodeService (254行) | BarcodeService | 保留 bwip-js 或换 ZXing |
| ProductsController (410行) | ProductController | @SecurityLevel 注解 |

---

## Phase 3 GATE 状态

| 门禁项 | 状态 |
|--------|:----:|
| 审计报告完成 | ✅ |
| PROD-1 到 PROD-3 已记录 | ✅ |
| 优秀设计已标记保留 | ✅ |
| 阻塞性问题 | **0** |

**Phase 3 审计: PASS ✅** → 进入 Phase 4
