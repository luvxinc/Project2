package com.mgmt.modules.products.infrastructure.barcode

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.client.j2se.MatrixToImageWriter
import com.google.zxing.datamatrix.DataMatrixWriter
import com.google.zxing.oned.Code128Writer
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream

/**
 * BarcodeGeneratorService
 *
 *
 * V1 layout (4" × 6" thermal label):
 * ─────────────────────────
 * │      [SKU: ABC]        │  Row 1: SKU barcode (full width, centered)
 * │   ═══════════════════  │  Code128 barcode, data = "S{sku}"
 * │                        │
 * │  Qty/Box: 10 │ Box/Ctn: 5  │  Row 2: Two barcodes side-by-side
 * │  ═══════════ │ ═══════════  │  Left: "Q{qty}", Right: "C{ctn}"
 * │                        │
 * │  L           [DM QR]   │  Bottom: L-mark + DataMatrix
 * ─────────────────────────
 *
 * V3 engine: ZXing + PDFBox (replaces V1 reportlab + python-barcode)
 * Layout: 100% V1 dimensions, no modifications.
 */
@Service
class BarcodeGeneratorService {

    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        const val INCH = 72f
        val PAGE_WIDTH = 4f * INCH     // 288pt
        val PAGE_HEIGHT = 6f * INCH    // 432pt

        val MARGIN = 0.25f * INCH      // 18pt

        // V1 content area
        val CONTENT_WIDTH = 3.5f * INCH  // 4" - 2*0.25"
        val HALF_WIDTH = CONTENT_WIDTH / 2

        // V1 row heights
        val ROW1_HEIGHT = 1.70f * INCH
        val ROW2_HEIGHT = 1.50f * INCH
        val ROW_GAP = 0.20f * INCH

        // V1 barcode label positioning
        val BARCODE_TOP_OFFSET = 0.12f * INCH
        val LABEL_TO_BARCODE = 0.05f * INCH

        // V1 font sizes
        const val FONT_SIZE = 15f
        const val FONT_SIZE_SMALL = 12f

        // V1 barcode generation specs: module_width=0.33mm, module_height=18mm, quiet_zone=3mm
        // At 300 DPI these translate to barcode image dimensions
        const val BARCODE_IMG_WIDTH = 600    // high res for clear print
        const val BARCODE_IMG_HEIGHT = 213   // 18mm at 300dpi ≈ 213px

        // V1 L-mark specs
        val L_MARGIN_POS = 0.10f * INCH
        val L_SIZE = 0.25f * INCH
        const val L_LINE_WIDTH = 2f

