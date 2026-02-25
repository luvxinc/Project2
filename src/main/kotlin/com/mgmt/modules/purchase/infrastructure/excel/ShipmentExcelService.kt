package com.mgmt.modules.purchase.infrastructure.excel

import com.mgmt.modules.purchase.application.dto.ShipmentAvailablePo
import com.mgmt.modules.purchase.domain.model.Shipment
import com.mgmt.modules.purchase.domain.model.ShipmentEvent
import com.mgmt.modules.purchase.domain.model.ShipmentItem
import org.apache.poi.ss.usermodel.*
import org.apache.poi.ss.util.CellRangeAddressList
import org.apache.poi.xssf.usermodel.XSSFColor
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.springframework.stereotype.Service
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.format.DateTimeParseException

/**
 *
 * * Excel template specification:
 *   - send_create/template.py → generateTemplate() + parseUploadedExcel()
 *   - send_mgmt/detail.py     → exportMgmt() + exportWarehouse()
 *
 * Template files (copied from V1 data/templates_csv/):
 *   - in_send_upload.xlsx
 *   - in_send_output_mgmt.xlsx
 *   - in_send_output_warehouse.xlsx
 */
@Service
class ShipmentExcelService {
    companion object {
        const val SHEET_PROTECTION_PASSWORD = "1522"
    }

    // ═══════════ Data Classes ═══════════

    data class ShipmentParseResult(
        val success: Boolean,
        val logistics: ParsedLogistics? = null,
        val items: List<ParsedShipmentItem> = emptyList(),
        val errors: List<String> = emptyList(),
    )

    data class ParsedLogistics(
        val logisticNum: String,
        val sentDate: LocalDate?,
        val etaDate: LocalDate?,
        val pallets: Int,
        val totalWeight: Double,
        val priceKg: Double,
    )

    data class ParsedShipmentItem(
        val row: Int,
        val poNum: String,
        val sku: String,
        val orderedQty: Int,
        val shippedQty: Int,
        val remainingQty: Int,
        val sendQty: Int,
        val isRounded: Boolean,
        val unitPrice: Double,
        val note: String,
    )

    /** Context for each item in MGMT export (prepared by UseCase) */
    data class ItemExportContext(
        val item: ShipmentItem,
        val poDate: LocalDate?,
        val currency: String,
        val orderedQty: Int,
        val alreadySentExclCurrent: Int,
        val isAdjusted: Boolean,
    )

    // ═══════════ 1. Template Generation ═══════════

