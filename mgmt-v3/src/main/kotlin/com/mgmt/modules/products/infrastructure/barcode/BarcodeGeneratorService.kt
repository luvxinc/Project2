package com.mgmt.modules.products.infrastructure.barcode

import com.mgmt.modules.products.application.dto.BarcodeItem
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.client.j2se.MatrixToImageWriter
import com.google.zxing.oned.Code128Writer
import com.google.zxing.datamatrix.DataMatrixWriter
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
 * BarcodeGeneratorService — ZXing + PDFBox implementation.
 *
 * V3 architecture §3.10 compliance.
 * V1 parity: 4"x6" label format with Code128 + DataMatrix.
 *
 * Label Layout (4" x 6" = 288pt x 432pt):
 *   Row 1: SKU barcode (Code128, full width)
 *   Row 2: QTY/BOX (left) + BOX/CTN (right, Code128)
 *   Row 3: L-locator (left) + DataMatrix (right, "SKU|QTY|BOX")
 *
 * Memory-only generation — no file persistence per A6 decision.
 */
@Service
class BarcodeGeneratorService {

    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        const val LABEL_WIDTH = 288f
        const val LABEL_HEIGHT = 432f
        const val MARGIN = 10f
        const val CODE128_WIDTH = 260
        const val CODE128_HEIGHT = 70
        const val CODE128_SMALL_WIDTH = 120
        const val CODE128_SMALL_HEIGHT = 50
        const val DATAMATRIX_SIZE = 60
        const val FONT_SIZE = 8f
    }

    private val fontRegular = PDType1Font(Standard14Fonts.FontName.HELVETICA)
    private val fontBold = PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD)

    data class BarcodeResult(
        val success: Boolean,
        val pdfBytes: ByteArray? = null,
        val error: String? = null,
        val labelCount: Int = 0,
    )

    fun generate(items: List<BarcodeItem>, skuNames: Map<String, String> = emptyMap()): BarcodeResult {
        if (items.isEmpty()) {
            return BarcodeResult(success = false, error = "No items provided")
        }

        try {
            val doc = PDDocument()
            for (item in items) {
                addLabelPage(doc, item, skuNames[item.sku] ?: "")
            }
            val baos = ByteArrayOutputStream()
            doc.save(baos)
            doc.close()
            val bytes = baos.toByteArray()
            log.info("Generated barcode PDF: {} labels, {} bytes", items.size, bytes.size)
            return BarcodeResult(success = true, pdfBytes = bytes, labelCount = items.size)
        } catch (e: Exception) {
            log.error("Failed to generate barcode PDF: {}", e.message, e)
            return BarcodeResult(success = false, error = e.message)
        }
    }

    private fun addLabelPage(doc: PDDocument, item: BarcodeItem, productName: String) {
        val page = PDPage(PDRectangle(LABEL_WIDTH, LABEL_HEIGHT))
        doc.addPage(page)
        val cs = PDPageContentStream(doc, page)
        var yPos = LABEL_HEIGHT - MARGIN - 20f

        // Row 1: SKU Barcode (Code128, full width)
        try {
            val skuBarcode = generateCode128(item.sku, CODE128_WIDTH, CODE128_HEIGHT)
            val skuImage = LosslessFactory.createFromImage(doc, skuBarcode)
            val imgWidth = LABEL_WIDTH - 2 * MARGIN
            val imgHeight = imgWidth * CODE128_HEIGHT / CODE128_WIDTH
            cs.drawImage(skuImage, MARGIN, yPos - imgHeight, imgWidth, imgHeight)
            yPos -= imgHeight + 5f
        } catch (e: Exception) {
            log.warn("Failed to generate SKU barcode for {}: {}", item.sku, e.message)
        }

        // SKU text
        cs.beginText()
        cs.setFont(fontBold, 10f)
        cs.newLineAtOffset(MARGIN, yPos)
        cs.showText(item.sku)
        cs.endText()
        yPos -= 15f

        // Product name
        if (productName.isNotBlank()) {
            cs.beginText()
            cs.setFont(fontRegular, FONT_SIZE)
            cs.newLineAtOffset(MARGIN, yPos)
            cs.showText(productName.take(40))
            cs.endText()
            yPos -= 15f
        }

        // Row 2: QTY/BOX (left) + BOX/CTN (right)
        yPos -= 10f
        val halfWidth = (LABEL_WIDTH - 2 * MARGIN - 10f) / 2

        try {
            val qtyBarcode = generateCode128("QTY:${item.qtyPerBox}", CODE128_SMALL_WIDTH, CODE128_SMALL_HEIGHT)
            val qtyImage = LosslessFactory.createFromImage(doc, qtyBarcode)
            val scaledH = CODE128_SMALL_HEIGHT * halfWidth / CODE128_SMALL_WIDTH
            cs.drawImage(qtyImage, MARGIN, yPos - scaledH, halfWidth, scaledH)
        } catch (e: Exception) {
            log.warn("QTY barcode generation failed: {}", e.message)
        }

        try {
            val boxBarcode = generateCode128("BOX:${item.boxPerCtn}", CODE128_SMALL_WIDTH, CODE128_SMALL_HEIGHT)
            val boxImage = LosslessFactory.createFromImage(doc, boxBarcode)
            val scaledH = CODE128_SMALL_HEIGHT * halfWidth / CODE128_SMALL_WIDTH
            cs.drawImage(boxImage, MARGIN + halfWidth + 10f, yPos - scaledH, halfWidth, scaledH)
        } catch (e: Exception) {
            log.warn("BOX barcode generation failed: {}", e.message)
        }

        val scaledSmallH = CODE128_SMALL_HEIGHT * halfWidth / CODE128_SMALL_WIDTH
        yPos -= scaledSmallH + 5f

        cs.beginText()
        cs.setFont(fontRegular, FONT_SIZE)
        cs.newLineAtOffset(MARGIN, yPos)
        cs.showText("QTY/BOX: ${item.qtyPerBox}")
        cs.endText()

        cs.beginText()
        cs.setFont(fontRegular, FONT_SIZE)
        cs.newLineAtOffset(MARGIN + halfWidth + 10f, yPos)
        cs.showText("BOX/CTN: ${item.boxPerCtn}")
        cs.endText()
        yPos -= 20f

        // Row 3: DataMatrix (SKU|QTY|BOX)
        try {
            val dmData = "${item.sku}|${item.qtyPerBox}|${item.boxPerCtn}"
            val dmImage = generateDataMatrix(dmData, DATAMATRIX_SIZE, DATAMATRIX_SIZE)
            val dmPdfImage = LosslessFactory.createFromImage(doc, dmImage)
            cs.drawImage(dmPdfImage, LABEL_WIDTH - MARGIN - DATAMATRIX_SIZE, yPos - DATAMATRIX_SIZE,
                DATAMATRIX_SIZE.toFloat(), DATAMATRIX_SIZE.toFloat())

            cs.beginText()
            cs.setFont(fontBold, 14f)
            cs.newLineAtOffset(MARGIN, yPos - DATAMATRIX_SIZE / 2f)
            cs.showText("L")
            cs.endText()
        } catch (e: Exception) {
            log.warn("DataMatrix generation failed: {}", e.message)
        }

        cs.close()
    }

    private fun generateCode128(data: String, width: Int, height: Int): BufferedImage {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = Code128Writer().encode(data, BarcodeFormat.CODE_128, width, height, hints)
        return MatrixToImageWriter.toBufferedImage(matrix)
    }

    private fun generateDataMatrix(data: String, width: Int, height: Int): BufferedImage {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = DataMatrixWriter().encode(data, BarcodeFormat.DATA_MATRIX, width, height, hints)
        return MatrixToImageWriter.toBufferedImage(matrix)
    }
}
