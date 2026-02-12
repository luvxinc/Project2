# VMA PDF 全链路审计报告

> **审计日期**: 2026-02-12  
> **审计范围**: VMA 板块所有 PDF 下载功能  
> **审计标准**: V2 (NestJS + pdf-lib) 模版填充方式 — 必须 100% 对齐  
> **审计团队**: CTO 带领工程团队

---

## 📋 模版文件清单

| # | 模版文件 | 位置 | 用途 |
|---|---------|------|------|
| T1 | `PackingList_UVP.pdf` | `apps/web/.../vma/data/` | Clinical Case Packing List |
| T2 | `receiving-inspection.pdf` | `apps/web/.../vma/data/` | Receiving Inspection Report |
| T3 | `vma-training.pdf` | `apps/web/.../vma/data/` | Employee Training Record |

---

## 📊 PDF 功能清单 (V2 → V3 逐条对比)

### 功能 #1: Clinical Case — 创建时生成 Packing List PDF (批量合并)

| 项目 | V2 (NestJS) | V3 (Kotlin) | 状态 |
|------|-------------|-------------|------|
| **端点** | `POST /vma/clinical-cases` | `POST /vma/clinical-cases` | ✅ |
| **V2 文件** | `clinical-case.controller.ts` L102-178 | `VmaClinicalCaseController.kt` L54-65 | ✅ |
| **V2 Service** | `PackingListPdfService.generate()` | `VmaPackingListPdfService.generate()` | ✅ |
| **模版** | `PackingList_UVP.pdf` AcroForm | `PackingList_UVP.pdf` AcroForm | ✅ 模版填充 |
| **类型** | 单页模版 (28 rows across 2 pages) | 同上 | ✅ |
| **字段映射** | SiteName, SiteAddress1/2, SiteState, SiteCountry, Reference, emailDate, Items/Device Name/Model and Specification/Serial NumberLot Number/Expiry Date + Row1-Row14, Row1_2-Row14_2 | 完全一致 | ✅ |
| **AP 删除** | ✅ `widget.dict.delete(PDFName.of('AP'))` | ✅ `widget.pdfObject.remove(PdfName.AP)` | ✅ |
| **NeedAppearances** | ✅ `PDFBool.True` | ✅ `PdfBoolean(true)` | ✅ |
| **Read-only** | ✅ `field.enableReadOnly()` | ✅ `f.setReadOnly(true)` | ✅ |

### 功能 #2: Clinical Case — 下载已有 Packing List PDF

| 项目 | V2 (NestJS) | V3 (Kotlin) | 状态 |
|------|-------------|-------------|------|
| **端点** | `GET /vma/clinical-cases/:caseId/pdf` | `GET /vma/clinical-cases/{caseId}/pdf` | ✅ |
| **V2 文件** | `clinical-case.controller.ts` L298-350 | `VmaClinicalCaseController.kt` L120-127 | ✅ |
| **实现** | 同功能 #1, 重新生成 | 同功能 #1, 调用 `generatePackingListPdf()` | ✅ |
| **模版** | ✅ AcroForm 填充 | ✅ AcroForm 填充 | ✅ |

### 功能 #3: Receiving Inspection — 批量收货后生成 PDF (多产品合并)

| 项目 | V2 (NestJS) | V3 (Kotlin) | 状态 |
|------|-------------|-------------|------|
| **端点** | `POST /vma/inventory-receive` | `POST /vma/inventory-transactions/receive-from-china` | ✅ (路径不同但功能同) |
| **V2 文件** | `inventory-transaction.controller.ts` L174-263 | `VmaInventoryController.kt` L89-124 | ✅ |
| **V2 Service** | `ReceivingInspectionPdfService.generateReceivingPdf()` | `VmaReceivingPdfService.generateReceivingPdf()` | ✅ |
| **模版** | `receiving-inspection.pdf` AcroForm | `receiving-inspection.pdf` AcroForm | ✅ 模版填充 |
| **类型** | 每个产品线 → 1页模版 → 合并 | 每个产品线 → 1页模版 → 合并 | ✅ |
| **文本字段** | ManufacturerVendor, PO No, Manufacturer Lot, Product Identification, Date Shipped, DateTime Received, Quantity Received, Received By, undefined_19 (Comments), Inspection By, Date Inspected | 完全一致 | ✅ |
| **复选框** | 9 × PASS/FAIL (undefined ~ undefined_18) + Accept (undefined_20) / Reject (undefined_21) | 完全一致 | ✅ |
| **Flatten** | ✅ `form.flatten()` | ✅ `form.flattenFields()` | ✅ |

**🔴 审计发现**: 此功能在审计前是**严重违规** — V3 使用 programmatic iText 画表格, 完全没有使用模版。**已修复**。

### 功能 #4: Receiving Inspection — 单产品 PDF 重新下载

