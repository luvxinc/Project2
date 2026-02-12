package com.mgmt.modules.products

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import com.itextpdf.kernel.pdf.PdfDocument
import com.itextpdf.kernel.pdf.PdfWriter
import com.itextpdf.kernel.geom.PageSize
import com.itextpdf.layout.Document
import com.itextpdf.layout.element.Paragraph
import com.itextpdf.layout.element.Table
import com.itextpdf.layout.element.Cell
import com.itextpdf.layout.element.Image
import com.itextpdf.layout.properties.HorizontalAlignment
import com.itextpdf.layout.properties.TextAlignment
import com.itextpdf.layout.properties.UnitValue
import com.itextpdf.barcodes.Barcode128
import com.itextpdf.barcodes.BarcodeEAN
import com.itextpdf.kernel.font.PdfFontFactory
import com.itextpdf.io.font.constants.StandardFonts
import java.io.ByteArrayOutputStream

/**
 * BarcodeService — 条形码 PDF 生成
 *
 * V2 parity: barcode.service.ts (254 lines)
 *
 * Uses iText 9 for barcode generation (replaces bwip-js + pdfkit).
 * Generates label sheets on LETTER paper: 3 columns × 8 rows = 24 labels/page.
 */
@Service
class BarcodeService {

    private val log = LoggerFactory.getLogger(javaClass)

    data class BarcodeResult(
        val success: Boolean,
        val pdfBytes: ByteArray? = null,
        val error: String? = null,
        val skuCount: Int = 0,
        val totalLabels: Int = 0,
    )

    fun generateBarcodePdf(
        skus: List<String>,
        names: Map<String, String> = emptyMap(),
        copiesPerSku: Int = 1,
        format: String = "CODE128",
    ): BarcodeResult {
        if (skus.isEmpty()) {
            return BarcodeResult(success = false, error = "No SKUs provided", skuCount = 0, totalLabels = 0)
        }

        // Expand labels (sku × copies)
        data class Label(val sku: String, val name: String?)
        val labels = mutableListOf<Label>()
        for (sku in skus) {
            repeat(copiesPerSku) {
                labels.add(Label(sku, names[sku]))
            }
        }

        if (labels.isEmpty()) {
            return BarcodeResult(success = false, error = "Failed to generate any barcodes", skuCount = 0, totalLabels = 0)
        }

        try {
            val baos = ByteArrayOutputStream()
            val writer = PdfWriter(baos)
            val pdfDoc = PdfDocument(writer)
            pdfDoc.defaultPageSize = PageSize.LETTER
            val doc = Document(pdfDoc)
            doc.setMargins(36f, 36f, 36f, 36f) // 0.5" margins

            val font = PdfFontFactory.createFont(StandardFonts.HELVETICA)
            val fontBold = PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD)

            val labelsPerRow = 3
            val labelsPerCol = 8
            val labelsPerPage = labelsPerRow * labelsPerCol

            // Create table-based layout
            var table = createTable(labelsPerRow)

            for ((idx, label) in labels.withIndex()) {
                if (idx > 0 && idx % labelsPerPage == 0) {
                    // Finalize current table and start new page
                    doc.add(table)
                    doc.add(com.itextpdf.layout.element.AreaBreak())
                    table = createTable(labelsPerRow)
                }

                // Create barcode
                val cell = Cell().setPadding(4f).setMinHeight(80f)

                try {
                    val barcode = Barcode128(pdfDoc)
                    barcode.setCode(label.sku)
                    barcode.setFont(font)
                    barcode.setSize(7f)
                    barcode.setBarHeight(36f)

                    val barcodeImage = Image(barcode.createFormXObject(pdfDoc))
                    barcodeImage.setHorizontalAlignment(HorizontalAlignment.CENTER)
                    barcodeImage.setAutoScale(true)
                    barcodeImage.setMaxWidth(UnitValue.createPercentValue(90f).value)
                    cell.add(barcodeImage)
                } catch (e: Exception) {
                    log.warn("Failed to generate barcode for {}: {}", label.sku, e.message)
                    cell.add(Paragraph(label.sku).setFont(fontBold).setFontSize(8f).setTextAlignment(TextAlignment.CENTER))
                }

                // Product name (below barcode)
                if (!label.name.isNullOrBlank()) {
                    cell.add(
                        Paragraph(label.name)
                            .setFont(font)
                            .setFontSize(6f)
                            .setTextAlignment(TextAlignment.CENTER)
                            .setMarginTop(2f)
                    )
                }

                table.addCell(cell)
            }

            // Fill remaining cells in last row
            val remainder = labels.size % labelsPerRow
            if (remainder != 0) {
                repeat(labelsPerRow - remainder) {
                    table.addCell(Cell().setBorder(com.itextpdf.layout.borders.Border.NO_BORDER))
                }
            }

            doc.add(table)
            doc.close()

            val bytes = baos.toByteArray()
            log.info("Generated barcode PDF: {} labels for {} SKUs, {} bytes", labels.size, skus.size, bytes.size)

            return BarcodeResult(
                success = true,
                pdfBytes = bytes,
                skuCount = skus.size,
                totalLabels = labels.size,
            )
        } catch (e: Exception) {
            log.error("Failed to generate barcode PDF: {}", e.message, e)
            return BarcodeResult(success = false, error = e.message, skuCount = skus.size, totalLabels = 0)
        }
    }

    private fun createTable(cols: Int): Table {
        val table = Table(UnitValue.createPercentArray(cols))
        table.setWidth(UnitValue.createPercentValue(100f))
        return table
    }
}
