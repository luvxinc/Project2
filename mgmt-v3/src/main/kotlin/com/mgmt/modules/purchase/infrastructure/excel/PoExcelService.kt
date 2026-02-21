package com.mgmt.modules.purchase.infrastructure.excel

import com.mgmt.modules.products.domain.model.Product
import com.mgmt.modules.products.domain.repository.ProductRepository
import com.mgmt.modules.purchase.domain.model.PurchaseOrder
import com.mgmt.modules.purchase.domain.model.PurchaseOrderItem
import com.mgmt.modules.purchase.domain.model.PurchaseOrderStrategy
import org.apache.poi.ss.usermodel.*
import org.apache.poi.ss.util.CellRangeAddress
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 * V1 parity: PO Excel operations with Apache POI.
 * - Template generation (with formatting + sheet protection)
 * - Upload parsing (with header/supplier/date/currency/SKU validation)
 * - Export (with V1-exact cell layout + formatting)
 */
@Service
class PoExcelService(
    private val productRepo: ProductRepository,
) {
    companion object {
        const val SHEET_PROTECTION_PASSWORD = "1522"
        const val HEADER_TITLE = "Eaglestar Purchase Order Form"
    }

    // ═══════════ 1. Template Generation ═══════════

    /**
     * V1 parity: generate_prefilled_template_api
     * Reads in_po_upload.xlsx template, fills metadata, locks + protects.
     *
     * Actual V1 template cell map:
     *   B1=title, B2="供货商"(label), C2=(value), D2="订货日期"(label), E2=(value), F2="货币"(label), G2=(value)
     *   B4=SKU, C4=Quantity, D4=Price (data headers)
     *   Row 5+ = data entry area
     */
    fun generateTemplate(
        supplierCode: String,
        poDate: LocalDate,
        currency: String,
        exchangeRate: Double = 0.0,
        floatEnabled: Boolean = false,
        floatThreshold: Double = 0.0,
        depositEnabled: Boolean = false,
        depositRatio: Double = 0.0,
        username: String = "",
    ): ByteArray {
        val templateStream = javaClass.classLoader.getResourceAsStream("templates/excel/in_po_upload.xlsx")

        val wb: XSSFWorkbook
        val ws: org.apache.poi.ss.usermodel.Sheet

        if (templateStream != null) {
            wb = XSSFWorkbook(templateStream)
            ws = wb.getSheetAt(0)

            // Fill metadata: C2=supplier, E2=date, G2=currency (V1 exact positions)
            setCellValue(ws, 1, 2, supplierCode)                  // C2
            setCellValue(ws, 1, 4, poDate.toString())              // E2
            setCellValue(ws, 1, 6, currency)                       // G2
        } else {
            // Fallback if template file missing
            wb = XSSFWorkbook()
            ws = wb.createSheet("Sheet1")
            val hf = wb.createFont().apply { bold = true; fontHeightInPoints = 12 }
            val hs = wb.createCellStyle().apply { setFont(hf) }
            ws.createRow(0).createCell(1).apply { setCellValue(HEADER_TITLE); cellStyle = hs }
            ws.createRow(1).apply {
                createCell(1).setCellValue("供货商"); createCell(2).setCellValue(supplierCode)
                createCell(3).setCellValue("订货日期"); createCell(4).setCellValue(poDate.toString())
                createCell(5).setCellValue("货币"); createCell(6).setCellValue(currency)
            }
            ws.createRow(3).apply {
                createCell(1).setCellValue("SKU"); createCell(2).setCellValue("Quantity"); createCell(3).setCellValue("Price")
            }
        }

        // Unlock data entry area: Row 5+ cols B/C/D (index 1/2/3)
        val unlockedStyle = wb.createCellStyle().apply { locked = false }
        for (r in 4..1003) {
            val row = ws.getRow(r) ?: ws.createRow(r)
            for (c in 1..3) {
                val cell = row.getCell(c) ?: row.createCell(c)
                cell.cellStyle = unlockedStyle
            }
        }
        // Also unlock G2 for remarks
        (ws.getRow(1) ?: ws.createRow(1)).let { row ->
            (row.getCell(6) ?: row.createCell(6)).cellStyle = unlockedStyle
        }

        ws.protectSheet(SHEET_PROTECTION_PASSWORD)

        val out = ByteArrayOutputStream()
        wb.write(out)
        wb.close()
        return out.toByteArray()
    }

    private fun setCellValue(sheet: org.apache.poi.ss.usermodel.Sheet, rowIdx: Int, colIdx: Int, value: String) {
        val row = sheet.getRow(rowIdx) ?: sheet.createRow(rowIdx)
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    private fun setCellValue(sheet: org.apache.poi.ss.usermodel.Sheet, rowIdx: Int, colIdx: Int, value: Double) {
        val row = sheet.getRow(rowIdx) ?: sheet.createRow(rowIdx)
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    // ═══════════ 2. Upload Parsing & Validation ═══════════

    data class ParsedItem(
        val row: Int,
        val sku: String,
        val quantity: Int,
        val unitPrice: Double,
        val note: String = "",
    )

    data class SkuError(
        val row: Int,
        val sku: String,
        val suggestions: List<String>,
    )

    data class ParseResult(
        val success: Boolean,
        val items: List<ParsedItem> = emptyList(),
        val itemCount: Int = 0,
        val errorType: String? = null,
        val message: String? = null,
        val skuErrors: List<SkuError> = emptyList(),
        val dataErrors: List<String> = emptyList(),
        val validSkus: List<String> = emptyList(),
    )

    /**
     * V1 parity: parse_po_excel_api
     * Validates: B1=header, C2=supplier, E2=date, G2=currency
     * Parses: B5+ data rows (SKU/Qty/Price)
     * SKU validation against products table with fuzzy suggestions
     */
    fun parseUploadedExcel(
        inputStream: InputStream,
        expectedSupplier: String,
        expectedDate: LocalDate,
        expectedCurrency: String,
    ): ParseResult {
        val wb = WorkbookFactory.create(inputStream)
        val ws = wb.getSheetAt(0)

        // V1 validation 1: B1 = "Eaglestar Purchase Order Form"
        val b1 = getCellString(ws, 0, 1)
        if (b1 != HEADER_TITLE) {
            wb.close()
            return ParseResult(
                success = false,
                errorType = "header_mismatch",
                message = "B1 must be '$HEADER_TITLE', got: '$b1'"
            )
        }

        // V1 actual: C2 = supplier code value (col index 2)
        val c2 = getCellString(ws, 1, 2).uppercase()
        if (c2.isNotBlank() && c2 != expectedSupplier.uppercase()) {
            wb.close()
            return ParseResult(
                success = false,
                errorType = "supplier_mismatch",
                message = "Supplier mismatch: expected ${expectedSupplier.uppercase()}, got $c2"
            )
        }

        // V1 actual: E2 = date value (col index 4)
        val e2Raw = getCellString(ws, 1, 4)
        if (e2Raw.isNotBlank()) {
            val parsedDate = tryParseDate(e2Raw)
            if (parsedDate != null && parsedDate != expectedDate) {
                wb.close()
                return ParseResult(
                    success = false,
                    errorType = "date_mismatch",
                    message = "Date mismatch: expected $expectedDate, got $e2Raw"
                )
            }
        }

        // V1 actual: G2 = currency value (row 1, col 6)
        val g2 = getCellString(ws, 1, 6).uppercase()
        if (g2.isNotBlank() && g2 != expectedCurrency.uppercase()) {
            wb.close()
            return ParseResult(
                success = false,
                errorType = "currency_mismatch",
                message = "Currency mismatch: expected ${expectedCurrency.uppercase()}, got $g2"
            )
        }

        // Load valid SKUs from products table (V1: Data_COGS)
        val validSkus = productRepo.findAllByDeletedAtIsNullOrderBySkuAsc().map { it.sku.uppercase() }.toSet()

        // V1 actual template: Row 5+ (index 4+), B=SKU(1), C=Qty(2), D=Price(3)
        val items = mutableListOf<ParsedItem>()
        val skuErrors = mutableListOf<SkuError>()
        val dataErrors = mutableListOf<String>()

        for (rowIdx in 4..ws.lastRowNum) {
            val row = ws.getRow(rowIdx) ?: continue
            val sku = getCellString(row, 1).trim().uppercase()  // B column = SKU
            if (sku.isBlank()) continue // skip empty

            val qtyRaw = getCellNumeric(row, 2)    // C column = Quantity
            val priceRaw = getCellNumeric(row, 3)   // D column = Price
            val excelRow = rowIdx + 1

            // Qty validation
            if (qtyRaw == null || qtyRaw <= 0) {
                dataErrors.add("Row $excelRow: $sku — quantity must be > 0")
            }
            // Price validation
            if (priceRaw == null || priceRaw <= 0) {
                dataErrors.add("Row $excelRow: $sku — unit price must be > 0")
            }

            // V1 parity: SKU validation against product database
            if (validSkus.isNotEmpty() && !validSkus.contains(sku)) {
                val suggestions = findSimilarSkus(sku, validSkus, limit = 5)
                skuErrors.add(SkuError(excelRow, sku, suggestions))
            }

            items.add(ParsedItem(
                row = excelRow,
                sku = sku,
                quantity = qtyRaw?.toInt() ?: 0,
                unitPrice = Math.round((priceRaw ?: 0.0) * 100000.0) / 100000.0,
            ))
        }

        wb.close()

        if (items.isEmpty()) {
            return ParseResult(success = false, errorType = "no_data", message = "No items found starting at row 5")
        }

        return ParseResult(
            success = skuErrors.isEmpty() && dataErrors.isEmpty(),
            items = items,
            itemCount = items.size,
            errorType = if (skuErrors.isNotEmpty()) "sku_errors" else if (dataErrors.isNotEmpty()) "data_errors" else null,
            skuErrors = skuErrors,
            dataErrors = dataErrors,
            validSkus = validSkus.toList().sorted(),
        )
    }

    // ═══════════ 3. Export PO to Excel ═══════════

    /**
     * V1 parity: download_po_excel_api — reads in_po_output.xlsx template, fills cells.
     *
     * V1 output template cell map:
     *   C4=supplier, F4=date, C6=PO#
     *   F8=strategySeq, C10=operator, F10=strategyDate, C12=note
     *   C14=currency, F14=exchangeRate
     *   C16=float(是/否), F16=threshold%, C18=deposit(是/否), F18=ratio%
     *   F20=detailSeq, C22=operator, F22=date, C24=note, C26=total
     *   Row 29+ = items (B=SKU, C=Qty, D=Currency, E=Price, F=Subtotal)
     */
    fun exportPo(
        po: PurchaseOrder,
        items: List<PurchaseOrderItem>,
        strategy: PurchaseOrderStrategy?,
    ): ByteArray {
        val templateStream = javaClass.classLoader.getResourceAsStream("templates/excel/in_po_output.xlsx")
        val isDeleted = po.deletedAt != null
        val currency = strategy?.currency ?: "USD"
        val exchangeRate = strategy?.exchangeRate?.toDouble() ?: 1.0
        var o = 0 // row offset for deleted orders

        val wb: XSSFWorkbook
        val ws: org.apache.poi.ss.usermodel.Sheet

        if (templateStream != null) {
            wb = XSSFWorkbook(templateStream)
            ws = wb.getSheetAt(0)
        } else {
            wb = XSSFWorkbook()
            ws = wb.createSheet("Sheet1")
        }

        // V1: if deleted, insert row at top with red notice
        if (isDeleted) {
            ws.shiftRows(0, ws.lastRowNum, 1)
            val redFont = wb.createFont().apply { bold = true; color = IndexedColors.RED.index; fontHeightInPoints = 14 }
            val redStyle = wb.createCellStyle().apply { setFont(redFont) }
            ws.createRow(0).createCell(1).apply {
                val deletedDate = po.updatedAt.atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()
                setCellValue("订单被删除 删除日期 $deletedDate")
                cellStyle = redStyle
            }
            o = 1
        }

        // Fill metadata cells (V1 exact positions from template)
        setCellValue(ws, 3 + o, 2, po.supplierCode)                  // C4
        setCellValue(ws, 3 + o, 5, po.poDate.toString())              // F4
        setCellValue(ws, 5 + o, 2, po.poNum)                          // C6
        setCellValue(ws, 7 + o, 5, "V${String.format("%02d", strategy?.strategySeq ?: 1)}")  // F8
        setCellValue(ws, 9 + o, 2, strategy?.createdBy ?: "-")        // C10
        setCellValue(ws, 9 + o, 5, strategy?.strategyDate?.toString() ?: "-")  // F10
        setCellValue(ws, 11 + o, 2, strategy?.note ?: "-")            // C12
        setCellValue(ws, 13 + o, 2, currency)                         // C14
        setCellValue(ws, 13 + o, 5, exchangeRate)                     // F14
        setCellValue(ws, 15 + o, 2, if (strategy?.floatEnabled == true) "是" else "否")  // C16
        setCellValue(ws, 15 + o, 5, if (strategy?.floatEnabled == true) "${strategy.floatThreshold}%" else "0%")  // F16
        setCellValue(ws, 17 + o, 2, if (strategy?.requireDeposit == true) "是" else "否")  // C18
        setCellValue(ws, 17 + o, 5, if (strategy?.requireDeposit == true) "${strategy.depositRatio}%" else "0%")  // F18
        setCellValue(ws, 19 + o, 5, "L${String.format("%02d", po.detailSeq)}")  // F20
        setCellValue(ws, 21 + o, 2, po.updatedBy ?: "-")              // C22
        val updatedDate = po.updatedAt.atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()
        setCellValue(ws, 21 + o, 5, updatedDate)          // F22
        setCellValue(ws, 23 + o, 2, "-")                              // C24

        // Total
        var total = 0.0
        items.forEach { total += it.quantity * it.unitPrice.toDouble() }
        val totalRounded = Math.round(total * 100000.0) / 100000.0
        setCellValue(ws, 25 + o, 2, "$currency ${String.format("%.2f", totalRounded)}")  // C26

        // Row 29+ (index 28+): items data
        if (isDeleted || items.isEmpty()) {
            val redFont = wb.createFont().apply { bold = true; color = IndexedColors.RED.index; italic = true }
            val redStyle = wb.createCellStyle().apply { setFont(redFont) }
            val row = ws.getRow(28 + o) ?: ws.createRow(28 + o)
            row.createCell(1).apply {
                setCellValue("(订单已删除，无明细数据)")
                cellStyle = redStyle
            }
        } else {
            items.forEachIndexed { idx, item ->
                val row = ws.getRow(28 + o + idx) ?: ws.createRow(28 + o + idx)
                (row.getCell(1) ?: row.createCell(1)).setCellValue(item.sku)           // B
                (row.getCell(2) ?: row.createCell(2)).setCellValue(item.quantity.toDouble())  // C
                (row.getCell(3) ?: row.createCell(3)).setCellValue(currency)            // D
                (row.getCell(4) ?: row.createCell(4)).setCellValue(item.unitPrice.toDouble()) // E
                val lineTotal = Math.round(item.quantity * item.unitPrice.toDouble() * 100000.0) / 100000.0
                (row.getCell(5) ?: row.createCell(5)).setCellValue(lineTotal)           // F
            }
        }

        val out = ByteArrayOutputStream()
        wb.write(out)
        wb.close()
        return out.toByteArray()
    }

    // ═══════════ Helpers ═══════════

    private fun getCellString(sheet: Sheet, rowIdx: Int, colIdx: Int): String {
        val row = sheet.getRow(rowIdx) ?: return ""
        return getCellString(row, colIdx)
    }

    private fun getCellString(row: Row, colIdx: Int): String {
        val cell = row.getCell(colIdx) ?: return ""
        return when (cell.cellType) {
            CellType.STRING -> cell.stringCellValue ?: ""
            CellType.NUMERIC -> {
                if (org.apache.poi.ss.usermodel.DateUtil.isCellDateFormatted(cell)) {
                    cell.localDateTimeCellValue?.toLocalDate()?.toString() ?: ""
                } else {
                    val num = cell.numericCellValue
                    if (num == num.toLong().toDouble()) num.toLong().toString() else num.toString()
                }
            }
            CellType.BOOLEAN -> cell.booleanCellValue.toString()
            CellType.FORMULA -> try { cell.stringCellValue } catch (_: Exception) { cell.numericCellValue.toString() }
            else -> ""
        }
    }

    private fun getCellNumeric(row: Row, colIdx: Int): Double? {
        val cell = row.getCell(colIdx) ?: return null
        return when (cell.cellType) {
            CellType.NUMERIC -> cell.numericCellValue
            CellType.STRING -> cell.stringCellValue?.toDoubleOrNull()
            else -> null
        }
    }

    /**
     * V1 parity: date parsing with multiple format support.
     */
    private fun tryParseDate(value: String): LocalDate? {
        // Handle Excel serial date number
        val num = value.toDoubleOrNull()
        if (num != null && num > 40000 && num < 60000) {
            val days = num.toLong() - 25569
            return LocalDate.ofEpochDay(days)
        }

        val formats = listOf(
            "yyyy-MM-dd", "yyyy/MM/dd", "dd/MM/yyyy", "MM/dd/yyyy",
            "yyyy.MM.dd", "dd-MM-yyyy",
        )
        for (fmt in formats) {
            try {
                return LocalDate.parse(value.trim(), DateTimeFormatter.ofPattern(fmt))
            } catch (_: DateTimeParseException) { /* try next */ }
        }
        return null
    }

    /**
     * V1 parity: fuzzy SKU matching using Levenshtein-like similarity.
     */
    private fun findSimilarSkus(target: String, validSkus: Set<String>, limit: Int = 5): List<String> {
        return validSkus
            .map { it to similarity(target.lowercase(), it.lowercase()) }
            .filter { it.second > 0.4 }
            .sortedByDescending { it.second }
            .take(limit)
            .map { it.first }
    }

    /** Simple sequence similarity ratio (SequenceMatcher-like). */
    private fun similarity(a: String, b: String): Double {
        if (a.isEmpty() && b.isEmpty()) return 1.0
        if (a.isEmpty() || b.isEmpty()) return 0.0
        // LCS-based quick approximation
        var matches = 0
        val used = BooleanArray(b.length)
        for (ch in a) {
            for (j in b.indices) {
                if (!used[j] && b[j] == ch) {
                    matches++
                    used[j] = true
                    break
                }
            }
        }
        return (2.0 * matches) / (a.length + b.length)
    }
}