    /**
     *
     * Cell map (from V1 lines 208-254):
     *   C2 = sentDate
     *   I4 = sentDate (pre-filled, LOCKED)
     *   Editable (unlocked): C4, F4, C6, F6, I6
     *   Data rows from row 9 (index 8):
     *     B=poDate, C=poNum, D=sku, E=orderedQty, F=shippedQty, G=remainingQty,
     *     H=sendQty(unlocked), I=isRounded(unlocked, dropdown "是,否"), J=priceRankStr
     */
    fun generateTemplate(sentDate: LocalDate, availablePos: List<ShipmentAvailablePo>): ByteArray {
        val templateStream = javaClass.classLoader.getResourceAsStream("templates/excel/in_send_upload.xlsx")

        val wb: XSSFWorkbook
        val ws: Sheet

        if (templateStream != null) {
            wb = XSSFWorkbook(templateStream)
            ws = wb.getSheetAt(0)
        } else {
            wb = XSSFWorkbook()
            ws = wb.createSheet("Sheet1")
        }

        // V1 line 208: C2 = date_sent
        setCellValue(ws, 1, 2, sentDate.toString())

        // V1 line 224: I4 = date_sent (pre-filled, stays LOCKED)
        setCellValue(ws, 3, 8, sentDate.toString())

        // Unlock editable logistics cells (V1 lines 226-228)
        val unlockedStyle = wb.createCellStyle().apply { locked = false }
        unlockCell(ws, 3, 2, unlockedStyle)  // C4 = logistic_num (user input)
        unlockCell(ws, 3, 5, unlockedStyle)  // F4 = pallets (user input)
        unlockCell(ws, 5, 2, unlockedStyle)  // C6 = price_kg (user input)
        unlockCell(ws, 5, 5, unlockedStyle)  // F6 = total_weight (user input)
        unlockCell(ws, 5, 8, unlockedStyle)  // I6 = date_eta (user input)
        // NOTE: I4 is NOT unlocked — it's pre-filled by system

        // V1 lines 210-219: Fill data rows starting at row 9 (index 8)
        var rowIdx = 8
        for (po in availablePos) {
            // V1: count price tiers per (po_num, sku) for price_rank_str
            val skuPriceCounts = mutableMapOf<String, Int>()
            for (item in po.items) {
                skuPriceCounts[item.sku] = (skuPriceCounts[item.sku] ?: 0) + 1
            }
            val skuPriceIdx = mutableMapOf<String, Int>()

            for (item in po.items) {
                val row = ws.getRow(rowIdx) ?: ws.createRow(rowIdx)
                setCellValueInRow(row, 1, po.poDate.toString())        // B = poDate
                setCellValueInRow(row, 2, po.poNum)                     // C = poNum
                setCellValueInRow(row, 3, item.sku)                     // D = sku
                setCellNumericInRow(row, 4, item.orderedQty.toDouble())  // E = orderedQty
                setCellNumericInRow(row, 5, item.shippedQty.toDouble())  // F = shippedQty
                setCellNumericInRow(row, 6, item.remainingQty.toDouble()) // G = remainingQty

                // V1 line 219: J = price_rank_str (e.g. "价格位列1" when multiple prices)
                val count = skuPriceCounts[item.sku] ?: 1
                if (count > 1) {
                    val idx = (skuPriceIdx[item.sku] ?: 0) + 1
                    skuPriceIdx[item.sku] = idx
                    setCellValueInRow(row, 9, "价格位列$idx")             // J = price_rank_str
                }

                // V1 lines 243-251: Unlock H (sendQty) and I (isRounded) for user input
                val cellH = row.getCell(7) ?: row.createCell(7)
                cellH.cellStyle = unlockedStyle
                val cellI = row.getCell(8) ?: row.createCell(8)
                cellI.cellStyle = unlockedStyle

                rowIdx++
            }
        }

        // V1 lines 230-241: DataValidation dropdown "是,否" on I column for data rows
        if (rowIdx > 8) {
            val dvHelper = ws.dataValidationHelper
            val dvConstraint = dvHelper.createExplicitListConstraint(arrayOf("是", "否"))
            val addressList = CellRangeAddressList(8, rowIdx - 1, 8, 8)  // I9:I{lastRow}
            val validation = dvHelper.createValidation(dvConstraint, addressList)
            validation.showErrorBox = true
            validation.createErrorBox("输入错误", "请从下拉列表中选择：是 或 否")
            validation.showPromptBox = true
            validation.createPromptBox("提示", "请选择是否规整订货量")
            ws.addValidationData(validation)
        }

        ws.protectSheet(SHEET_PROTECTION_PASSWORD)

        val out = ByteArrayOutputStream()
        wb.write(out)
        wb.close()
        return out.toByteArray()
    }

    // ═══════════ 2. Upload Parsing ═══════════

