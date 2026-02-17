package com.mgmt.modules.products.infrastructure.barcode

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.client.j2se.MatrixToImageWriter
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
 * BarcodeGeneratorService — V1 functional parity, V3 architecture.
 *
 * V1 layout: 3 columns × 8 rows = 24 labels per LETTER page.
 * V1 format: Code128 barcode + SKU text + product name.
 * V3 engine: ZXing + PDFBox (replaces V1 iText — architectural upgrade).
 *
 * API signature matches V1 exactly:
 *   generateBarcodePdf(skus, names, copiesPerSku, format) → BarcodeResult
 */
@Service
class BarcodeGeneratorService {

    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        // V1 parity: LETTER page (8.5" × 11" = 612pt × 792pt)
        const val PAGE_WIDTH = 612f
        const val PAGE_HEIGHT = 792f

        // V1 parity: 0.5" margins (36pt)
        const val MARGIN_LEFT = 36f
        const val MARGIN_RIGHT = 36f
        const val MARGIN_TOP = 36f
        const val MARGIN_BOTTOM = 36f

        // V1 parity: 3 columns × 8 rows = 24 labels per page
        const val COLS = 3
        const val ROWS = 8

        // Barcode image dimensions (pixels, for ZXing generation)
        const val BARCODE_IMG_WIDTH = 200
        const val BARCODE_IMG_HEIGHT = 50
    }

    data class BarcodeResult(
        val success: Boolean,
        val pdfBytes: ByteArray? = null,
        val error: String? = null,
        val labelCount: Int = 0,
    )

    /**
     * V1-compatible API: generates barcode PDF with grid layout.
     *
     * @param skus       List of SKU strings to generate barcodes for
     * @param names      Map of SKU → product name for label text
     * @param copiesPerSku Number of copies per SKU
     * @param format     Barcode format (currently only CODE128 supported)
     * @return BarcodeResult with PDF bytes
     */
    fun generateBarcodePdf(
        skus: List<String>,
        names: Map<String, String> = emptyMap(),
        copiesPerSku: Int = 1,
        format: String = "CODE128",
    ): BarcodeResult {
        if (skus.isEmpty()) {
            return BarcodeResult(success = false, error = "No SKUs provided")
        }

        // V1 parity: expand SKUs by copiesPerSku
        val expandedSkus = skus.flatMap { sku -> List(copiesPerSku) { sku } }

        try {
            val doc = PDDocument()
            val fontRegular = PDType1Font(Standard14Fonts.FontName.HELVETICA)
            val fontBold = PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD)

            // Calculate cell dimensions
            val usableWidth = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT
            val usableHeight = PAGE_HEIGHT - MARGIN_TOP - MARGIN_BOTTOM
            val cellWidth = usableWidth / COLS
            val cellHeight = usableHeight / ROWS
            val labelsPerPage = COLS * ROWS

            // Process all expanded SKUs
            var labelIndex = 0
            while (labelIndex < expandedSkus.size) {
                val page = PDPage(PDRectangle.LETTER)
                doc.addPage(page)
                val cs = PDPageContentStream(doc, page)

                // Fill page with labels
                for (slot in 0 until labelsPerPage) {
                    if (labelIndex >= expandedSkus.size) break

                    val col = slot % COLS
                    val row = slot / COLS

                    val cellX = MARGIN_LEFT + col * cellWidth
                    // PDF coordinate system: Y=0 at bottom
                    val cellY = PAGE_HEIGHT - MARGIN_TOP - (row + 1) * cellHeight

                    val sku = expandedSkus[labelIndex]
                    val productName = names[sku] ?: ""

                    // Generate barcode image
                    try {
                        val barcodeImage = generateCode128(sku, BARCODE_IMG_WIDTH, BARCODE_IMG_HEIGHT)
                        val pdfImage = LosslessFactory.createFromImage(doc, barcodeImage)

                        // Scale barcode to fit cell width with padding
                        val padding = 4f
                        val imgWidth = cellWidth - padding * 2
                        val imgHeight = imgWidth * BARCODE_IMG_HEIGHT / BARCODE_IMG_WIDTH

                        // Draw barcode image (centered horizontally in cell)
                        val barcodeY = cellY + cellHeight - 8f - imgHeight
                        cs.drawImage(pdfImage, cellX + padding, barcodeY, imgWidth, imgHeight)

                        // Draw SKU text below barcode
                        val skuY = barcodeY - 10f
                        cs.beginText()
                        cs.setFont(fontBold, 7f)
                        cs.newLineAtOffset(cellX + padding, skuY)
                        cs.showText(sku)
                        cs.endText()

                        // Draw product name if available (truncated)
                        if (productName.isNotBlank()) {
                            val nameY = skuY - 9f
                            cs.beginText()
                            cs.setFont(fontRegular, 6f)
                            cs.newLineAtOffset(cellX + padding, nameY)
                            cs.showText(productName.take(30))
                            cs.endText()
                        }
                    } catch (e: Exception) {
                        log.warn("Failed to generate barcode for SKU {}: {}", sku, e.message)
                        // Draw error text in cell
                        cs.beginText()
                        cs.setFont(fontRegular, 6f)
                        cs.newLineAtOffset(cellX + 4f, cellY + cellHeight / 2)
                        cs.showText("ERR: $sku")
                        cs.endText()
                    }

                    labelIndex++
                }

                cs.close()
            }

            val baos = ByteArrayOutputStream()
            doc.save(baos)
            doc.close()
            val bytes = baos.toByteArray()
            log.info("Generated barcode PDF: {} labels, {} bytes", expandedSkus.size, bytes.size)
            return BarcodeResult(success = true, pdfBytes = bytes, labelCount = expandedSkus.size)
        } catch (e: Exception) {
            log.error("Failed to generate barcode PDF: {}", e.message, e)
            return BarcodeResult(success = false, error = e.message)
        }
    }

    private fun generateCode128(data: String, width: Int, height: Int): BufferedImage {
        val hints = mapOf(EncodeHintType.MARGIN to 1)
        val matrix = Code128Writer().encode(data, BarcodeFormat.CODE_128, width, height, hints)
        return MatrixToImageWriter.toBufferedImage(matrix)
    }
}
