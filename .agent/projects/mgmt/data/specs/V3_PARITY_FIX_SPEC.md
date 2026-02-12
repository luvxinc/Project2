# 📋 需求文档: V3 功能一致性修复

生成时间: 2026-02-12 03:37
用户原始需求: "让CTO指导执行, 注意我们只考虑V3的适配 V2不再适配无所谓 总之就是保持完全一致 可以修改效率 算法 等等 但是结果必须一致"

---

## 1. PM 理解 (工程语言)

基于已完成的 API 迁移审计 (VMA_API_MIGRATION_AUDIT.md)，修复 V3 中 5 个与 V2 行为不一致的 Finding。
**原则:** 只改 V3。可以用更好的算法/架构，但 API 行为（路由、结果、副作用）必须与 V2 完全一致。

---

## 2. 需求分类
- 类型: [x] 后端 (全部 V3 Kotlin/Spring Boot)
- 优先级: [x] 高
- 复杂度预估: [x] L (涉及 ~15 个文件, 跨多个模块)

---

## 3. 验收标准

| # | 标准 | 如何验证 |
|---|------|----------|
| AC-1 | V3 所有 CUD 操作写 business/audit 日志 | 创建/更新/删除任何实体后查询 logs 表 |
| AC-2 | V3 权限检查与 V2 完全一致 | 无权限用户调用 VMA API 返回 403 |
| AC-3 | V3 login 限流 5/60s, verify-security 限流 3/300s | 连续 6 次 login 第 6 次返回 429 |
| AC-4 | V3 receiving PDF re-download 返回**单产品** PDF (V2 一致) | 点击单行下载 PDF 只有 1 页 |
| AC-5 | V3 logs export 使用 query param `?logType=X` | 前端已适配，构建不报错 |
| AC-6 | V3 logs God Mode 路由与前端一致 | `/logs/godmode/status`, `/godmode/unlock`, `/godmode/lock` |
| AC-7 | V3 logs error-trend 路由与前端一致 | `GET /logs/error-trend` |
| AC-8 | V3 logs `export` 包含 V2 的 God Mode 检查 + 审计日志写入 | 导出日志时写审计记录 |

---

## 4. 已知约束

- V2 不再修改，只改 V3
- 前端已适配到 V3 路由格式（已确认）
- 实现上可以用 Spring AOP 替代 V2 的手动 LogWriter 调用

---

## 5. 待确认项 — 无 (全部明确)

---

## 6. 风险评估

| 风险 | 影响 | 缓解 |
|------|------|------|
| AOP 日志拦截器可能遗漏某些操作 | 中等 | 明确注解标记哪些操作需要日志 |
| Rate limiter 可能影响现有测试 | 低 | 测试环境关闭限流 |
| PDF 服务改回单产品模式可能引入 regression | 中等 | 对照 V2 `fillOnePdf` 逻辑校验 |

---

## 7. 详细 Finding 分析

### F2: 缺审计日志 🔴

**V2 行为:** 每个 CUD 操作通过 `LogWriterService.logBusiness()` 和 `logAudit()` 写入日志。
**V3 现状:** 控制器没有日志写入调用。
**修复方案:** 创建 Spring AOP `@AuditLog` 注解 + 拦截器，自动在 CUD 操作完成后写入 business/audit log。

### F3: 缺细粒度权限 🔴

**V2 行为:** 每个端点使用 `@Permissions('vma.employees.manage')` 等注解检查权限。

V2 权限映射表:
- `employees.controller.ts` → 全部: `vma.employees.manage`
- `training-sop.controller.ts` → 全部: `vma.training_sop.manage`
- `training-record.controller.ts` → 全部: `vma.training.manage`
- `clinical-case.controller.ts` → 全部: `vma.employees.manage` (same as employees)
- `inventory-transaction.controller.ts` → 全部: `vma.employees.manage`
- `pvalve-product.controller.ts` → 全部: `vma.employees.manage`
- `site.controller.ts` → 全部: `vma.employees.manage`
- `products.controller.ts` → `products.catalog.view`, `products.catalog.create`, `products.catalog.update`, `products.catalog.delete`, `products.barcode.generate`

