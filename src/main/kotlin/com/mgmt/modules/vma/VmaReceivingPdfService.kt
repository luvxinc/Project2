package com.mgmt.modules.vma

import com.itextpdf.forms.PdfAcroForm
import com.itextpdf.kernel.pdf.PdfDocument
import com.itextpdf.kernel.pdf.PdfReader
import com.itextpdf.kernel.pdf.PdfWriter
import com.mgmt.domain.vma.VmaInventoryTransaction
import com.mgmt.domain.vma.VmaReceivingBatch
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.Paths
import java.time.format.DateTimeFormatter

/**
 * VmaReceivingPdfService — Receiving Inspection Report PDF (模版填充)
 *
 * ═══════════════════════════════════════════════════
 * V2 PARITY: receiving-inspection-pdf.service.ts
 *
 * 严格按照 V2 方式:
 *   1. 每条产品线 → 加载 receiving-inspection.pdf AcroForm 模版
 *   2. 填充文本字段 + 勾选复选框 (9 项 PASS/FAIL + 结论)
 *   3. flatten 表单
 *   4. 多页合并成一个 PDF
 *
 * 禁止 programmatic PDF generation!
 * ═══════════════════════════════════════════════════
 *
 * PDF checkbox mapping for receiving-inspection.pdf:
 *   18 checkboxes for 9 inspection items (pairs: even=PASS, odd=FAIL)
 *   2 checkboxes for conclusion (Accept / Reject)
 *
 *   Names: undefined, undefined_2, ..., undefined_18, undefined_20, undefined_21
 */
@Service
class VmaReceivingPdfService {

    private val log = LoggerFactory.getLogger(javaClass)

    private val templatePath: Path = Paths.get(System.getProperty("user.dir"))
        .resolve("./apps/web/src/app/(dashboard)/vma/data/receiving-inspection.pdf")
        .normalize()

    companion object {
        private val DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd")

        // Checkbox field names
        val CHECKBOX_NAMES = listOf(
            "undefined",      // Item 1 PASS
            "undefined_2",    // Item 1 FAIL
            "undefined_3",    // Item 2 PASS
            "undefined_4",    // Item 2 FAIL
            "undefined_5",    // Item 3 PASS
            "undefined_6",    // Item 3 FAIL
            "undefined_7",    // Item 4 PASS
            "undefined_8",    // Item 4 FAIL
            "undefined_9",    // Item 5 PASS
            "undefined_10",   // Item 5 FAIL
            "undefined_11",   // Item 6 PASS
            "undefined_12",   // Item 6 FAIL
            "undefined_13",   // Item 7 PASS
            "undefined_14",   // Item 7 FAIL
            "undefined_15",   // Item 8 PASS
            "undefined_16",   // Item 8 FAIL
            "undefined_17",   // Item 9 PASS
            "undefined_18",   // Item 9 FAIL
        )

        const val ACCEPT_CHECKBOX = "undefined_20"
        const val REJECT_CHECKBOX = "undefined_21"
        const val COMMENTS_FIELD = "undefined_19"

        // 9 conditional inspection items (must match frontend)
        val CONDITIONAL_ITEMS = listOf(
            "Quantity received matches quantity shipped",
            "Packaging is in good condition and not damaged",
            "Sealing sticker is undamaged and remains hinged",
            "No strain or waterlogging",
            "No labels are missing or torn",
            "Printing is clear and no information missing",
            "No additional external labels",
            "Products are still within the expiration date",
            "Temperature displayed as \"OK\" and is not triggered",
        )
    }

    init {
        if (!Files.exists(templatePath)) {
            log.warn("⚠️  Receiving inspection PDF template not found at: {}", templatePath)
        } else {
            log.info("✅ PDF template loaded: {}", templatePath)
        }
    }