    /**
     *
     * 3-stage validation (V1 lines 302-521):
     *   Stage 1: Data consistency check (B,C,D,E,G columns match template_data)
     *   Stage 2: Required logistics cells (C4,F4,I4,C6,F6,I6)
     *   Stage 3: Detail validation (H=integer>0, I="是"/"否")
     *
     * Logistics cells:
     *   C4=logisticNum, F4=pallets, I4=sentDate,
     *   C6=priceKg, F6=totalWeight, I6=etaDate
     */
    fun parseUploadedExcel(inputStream: InputStream): ShipmentParseResult {
        val wb = WorkbookFactory.create(inputStream)
        val ws = wb.getSheetAt(0)
        val errors = mutableListOf<String>()

        // Stage 2: Read logistics params (V1 lines 373-397, 488-495)
        val logisticNum = getCellString(ws, 3, 2).trim()   // C4
        val palletsRaw = getCellNumeric(ws, 3, 5)           // F4
        val sentDateRaw = getCellString(ws, 3, 8).trim()    // I4
        val priceKgRaw = getCellNumeric(ws, 5, 2)           // C6
        val totalWeightRaw = getCellNumeric(ws, 5, 5)       // F6
        val etaDateRaw = getCellString(ws, 5, 8).trim()     // I6

        // V1 lines 373-397: Required fields check
        if (logisticNum.isBlank()) errors.add("C4: 物流单号不能为空")
        if (sentDateRaw.isBlank()) errors.add("I4: 发货日期不能为空")
        if (palletsRaw == null || palletsRaw <= 0) errors.add("F4: 托盘数不能为空")
        if (priceKgRaw == null || priceKgRaw <= 0) errors.add("C6: 物流单价不能为空")
        if (totalWeightRaw == null || totalWeightRaw <= 0) errors.add("F6: 发货总重量不能为空")
        if (etaDateRaw.isBlank()) errors.add("I6: 预计到货日期不能为空")

        val sentDate = tryParseDate(sentDateRaw)
        val etaDate = if (etaDateRaw.isNotBlank()) tryParseDate(etaDateRaw) else null

        if (sentDateRaw.isNotBlank() && sentDate == null) {
            errors.add("I4: 日期格式无效: $sentDateRaw")
        }
        if (etaDateRaw.isNotBlank() && etaDate == null) {
            errors.add("I6: 日期格式无效: $etaDateRaw")
        }

        val logistics = ParsedLogistics(
            logisticNum = logisticNum,
            sentDate = sentDate,
            etaDate = etaDate,
            pallets = palletsRaw?.toInt() ?: 0,
            totalWeight = totalWeightRaw ?: 0.0,
            priceKg = priceKgRaw ?: 0.0,
        )

        // Stage 3: Read data rows from row 9 (index 8)
        // V1 lines 399-445, 497-521
        val items = mutableListOf<ParsedShipmentItem>()
        var consecutiveEmpty = 0

        for (rowIdx in 8..ws.lastRowNum) {
            val row = ws.getRow(rowIdx)
            if (row == null) {
                consecutiveEmpty++
                if (consecutiveEmpty >= 10) break
                continue
            }

            val sku = getCellString(row, 3).trim().uppercase()  // D = sku
            if (sku.isBlank()) {
                consecutiveEmpty++
                if (consecutiveEmpty >= 10) break
                continue
            }
            consecutiveEmpty = 0

            val poNum = getCellString(row, 2).trim()             // C = poNum
            val orderedQty = getCellNumeric(row, 4)?.toInt() ?: 0 // E
            val shippedQty = getCellNumeric(row, 5)?.toInt() ?: 0 // F
            val remainingQty = getCellNumeric(row, 6)?.toInt() ?: 0 // G
            val sendQty = getCellNumeric(row, 7)?.toInt() ?: 0   // H = sendQty
            val isRoundedRaw = getCellString(row, 8).trim()      // I = isRounded
            val note = getCellString(row, 9).trim()               // J = note/price_rank

            val excelRow = rowIdx + 1

            // Only include rows where user entered sendQty > 0
            if (sendQty <= 0) continue

            // V1 lines 415-420: validate sendQty is positive integer
            if (sendQty < 0) {
                errors.add("Row $excelRow: 发货量必须为正整数")
                continue
            }

            // V1 lines 421-430: validate isRounded is "是" or "否"
            val isRounded = when (isRoundedRaw) {
                "是", "yes", "Yes", "YES", "true", "1" -> true
                "否", "no", "No", "NO", "false", "0", "" -> false
                else -> {
                    errors.add("Row $excelRow: 规整列必须为'是'或'否'，当前值: '$isRoundedRaw'")
                    false
                }
            }

            items.add(ParsedShipmentItem(
                row = excelRow,
                poNum = poNum,
                sku = sku,
                orderedQty = orderedQty,
                shippedQty = shippedQty,
                remainingQty = remainingQty,
                sendQty = sendQty,
                isRounded = isRounded,
                unitPrice = 0.0,  // unitPrice comes from PO data, matched by UseCase
                note = note,
            ))
        }

        wb.close()

        if (items.isEmpty() && errors.isEmpty()) {
            errors.add("未找到发货量>0的数据行（从第9行开始）")
        }

        return ShipmentParseResult(
            success = errors.isEmpty() && items.isNotEmpty(),
            logistics = logistics,
            items = items,
            errors = errors,
        )
    }