| 项目 | V2 (NestJS) | V3 (Kotlin) | 状态 |
|------|-------------|-------------|------|
| **端点** | `GET /vma/inventory-receive-pdf/:txnId` | `GET /vma/inventory-transactions/receive-pdf/{id}` | ⚠️ 路径不同 |
| **V2 行为** | **单产品**: `fillOnePdf(shared, line)` → 1 页 | **整 batch**: `generateReceivingPdf(batch, siblings)` → 多页 | ⚠️ 行为差异 |
| **V2 文件** | `inventory-transaction.controller.ts` L265-314 | `VmaInventoryController.kt` L126-147 | ⚠️ |
| **模版** | ✅ AcroForm 填充 | ✅ AcroForm 填充 | ✅ |

**⚠️ 审计发现**: V3 的 re-download 返回整个 batch 的合并 PDF (所有同 batch 产品), 而 V2 只返回请求的那一个产品。模版填充方式正确, 但行为范围不同。

### 功能 #5: Training Record — SmartFill 后生成 PDF (批量合并)

| 项目 | V2 (NestJS) | V3 (Kotlin) | 状态 |
|------|-------------|-------------|------|
| **端点** | `POST /vma/training-records/smart-fill` | `POST /vma/training-records/smart-fill` | ✅ |
| **V2 文件** | `smart-fill.service.ts` | `VmaSmartFillService.kt` | ✅ |
| **V2 PDF Service** | `PdfGeneratorService.generateSessionPdf()` / `generateAllSessionsPdf()` | `VmaPdfGeneratorService.generateSessionPdf()` / `generateAllSessionsPdf()` | ✅ |
| **模版** | `vma-training.pdf` AcroForm | `vma-training.pdf` AcroForm | ✅ 模版填充 |
| **类型** | 每 session → 模版填充 + SOP 列表页 → 合并 | 同上 | ✅ |
| **AcroForm 字段** | DocNum, Training Subjects, Training Objectives, Place of Training, Record Date, Duration, Check Box2/4, Others, Lecturer, Employee NoRow1-17/_2, Dropdown2-18, Num of Attend/Pass | 完全一致 | ✅ |
| **SOP 列表页** | ✅ `generateListPdf()` programmatic (这是正确的 — SOP 列表没有模版) | ✅ `generateListPdf()` programmatic | ✅ |
| **合并** | ✅ `mergePdfs()` | ✅ `mergePdfs()` | ✅ |

### 功能 #6: Training Record — 下载 PDF

| 项目 | V2 (NestJS) | V3 (Kotlin) | 状态 |
|------|-------------|-------------|------|
| **端点** | `GET /vma/training-records/download/:filename` | `GET /vma/training-records/download/{filename}` | ✅ |
| **V2 文件** | `training-record.controller.ts` | `VmaTrainingController.kt` L152-170 | ✅ |
| **实现** | 从 `generated-pdfs/` 目录读取已存文件 | 从 `generated-pdfs/` 目录读取已存文件 | ✅ |
| **安全** | 路径遍历防护 | ✅ `filepath.startsWith(outputDir)` | ✅ |

---

## 🔍 冗余代码发现

| 文件 | 状态 | 说明 |
|------|------|------|
| `VmaReceivingInspectionPdfService.kt` | 🟡 **孤立** | 正确的模版填充实现, 但**没有被任何 Controller/Service 注入**。与 `VmaReceivingPdfService.kt` 功能重复。建议删除。 |

---

## ✅ 审计结论

### 所有 6 个 PDF 功能的模版填充状态:

| # | 功能 | 模版 | 填充方式 | 状态 |
|---|------|------|---------|------|
| 1 | Clinical Case 创建 PDF | `PackingList_UVP.pdf` | AcroForm 填充 | ✅ 合规 |
| 2 | Clinical Case 下载 PDF | `PackingList_UVP.pdf` | AcroForm 填充 | ✅ 合规 |
| 3 | Receiving 批量 PDF | `receiving-inspection.pdf` | AcroForm 填充 (已修复) | ✅ 合规 |
| 4 | Receiving 单产品 PDF | `receiving-inspection.pdf` | AcroForm 填充 (已修复) | ✅ 合规 (⚠️ 行为差异: 返回整 batch) |
| 5 | Training SmartFill PDF | `vma-training.pdf` | AcroForm 填充 + SOP 列表 | ✅ 合规 |
| 6 | Training 下载 PDF | 已生成文件 | 文件系统读取 | ✅ 合规 |

### 关键修复记录:

1. **🔴 VmaReceivingPdfService.kt — 完全重写** (原: programmatic iText 画表格 → 现: `receiving-inspection.pdf` AcroForm 模版填充)
2. **🟡 冗余文件**: `VmaReceivingInspectionPdfService.kt` 未被使用, 建议删除
3. **前端鉴权统一**: 所有 PDF 下载请求已统一使用 `getAuthHeaders()`
4. **Clinical Case PDF 端点**: `GET /clinical-cases/{caseId}/pdf` 已添加

### 最终合规率: **6/6 = 100%** (全部使用模版填充)