    /**
     * Fill one receiving-inspection PDF for a single product line.
     *
     */
    fun fillOnePdf(
        batch: VmaReceivingBatch,
        txn: VmaInventoryTransaction,
    ): ByteArray {
        require(Files.exists(templatePath)) {
            "Receiving inspection PDF template not found: $templatePath"
        }

        val templateBytes = Files.readAllBytes(templatePath)
        val baos = ByteArrayOutputStream()
        val pdfDoc = PdfDocument(
            PdfReader(ByteArrayInputStream(templateBytes)),
            PdfWriter(baos),
        )
        val form = PdfAcroForm.getAcroForm(pdfDoc, false) ?: run {
            pdfDoc.close()
            return baos.toByteArray()
        }

        // ── Text fields ──
        setTextField(form, "ManufacturerVendor", "Venus Medtech (Hangzhou)")
        setTextField(form, "PO No", batch.poNo ?: "")
        setTextField(form, "Manufacturer Lot", txn.serialNo ?: "")
        setTextField(form, "Product Identification", txn.specNo)
        setTextField(form, "Date Shipped", batch.dateShipped?.format(DATE_FMT) ?: "")
        setTextField(form, "DateTime Received",
            "${batch.dateReceived.format(DATE_FMT)} ${batch.timeReceived ?: ""}")
        setTextField(form, "Quantity Received", txn.qty.toString())
        setTextField(form, "Received By", batch.operator ?: "")
        setTextField(form, COMMENTS_FIELD, batch.comments?.trim()?.ifEmpty { "N/A" } ?: "N/A")
        setTextField(form, "Inspection By", batch.operator ?: "")

        // Date Inspected = date portion of dateReceived
        setTextField(form, "Date Inspected", batch.dateReceived.format(DATE_FMT))

        // ── Inspection item checkboxes (9 items × 2 each) ──
        val failedSet = txn.condition.toSet()

        for (item in 0 until 9) {
            val passIdx = item * 2     // even index = PASS
            val failIdx = item * 2 + 1 // odd index = FAIL

            if (failedSet.contains(item)) {
                // This item FAILED — check the FAIL checkbox
                checkBox(form, CHECKBOX_NAMES[failIdx])
            } else {
                // This item PASSED — check the PASS checkbox
                checkBox(form, CHECKBOX_NAMES[passIdx])
            }
        }

        // ── Conclusion checkboxes ──
        val isAccept = txn.inspection?.name == "ACCEPT"
        if (isAccept) {
            checkBox(form, ACCEPT_CHECKBOX)
        } else {
            checkBox(form, REJECT_CHECKBOX)
        }

        // Flatten to bake values into page content
        form.flattenFields()

        pdfDoc.close()
        return baos.toByteArray()
    }

    /**
     * Generate merged PDF for all product lines in a receiving shipment.
     *
     * Each product line → one filled template page → merge all into one PDF.
     */
    fun generateReceivingPdf(
        batch: VmaReceivingBatch,
        transactions: List<VmaInventoryTransaction>,
    ): ByteArray {
        val filledPdfs = transactions.map { txn ->
            fillOnePdf(batch, txn)
        }

        // Merge all into one PDF
        return mergePdfs(filledPdfs)
    }

    /**
     * Merge multiple PDF byte arrays into one document.
     */
    private fun mergePdfs(pdfBuffers: List<ByteArray>): ByteArray {
        if (pdfBuffers.size == 1) return pdfBuffers[0]

        val baos = ByteArrayOutputStream()
        val merged = PdfDocument(PdfWriter(baos))

        for (buf in pdfBuffers) {
            val src = PdfDocument(PdfReader(ByteArrayInputStream(buf)))
            src.copyPagesTo(1, src.numberOfPages, merged)
            src.close()
        }

        merged.close()
        return baos.toByteArray()
    }

    // ═══════════ Helpers ═══════════

    private fun setTextField(form: PdfAcroForm, name: String, value: String) {
        try {
            form.getField(name)?.setValue(value)
        } catch (e: Exception) {
            log.warn("PDF text field not found: {}", name)
        }
    }

    private fun checkBox(form: PdfAcroForm, name: String) {
        try {
            val field = form.getField(name) ?: run {
                log.warn("PDF checkbox not found: {}", name)
                return
            }
            field.setValue("Yes")
        } catch (e: Exception) {
            log.warn("PDF checkbox error '{}': {}", name, e.message)
        }
    }
}