    // ═══════════ 3. Export — Management Format ═══════════

    /**
     * Template: in_send_output_mgmt.xlsx
     *
     * Cell map (V1 lines 535-600):
     *   C4=logistic_num, J4=date_sent
     *   J6=seq (latest version), C8=operator, J8=date_record, C10=note
     *   C12=date_eta, F12=pallets, J12=total_weight(KG)
     *   C14=price_kg(RMB/KG), F14=total_price(RMB), J14=usd_rmb
     *   J16=detail_seq, C18=detail_by, J18=detail_date, C20=detail_note
     *   Items from row 23 (index 22):
     *     B=po_date, C=po_num, D=sku, E=currency+price, F=ordered_qty,
     *     G=already_sent, H=sent_qty, I=unshipped_qty, J=is_adjusted
     *   Orange fill on row when unshipped≠0 AND is_adjusted='是'
     */
    fun exportMgmt(
        shipment: Shipment,
        itemContexts: List<ItemExportContext>,
        latestEvent: ShipmentEvent?,
    ): ByteArray {
        val templateStream = javaClass.classLoader.getResourceAsStream("templates/excel/in_send_output_mgmt.xlsx")

        val wb: XSSFWorkbook
        val ws: Sheet

        if (templateStream != null) {
            wb = XSSFWorkbook(templateStream)
            ws = wb.getSheetAt(0)
        } else {
            wb = XSSFWorkbook()
            ws = wb.createSheet("Sheet1")
        }

        // ── Header: Logistics Info ──
        safeWrite(ws, 3, 2, shipment.logisticNum)                    // C4
        safeWrite(ws, 3, 9, shipment.sentDate.toString())            // J4
        safeWrite(ws, 5, 9, latestEvent?.let { "S${it.eventSeq.toString().padStart(2, '0')}" } ?: "S01")  // J6=seq
        safeWrite(ws, 7, 2, shipment.createdBy ?: "-")              // C8=operator
        val recordDate = (latestEvent?.createdAt ?: shipment.createdAt).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()
        safeWrite(ws, 7, 9, recordDate)  // J8=date_record
        safeWrite(ws, 9, 2, shipment.note ?: "-")                   // C10=note
        safeWrite(ws, 11, 2, shipment.etaDate?.toString() ?: "-")   // C12=date_eta
        safeWriteNum(ws, 11, 5, shipment.pallets.toDouble())        // F12=pallets
        safeWriteNum(ws, 11, 9, shipment.totalWeight.toDouble())    // J12=total_weight(KG)
        safeWriteNum(ws, 13, 2, shipment.priceKg.toDouble())        // C14=price_kg(RMB/KG)
        safeWriteNum(ws, 13, 5, shipment.logisticsCost.toDouble())  // F14=total_price(RMB)
        safeWriteNum(ws, 13, 9, shipment.exchangeRate.toDouble())   // J14=usd_rmb

        // Detail version info (latest event with items context)
        // V1 lines 550-553: J16=detail_seq, C18=detail_by, J18=detail_date, C20=detail_note
        if (latestEvent != null) {
            safeWrite(ws, 15, 9, "L${latestEvent.eventSeq.toString().padStart(2, '0')}")  // J16
            safeWrite(ws, 17, 2, latestEvent.operator)                 // C18
            val detailDate = latestEvent.createdAt.atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()
            safeWrite(ws, 17, 9, detailDate)  // J18
            safeWrite(ws, 19, 2, latestEvent.note ?: "-")             // C20
        }

        // ── Items: from row 23 (index 22) ──
        // Orange fill style for adjusted+unshipped rows
        val orangeFill = wb.createCellStyle().apply {
            fillForegroundColor = IndexedColors.ORANGE.index
            fillPattern = FillPatternType.SOLID_FOREGROUND
        }

        itemContexts.forEachIndexed { idx, ctx ->
            val row = ws.getRow(22 + idx) ?: ws.createRow(22 + idx)
            val item = ctx.item

            val totalSentForSku = ctx.alreadySentExclCurrent + item.quantity
            val unshippedQty = ctx.orderedQty - totalSentForSku
            val priceStr = "${ctx.currency} ${item.unitPrice}"
            val isAdjustedStr = if (ctx.isAdjusted) "是" else "否"

            setCellValueInRow(row, 1, ctx.poDate?.toString() ?: "-")  // B=po_date
            setCellValueInRow(row, 2, item.poNum)                      // C=po_num
            setCellValueInRow(row, 3, item.sku)                        // D=sku
            setCellValueInRow(row, 4, priceStr)                        // E=currency+price
            setCellNumericInRow(row, 5, ctx.orderedQty.toDouble())     // F=ordered_qty
            setCellNumericInRow(row, 6, ctx.alreadySentExclCurrent.toDouble())  // G=already_sent
            setCellNumericInRow(row, 7, item.quantity.toDouble())      // H=sent_qty
            setCellNumericInRow(row, 8, unshippedQty.toDouble())       // I=unshipped_qty
            setCellValueInRow(row, 9, isAdjustedStr)                   // J=is_adjusted

            // V1 lines 597-600: orange fill when unshipped≠0 AND is_adjusted='是'
            if (unshippedQty != 0 && ctx.isAdjusted) {
                for (colIdx in 1..9) {
                    val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
                    cell.cellStyle = orangeFill
                }
            }
        }

        val out = ByteArrayOutputStream()
        wb.write(out)
        wb.close()
        return out.toByteArray()
    }

