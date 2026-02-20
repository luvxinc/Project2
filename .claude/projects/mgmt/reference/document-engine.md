---
description: 文档与报表生成引擎 — PDF/Excel/条码/邮件模板, 异步生成 + MinIO 存储
---

# 文档与报表生成引擎 (Document Engine)

> **核心原则**: 所有文档异步生成, 存储在 MinIO, 通过下载链接交付。
> **权威规范**: `core/skills/backend.md`

---

## 1. 能力矩阵

| 文档类型 | 技术 | 用途 |
|----------|------|------|
| **PDF 报表** | JasperReports (企业级) | 采购单, 发票, 月度报表, 审计报告 |
| **PDF 证书** | Apache PDFBox + iText | VMA 培训证书, SOP 文档 |
| **Excel 导出** | Apache POI | 数据导出, 批量报表, 财务报告 |
| **条码/标签** | ZXing + PDFBox | 产品条码, 库存标签 |
| **邮件模板** | Thymeleaf | HTML 格式, i18n 支持 |

---

## 2. 异步生成架构

```
用户请求 "导出报表"
    ↓
Spring Boot Controller → 返回 jobId (立即响应)
    ↓
Kafka (erp.document.jobs) → DocumentWorker 消费
    ↓
DocumentWorker:
    1. 查询数据 (PG / ClickHouse)
    2. 生成文档 (JasperReports / POI)
    3. 上传到 MinIO (erp-documents bucket)
    4. 更新 document_jobs 表 (status = COMPLETED, url = ...)
    5. 发送通知 (WebSocket / Email)
    ↓
前端轮询 / WebSocket 推送 → 下载链接
```

### 数据模型

```sql
CREATE TABLE document_jobs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id),
    type        VARCHAR(50) NOT NULL,     -- 'PDF_REPORT', 'EXCEL_EXPORT', 'BARCODE'
    template    VARCHAR(100),             -- 'purchase_order', 'monthly_sales'
    params      JSONB,                    -- 生成参数
    status      VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    file_url    TEXT,                     -- MinIO 下载 URL
    file_size   BIGINT,
    error       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);
```

---

## 3. PDF 生成 (JasperReports)

```kotlin
@Service
class PdfReportService(
    private val dataSource: DataSource,
    private val minioClient: MinioClient,
) {
    fun generatePurchaseOrder(poId: UUID): String {
        val report = JasperCompileManager.compileReport("templates/purchase_order.jrxml")
        val params = mapOf("PO_ID" to poId.toString())
        val print = JasperFillManager.fillReport(report, params, dataSource.connection)
        val pdfBytes = JasperExportManager.exportReportToPdf(print)

        val objectName = "reports/po/${poId}.pdf"
        minioClient.putObject(
            PutObjectArgs.builder()
                .bucket("erp-documents")
                .`object`(objectName)
                .stream(ByteArrayInputStream(pdfBytes), pdfBytes.size.toLong(), -1)
                .contentType("application/pdf")
                .build()
        )
        return minioClient.getPresignedObjectUrl(
            GetPresignedObjectUrlArgs.builder()
                .bucket("erp-documents").`object`(objectName)
                .method(Method.GET).expiry(24, TimeUnit.HOURS)
                .build()
        )
    }
}
```

---

## 4. Excel 导出 (Apache POI)

```kotlin
@Service
class ExcelExportService {
    fun exportProducts(products: List<ProductDto>): ByteArray {
        val workbook = SXSSFWorkbook(100)  // 流式写入, 内存友好
        val sheet = workbook.createSheet("Products")

        // Header
        val headerRow = sheet.createRow(0)
        listOf("SKU", "Name", "Category", "Cost", "Status").forEachIndexed { i, h ->
            headerRow.createCell(i).setCellValue(h)
        }

        // Data
        products.forEachIndexed { i, product ->
            val row = sheet.createRow(i + 1)
            row.createCell(0).setCellValue(product.sku)
            row.createCell(1).setCellValue(product.name)
            row.createCell(2).setCellValue(product.category)
            row.createCell(3).setCellValue(product.cost.toDouble())
            row.createCell(4).setCellValue(product.status)
        }

        val out = ByteArrayOutputStream()
        workbook.write(out)
        workbook.dispose()
        return out.toByteArray()
    }
}
```

---

## 5. 模板管理

| 模板 | 格式 | 位置 |
|------|------|------|
| `purchase_order.jrxml` | JasperReports XML | `src/main/resources/templates/reports/` |
| `training_certificate.html` | Thymeleaf → PDF | `src/main/resources/templates/certificates/` |
| `monthly_sales.jrxml` | JasperReports | `src/main/resources/templates/reports/` |
| `email_po_approved.html` | Thymeleaf Email | `src/main/resources/templates/email/` |

> 所有模板支持 i18n: `purchase_order_en.jrxml`, `purchase_order_zh.jrxml`

---

*Version: 1.0.0 — 2026-02-11*