        // V1 DataMatrix specs
        val DM_SIZE = 1.2f * INCH
    }

    data class BarcodeItem(
        val sku: String,
        val qtyPerBox: Int,
        val boxPerCtn: Int,
    )

    data class BarcodeResult(
        val success: Boolean,
        val pdfBytes: ByteArray? = null,
        val error: String? = null,
        val labelCount: Int = 0,
        val successItems: List<Map<String, Any>> = emptyList(),
        val failItems: List<Map<String, Any>> = emptyList(),
    )

    /**
     * V1-compatible batch API: generates one 4"×6" PDF per item.
     * All PDFs are merged into a single multi-page document.
     *
     */
    fun generateBatch(items: List<BarcodeItem>): BarcodeResult {
        if (items.isEmpty()) {
            return BarcodeResult(success = false, error = "No items provided")
        }

        val successItems = mutableListOf<Map<String, Any>>()
        val failItems = mutableListOf<Map<String, Any>>()

        try {
            val doc = PDDocument()
            val fontBold = PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD)

            for (item in items) {
                try {
                    // Validate
                    if (item.sku.isBlank()) {
                        failItems.add(mapOf("sku" to "(empty)", "error" to "SKU cannot be empty"))
                        continue
                    }
                    if (item.qtyPerBox < 1) {
                        failItems.add(mapOf("sku" to item.sku, "error" to "Qty/Box must be > 0"))
                        continue
                    }
                    if (item.boxPerCtn < 1) {
                        failItems.add(mapOf("sku" to item.sku, "error" to "Box/Ctn must be > 0"))
                        continue
                    }

                    // Create one page per item (V1: each item = one 4×6 label)
                    generateSingleLabel(doc, fontBold, item)
                    successItems.add(mapOf(
                        "sku" to item.sku,
                        "qtyPerBox" to item.qtyPerBox,
                        "boxPerCtn" to item.boxPerCtn,
                        "displayName" to "${item.sku}.${item.qtyPerBox}->${item.boxPerCtn}.pdf",
                    ))
                } catch (e: Exception) {
                    log.warn("Failed to generate barcode for SKU {}: {}", item.sku, e.message)
                    failItems.add(mapOf("sku" to item.sku, "error" to (e.message ?: "Unknown error")))
                }
            }

            if (doc.numberOfPages == 0) {
                doc.close()
                return BarcodeResult(
                    success = false,
                    error = "No valid labels generated",
                    successItems = successItems,
                    failItems = failItems,
                )
            }

            val baos = ByteArrayOutputStream()
            doc.save(baos)
            doc.close()
            val bytes = baos.toByteArray()

            log.info("Generated barcode PDF: {} labels ({} success, {} fail), {} bytes",
                items.size, successItems.size, failItems.size, bytes.size)

            return BarcodeResult(
                success = true,
                pdfBytes = bytes,
                labelCount = successItems.size,
                successItems = successItems,
                failItems = failItems,
            )
        } catch (e: Exception) {
            log.error("Failed to generate barcode PDF: {}", e.message, e)
            return BarcodeResult(success = false, error = e.message)
        }
    }

    /**
     * Generate a single 4"×6" label page. Strict V1 layout.
     *
     */
    private fun generateSingleLabel(
        doc: PDDocument,
        fontBold: PDType1Font,
        item: BarcodeItem,
    ) {
        val pageRect = PDRectangle(PAGE_WIDTH, PAGE_HEIGHT)
        val page = PDPage(pageRect)
        doc.addPage(page)
        val cs = PDPageContentStream(doc, page)

        // V1 row positions (Y from top of page, PDF coords from bottom)
        val row1Top = PAGE_HEIGHT - MARGIN                    // 5.75" from bottom
        val row1Bottom = row1Top - ROW1_HEIGHT                // 4.05"
        val row2Top = row1Bottom - ROW_GAP                    // 3.85"
        // row2Bottom = row2Top - ROW2_HEIGHT                 // 2.35"

        // ===== Row 1: SKU barcode (full width centered) =====
        val centerX = PAGE_WIDTH / 2
        val barcodeDataSku = "S${item.sku}"
        drawBarcodeCentered(
            doc, cs, fontBold,
            barcodeData = barcodeDataSku,
            labelText = "SKU: ${item.sku.uppercase()}",
            blockTop = row1Top,
            centerXPos = centerX,
            maxWidth = CONTENT_WIDTH,
            fontSize = FONT_SIZE,
        )

        // ===== Row 2: Qty/Box + Box/Ctn side by side =====
        val leftCenter = MARGIN + HALF_WIDTH / 2
        val rightCenter = MARGIN + HALF_WIDTH + HALF_WIDTH / 2

        // Qty/Box (left)
        val barcodeDataQty = "Q${item.qtyPerBox}"
        drawBarcodeCentered(
            doc, cs, fontBold,
            barcodeData = barcodeDataQty,
            labelText = "Qty/Box: ${item.qtyPerBox}",
            blockTop = row2Top,
            centerXPos = leftCenter,
            maxWidth = HALF_WIDTH - 0.1f * INCH,
            fontSize = FONT_SIZE_SMALL,
        )

        // Box/Ctn (right)
        val barcodeDataCtn = "C${item.boxPerCtn}"
        drawBarcodeCentered(
            doc, cs, fontBold,
            barcodeData = barcodeDataCtn,
            labelText = "Box/Ctn: ${item.boxPerCtn}",
            blockTop = row2Top,
            centerXPos = rightCenter,
            maxWidth = HALF_WIDTH - 0.1f * INCH,
            fontSize = FONT_SIZE_SMALL,
        )

        // ===== Bottom: L-registration mark (bottom-left) =====
        cs.setStrokingColor(0f, 0f, 0f)
        cs.setLineWidth(L_LINE_WIDTH)
        val lX = L_MARGIN_POS
        val lY = L_MARGIN_POS
        // Horizontal line
        cs.moveTo(lX, lY)
        cs.lineTo(lX + L_SIZE, lY)
        cs.stroke()
        // Vertical line
        cs.moveTo(lX, lY)
        cs.lineTo(lX, lY + L_SIZE)
        cs.stroke()

        // ===== Bottom: DataMatrix QR code (bottom-right) =====
        val dmData = "${item.sku}|${item.qtyPerBox}|${item.boxPerCtn}"
        try {
            val dmImage = generateDataMatrix(dmData, 300, 300)
            val pdfImage = LosslessFactory.createFromImage(doc, dmImage)
            val dmRight = PAGE_WIDTH - MARGIN
            val dmLeft = dmRight - DM_SIZE
            val dmBottom = MARGIN
            cs.drawImage(pdfImage, dmLeft, dmBottom, DM_SIZE, DM_SIZE)
        } catch (e: Exception) {
            log.warn("Failed to generate DataMatrix for SKU {}: {}", item.sku, e.message)
            // Draw visible error indicator (bordered box + "DM ERR" text)
            val dmRight = PAGE_WIDTH - MARGIN
            val dmLeft = dmRight - DM_SIZE
            val dmBottom = MARGIN
            // Draw error border
            cs.setStrokingColor(1f, 0f, 0f)  // Red border
            cs.setLineWidth(1.5f)
            cs.addRect(dmLeft, dmBottom, DM_SIZE, DM_SIZE)
            cs.stroke()
            // Draw error text
            cs.beginText()
            cs.setFont(fontBold, 10f)
            cs.setNonStrokingColor(1f, 0f, 0f)  // Red text
            cs.newLineAtOffset(dmLeft + DM_SIZE * 0.2f, dmBottom + DM_SIZE / 2)
            cs.showText("DM ERR")
            cs.endText()
            cs.setNonStrokingColor(0f, 0f, 0f)  // Reset to black
            cs.setStrokingColor(0f, 0f, 0f)
        }

        cs.close()
    }

    /**
     * Draws a label text + Code128 barcode, centered at the given position.
     */
    private fun drawBarcodeCentered(
        doc: PDDocument,
        cs: PDPageContentStream,
        fontBold: PDType1Font,
        barcodeData: String,
        labelText: String,
        blockTop: Float,
        centerXPos: Float,
        maxWidth: Float,
        fontSize: Float,
    ) {
        // Generate barcode image
        val barcodeImage = generateCode128(barcodeData, BARCODE_IMG_WIDTH, BARCODE_IMG_HEIGHT)
        val pdfImage = LosslessFactory.createFromImage(doc, barcodeImage)

        // V1: scale barcode to fit maxWidth, preserving aspect ratio
        val imgAspect = BARCODE_IMG_HEIGHT.toFloat() / BARCODE_IMG_WIDTH.toFloat()
        val drawW: Float
        val drawH: Float
        val nativeWidthPt = BARCODE_IMG_WIDTH.toFloat() / 300f * INCH  // convert px@300dpi to pt
        if (nativeWidthPt > maxWidth) {
            drawW = maxWidth
            drawH = maxWidth * imgAspect
        } else {
            drawW = nativeWidthPt
            drawH = nativeWidthPt * imgAspect
        }

        // V1: label position
        val labelY = blockTop - BARCODE_TOP_OFFSET - fontSize * 0.4f

        // V1: barcode position (below label)
        val barcodeTop = labelY - LABEL_TO_BARCODE
        val barcodeBottom = barcodeTop - drawH
        val barcodeLeft = centerXPos - drawW / 2

        // Draw label text (centered)
        cs.beginText()
        cs.setFont(fontBold, fontSize)
        val textWidth = fontBold.getStringWidth(labelText) / 1000f * fontSize
        cs.newLineAtOffset(centerXPos - textWidth / 2, labelY)
        cs.showText(labelText)
        cs.endText()

        // Draw barcode image
        cs.drawImage(pdfImage, barcodeLeft, barcodeBottom, drawW, drawH)
    }

    /**
     * Generate Code128 barcode image.
     * V1 specs: module_width=0.33mm, module_height=18mm, quiet_zone=3mm
     */
    private fun generateCode128(data: String, width: Int, height: Int): BufferedImage {
        val hints = mapOf(EncodeHintType.MARGIN to 8) // quiet zone
        val matrix = Code128Writer().encode(data, BarcodeFormat.CODE_128, width, height, hints)
        return MatrixToImageWriter.toBufferedImage(matrix)
    }

    /**
     * Generate DataMatrix (ECC200) image.
     * V1: createBarcodeDrawing('ECC200DataMatrix', value=dm_data)
     */
    private fun generateDataMatrix(data: String, width: Int, height: Int): BufferedImage {
        val hints = mapOf(EncodeHintType.MARGIN to 2)
        val matrix = DataMatrixWriter().encode(data, BarcodeFormat.DATA_MATRIX, width, height, hints)
        return MatrixToImageWriter.toBufferedImage(matrix)
    }
}