    // ═══════════ 4. Export — Warehouse Format ═══════════

    /**
     * Template: in_send_output_warehouse.xlsx
     *
     * Cell map (V1 lines 474-528):
     *   C4=logistic_num, F4=date_sent
     *   F6=seq (latest version)
     *   C8=date_eta, F8=pallets
     *   F10=detail_seq
     *   Items from row 13 (index 12), MERGED BY SKU:
     *     B=sku, C=ordered_qty, D=already_sent, E=sent_qty, F=unshipped_qty
     */
    fun exportWarehouse(
        shipment: Shipment,
        itemContexts: List<ItemExportContext>,
        latestEvent: ShipmentEvent?,
    ): ByteArray {
        val templateStream = javaClass.classLoader.getResourceAsStream("templates/excel/in_send_output_warehouse.xlsx")

        val wb: XSSFWorkbook
        val ws: Sheet

        if (templateStream != null) {
            wb = XSSFWorkbook(templateStream)
            ws = wb.getSheetAt(0)
        } else {
            wb = XSSFWorkbook()
            ws = wb.createSheet("Sheet1")
        }

        // ── Header ──
        safeWrite(ws, 3, 2, shipment.logisticNum)                    // C4
        safeWrite(ws, 3, 5, shipment.sentDate.toString())            // F4
        safeWrite(ws, 5, 5, latestEvent?.let { "S${it.eventSeq.toString().padStart(2, '0')}" } ?: "S01")  // F6=seq
        safeWrite(ws, 7, 2, shipment.etaDate?.toString() ?: "-")    // C8=date_eta
        safeWriteNum(ws, 7, 5, shipment.pallets.toDouble())         // F8=pallets
        if (latestEvent != null) {
            safeWrite(ws, 9, 5, "L${latestEvent.eventSeq.toString().padStart(2, '0')}")  // F10=detail_seq
        }

        // ── Items: merge by SKU ── (V1 lines 484-528)
        data class SkuAgg(
            val sku: String,
            var orderedQty: Int = 0,
            var alreadySent: Int = 0,
            var sentQty: Int = 0,
        )

        val skuMap = linkedMapOf<String, SkuAgg>()
        for (ctx in itemContexts) {
            val agg = skuMap.getOrPut(ctx.item.sku) { SkuAgg(sku = ctx.item.sku) }
            agg.orderedQty += ctx.orderedQty
            agg.alreadySent += ctx.alreadySentExclCurrent
            agg.sentQty += ctx.item.quantity
        }

        var rowIdx = 12  // row 13 (index 12)
        for ((_, agg) in skuMap) {
            val row = ws.getRow(rowIdx) ?: ws.createRow(rowIdx)
            val unshipped = agg.orderedQty - agg.alreadySent - agg.sentQty

            setCellValueInRow(row, 1, agg.sku)                           // B=sku
            setCellNumericInRow(row, 2, agg.orderedQty.toDouble())       // C=ordered
            setCellNumericInRow(row, 3, agg.alreadySent.toDouble())      // D=already_sent
            setCellNumericInRow(row, 4, agg.sentQty.toDouble())          // E=sent_qty
            setCellNumericInRow(row, 5, unshipped.toDouble())            // F=unshipped

            rowIdx++
        }

        val out = ByteArrayOutputStream()
        wb.write(out)
        wb.close()
        return out.toByteArray()
    }