**V3 现状:** `SecurityConfig.kt` 只设置 `anyRequest().authenticated()`
**修复方案:** 
1. 创建 `@RequirePermission("vma.employees.manage")` 自定义注解
2. 创建 `PermissionCheckAspect` AOP 拦截器
3. 从 JWT token 中提取 permissions → 检查是否有目标权限

### F4: 缺登录限流 🟡

**V2 行为:** `@Throttle({ default: { limit: 5, ttl: 60000 } })` on login, `@Throttle({ default: { limit: 3, ttl: 300000 } })` on verify-security
**V3 现状:** 无限流
**修复方案:** Redis-based rate limiter 拦截器 (比 V2 的内存 throttle 更好)

### F5: Receiving PDF 行为差异 ⚠️ (重点)

**V2 行为 (精确):**
```
GET /vma/inventory-receive-pdf/:txnId
1. findOneWithBatch(txnId) → 获取单条事务 + 关联 batch
2. 从 batch 重构 sharedDto (batchNo, poNo, dates, operator)
3. 从 txn 构建 single product line (productType, specNo, serialNo, qty, inspection, expDate)
4. fillOnePdf(sharedDto, line) → 生成只有 1 页的 PDF
5. 返回文件名: receiving_inspection_{specNo}_{serialNo}_{date}.pdf
```

**V3 行为 (当前):**
```
GET /vma/inventory-transactions/receive-pdf/{id}
1. findOne(id) → 获取单条事务
2. findBatchByBatchNo(batchNo) → 获取 batch
3. findAllByBatchNo(batchNo) → 获取同 batch **所有**事务 (siblings)
4. generateReceivingPdf(batch, siblings) → 生成含**所有产品**的多页 PDF
5. 返回文件名: receiving_inspection_{batchNo}.pdf
```

**差异:** V2 只下载该产品的 1 页 PDF，V3 下载整批的多页 PDF
**修复:**
1. V3 `getReceivePdf()` 只用该单条事务调用 `fillOnePdf(batch, txn)`
2. 文件名改为 `receiving_inspection_{specNo}_{serialNo}_{date}.pdf`
3. `fillOnePdf()` 已经存在于 `VmaReceivingPdfService.kt`

### F8: Logs 模块路由差异 ⚠️

**对照前端 (`apps/web/src/lib/api/logs.ts`) vs V3 (`LogController.kt`):**

| 前端调用路由 | V2 路由 | V3 当前路由 | 是否匹配前端 |
|-------------|---------|------------|-------------|
| `/logs/godmode/status` | `/logs/mode/status` | `/logs/godmode/status` | ✅ V3=前端 |
| `/logs/godmode/unlock` | `/logs/mode/god/unlock` | `/logs/godmode/unlock` | ✅ V3=前端 |
| `/logs/godmode/lock` | `/logs/mode/god/lock` | `/logs/godmode/lock` | ✅ V3=前端 |
| `/logs/export?logType=X` | `/logs/export/:logType` | `/logs/export?logType=X` | ✅ V3=前端 |
| `/logs/archive` (POST) | `/logs/archive/execute` (POST) | `/logs/archive` (POST) | ✅ V3=前端 |
| `/logs/errors` | `/logs/errors` | `/logs/errors` | ✅ |
| `/logs/audits` | `/logs/audits` | `/logs/audits` | ✅ |

**结论:** F8 路由方面 V3 已经和前端对齐，**但 V3 缺少 V2 的功能行为:**
1. ❌ God Mode 解锁不验证 L3 安全码 (V2 验证)
2. ❌ God Mode 操作不写审计日志 (V2 写)
3. ❌ Log 查询不检查 God Mode 脱敏 (V2 有)
4. ❌ Export 操作不写审计日志 (V2 写)
5. ❌ Maintenance 操作不检查 superadmin (V2 检查)
6. ❌ Archive 操作不检查 superadmin + L4 (V2 检查)

---