    /**
     * Dispatch method: type = "mgmt" | "warehouse"
     * Called by Controller — delegates to exportMgmt() or exportWarehouse()
     */
    fun exportShipment(
        shipment: Shipment,
        itemContexts: List<ItemExportContext>,
        latestEvent: ShipmentEvent?,
        type: String,
    ): ByteArray {
        return when (type) {
            "warehouse" -> exportWarehouse(shipment, itemContexts, latestEvent)
            else -> exportMgmt(shipment, itemContexts, latestEvent)
        }
    }

    // ═══════════ Helpers ═══════════

    /** Safe write for potentially merged cells — sets value without throwing on merged regions */
    private fun safeWrite(sheet: Sheet, rowIdx: Int, colIdx: Int, value: String) {
        val row = sheet.getRow(rowIdx) ?: sheet.createRow(rowIdx)
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    private fun safeWriteNum(sheet: Sheet, rowIdx: Int, colIdx: Int, value: Double) {
        val row = sheet.getRow(rowIdx) ?: sheet.createRow(rowIdx)
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    private fun setCellValue(sheet: Sheet, rowIdx: Int, colIdx: Int, value: String) {
        val row = sheet.getRow(rowIdx) ?: sheet.createRow(rowIdx)
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    private fun setCellValueInRow(row: Row, colIdx: Int, value: String) {
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    private fun setCellNumericInRow(row: Row, colIdx: Int, value: Double) {
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.setCellValue(value)
    }

    private fun unlockCell(sheet: Sheet, rowIdx: Int, colIdx: Int, style: CellStyle) {
        val row = sheet.getRow(rowIdx) ?: sheet.createRow(rowIdx)
        val cell = row.getCell(colIdx) ?: row.createCell(colIdx)
        cell.cellStyle = style
    }

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

    private fun getCellNumeric(sheet: Sheet, rowIdx: Int, colIdx: Int): Double? {
        val row = sheet.getRow(rowIdx) ?: return null
        return getCellNumeric(row, colIdx)
    }

    private fun getCellNumeric(row: Row, colIdx: Int): Double? {
        val cell = row.getCell(colIdx) ?: return null
        return when (cell.cellType) {
            CellType.NUMERIC -> cell.numericCellValue
            CellType.STRING -> cell.stringCellValue?.toDoubleOrNull()
            else -> null
        }
    }

    private fun tryParseDate(value: String): LocalDate? {
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
}
