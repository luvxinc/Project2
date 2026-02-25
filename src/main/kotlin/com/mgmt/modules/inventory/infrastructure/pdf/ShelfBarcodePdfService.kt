package com.mgmt.modules.inventory.infrastructure.pdf

import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.client.j2se.MatrixToImageWriter
import com.google.zxing.datamatrix.DataMatrixWriter
import com.mgmt.common.exception.NotFoundException
import com.mgmt.modules.inventory.domain.model.WarehouseLocation
import com.mgmt.modules.inventory.domain.repository.WarehouseLocationRepository
import org.apache.pdfbox.pdmodel.PDDocument
import org.apache.pdfbox.pdmodel.PDPage
import org.apache.pdfbox.pdmodel.PDPageContentStream
import org.apache.pdfbox.pdmodel.common.PDRectangle
import org.apache.pdfbox.pdmodel.font.PDType1Font
import org.apache.pdfbox.pdmodel.font.Standard14Fonts
import org.apache.pdfbox.pdmodel.graphics.image.LosslessFactory
import org.apache.pdfbox.util.Matrix
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.awt.image.BufferedImage
import java.io.ByteArrayOutputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream

/**
 * ShelfBarcodePdfService — generates shelf location barcode labels.
 *
 * *** V1-PARITY LAYOUT ***
 * Page: 4"×6" thermal label, split into left/right halves.
 * Each half is a label rotated -90° with:
 *   - ECC200 DataMatrix (1.2" × 1.2") at bottom-left of rotated space
 *   - Text fields in 3 compact rows to the right of DataMatrix
 *   - Side/Level display mapping: L→Left, R→Right, G→Ground, M→Middle, T→Top
 *
 * Single download: 1 label on left half, dashed center line.
 * Batch/warehouse download: 2 labels per page (left + right), dashed center line.
 *
 * Uses PDFBox 3.0.4 + ZXing 3.5.3 (DataMatrix ECC200).
 */
@Service
class ShelfBarcodePdfService(
    private val repo: WarehouseLocationRepository,
) {

    private val log = LoggerFactory.getLogger(javaClass)

    companion object {
        const val INCH = 72f
        val PAGE_WIDTH = 4f * INCH       // 288pt
        val PAGE_HEIGHT = 6f * INCH      // 432pt

        val DM_SIZE = 1.2f * INCH
        val DM_X = 0.4f * INCH
        val DM_Y = 0.4f * INCH

        val X_COL1 = 2.0f * INCH
        val X_COL2 = 3.5f * INCH
        val X_COL3 = 4.7f * INCH

        val Y_ROW1 = 1.4f * INCH
        val Y_ROW2 = 0.9f * INCH
        val Y_ROW3 = 0.4f * INCH

        // Font sizes matching V1
        const val FONT_LABEL = 10f
        const val FONT_VALUE = 14f

        // DataMatrix image resolution
        const val DM_IMG_SIZE = 400
    }

    // ═══════════ Display Mapping ═══════════

    private fun mapSide(v: String?): String = when (v) {
        "L" -> "Left"
        "R" -> "Right"
        else -> v?.takeIf { it.isNotEmpty() } ?: "N/A"
    }

    private fun mapLevel(v: String?): String = when (v) {
        "G" -> "Ground"
        "M" -> "Middle"
        "T" -> "Top"
        else -> v?.takeIf { it.isNotEmpty() } ?: "N/A"
    }

    private fun codeVal(v: String?): String = v?.takeIf { it.isNotEmpty() } ?: "null"

    private fun buildBarcodeString(loc: WarehouseLocation): String {
        return "location_${codeVal(loc.warehouse)}_${codeVal(loc.aisle)}_${codeVal(loc.bay.toString())}_${codeVal(loc.level)}_${codeVal(loc.bin)}_${codeVal(loc.slot)}"
    }

    // ═══════════ Single Label ═══════════

    fun generateSingleLabel(barcode: String, location: WarehouseLocation): ByteArray {
        PDDocument().use { doc ->
            val page = PDPage(PDRectangle(PAGE_WIDTH, PAGE_HEIGHT))
            doc.addPage(page)

            PDPageContentStream(doc, page).use { cs ->
                // Dashed center line
                drawDashedCenterLine(cs)
                // Draw label on left half only (V1: single download = left half)
                drawLabelOnHalf(doc, cs, "left", location)
            }

            val baos = ByteArrayOutputStream()
            doc.save(baos)
            return baos.toByteArray()
        }
    }

    // ═══════════ Warehouse PDF ═══════════

    @Transactional(readOnly = true)
    fun generateWarehousePdf(warehouse: String): ByteArray {
        val locations = repo.findAllByWarehouse(warehouse.trim().uppercase())
        if (locations.isEmpty()) {
            throw NotFoundException("inventory.errors.warehouseNotFound")
        }

        val sorted = locations.sortedWith(
            compareBy({ it.aisle }, { it.bay }, { it.level }, { it.bin }, { it.slot })
        )

        return generatePairedLabelsPdf(sorted)
    }

    // ═══════════ Batch ZIP ═══════════

    @Transactional(readOnly = true)
    fun generateBatchZip(): ByteArray {
        val warehouseNames = repo.findDistinctWarehouseNames()
        if (warehouseNames.isEmpty()) {
            throw NotFoundException("inventory.errors.noWarehousesFound")
        }

        val baos = ByteArrayOutputStream()
        ZipOutputStream(baos).use { zip ->
            for (whName in warehouseNames) {
                val locations = repo.findAllByWarehouse(whName)
                if (locations.isEmpty()) continue

                val sorted = locations.sortedWith(
                    compareBy({ it.aisle }, { it.bay }, { it.level }, { it.bin }, { it.slot })
                )

                val pdfBytes = generatePairedLabelsPdf(sorted)
                zip.putNextEntry(ZipEntry("${whName}.pdf"))
                zip.write(pdfBytes)
                zip.closeEntry()

                log.info("Added {}.pdf to ZIP: {} locations", whName, sorted.size)
            }
        }

        return baos.toByteArray()
    }

    // ═══════════ Custom Labels ═══════════

    @Transactional(readOnly = true)
    fun generateCustomLabels(barcodes: List<String>): ByteArray {
        if (barcodes.isEmpty()) {
            throw NotFoundException("inventory.errors.noBarcodesProvided")
        }

        val locations = barcodes.mapNotNull { repo.findByBarcode(it) }
        if (locations.isEmpty()) {
            throw NotFoundException("inventory.errors.noLocationsFound")
        }

        return generatePairedLabelsPdf(locations)
    }

    // ═══════════ Internal: 2-labels-per-page layout ═══════════

    /**
     * Each label is rotated -90° within its half.
     */
    private fun generatePairedLabelsPdf(locations: List<WarehouseLocation>): ByteArray {
        PDDocument().use { doc ->
            var i = 0
            while (i < locations.size) {
                val page = PDPage(PDRectangle(PAGE_WIDTH, PAGE_HEIGHT))
                doc.addPage(page)

                PDPageContentStream(doc, page).use { cs ->
                    // Dashed center line
                    drawDashedCenterLine(cs)

                    // Left half (first location)
                    drawLabelOnHalf(doc, cs, "left", locations[i])

                    // Right half (second location, if exists)
                    if (i + 1 < locations.size) {
                        drawLabelOnHalf(doc, cs, "right", locations[i + 1])
                    }
                }

                i += 2
            }

            val baos = ByteArrayOutputStream()
            doc.save(baos)
            log.info("Generated paired-labels PDF: {} pages for {} locations", doc.numberOfPages, locations.size)
            return baos.toByteArray()
        }
    }

    // ═══════════ Internal: draw one label on one half ═══════════

    /**
     * Exact :
     *   Left half:  translate(0, 6") then rotate(-90°)
     *   Right half: translate(2", 6") then rotate(-90°)
     *
     * In the rotated coordinate space (6" wide × 2" tall):
     *   DataMatrix at (0.4", 0.4"), size 1.2"
     *   Row 1 (y=1.4"): Warehouse
     *   Row 2 (y=0.9"): Bay, Aisle, Bin
     *   Row 3 (y=0.4"): Level, Slot
     */
    private fun drawLabelOnHalf(
        doc: PDDocument,
        cs: PDPageContentStream,
        side: String,
        loc: WarehouseLocation
    ) {
        val fontRegular = PDType1Font(Standard14Fonts.FontName.HELVETICA)
        val fontBold = PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD)

        // Display values (V1 mapping)
        val dispWh = loc.warehouse
        val dispAisle = mapSide(loc.aisle)
        val dispBay = loc.bay.toString()
        val dispLevel = mapLevel(loc.level)
        val dispBin = loc.bin.takeIf { it.isNotEmpty() }?.let { mapSide(it) }
        val dispSlot = loc.slot.takeIf { it.isNotEmpty() }?.let { mapSide(it) }

        // Barcode string (V1 format)
        val barcodeStr = buildBarcodeString(loc)

        cs.saveGraphicsState()

        // V1: transform based on side
        if (side == "left") {
            // translate(0, 6*inch) then rotate(-90°)
            cs.transform(Matrix.getTranslateInstance(0f, PAGE_HEIGHT))
            cs.transform(Matrix.getRotateInstance(-Math.PI / 2, 0f, 0f))
        } else {
            // translate(2*inch, 6*inch) then rotate(-90°)
            cs.transform(Matrix.getTranslateInstance(2f * INCH, PAGE_HEIGHT))
            cs.transform(Matrix.getRotateInstance(-Math.PI / 2, 0f, 0f))
        }

        // --- DataMatrix ---
        try {
            val dmImage = generateDataMatrix(barcodeStr, DM_IMG_SIZE, DM_IMG_SIZE)
            val pdfImage = LosslessFactory.createFromImage(doc, dmImage)
            cs.drawImage(pdfImage, DM_X, DM_Y, DM_SIZE, DM_SIZE)
        } catch (e: Exception) {
            log.warn("Failed to generate DataMatrix for {}: {}", barcodeStr, e.message)
            cs.setStrokingColor(1f, 0f, 0f)
            cs.setLineWidth(1.5f)
            cs.addRect(DM_X, DM_Y, DM_SIZE, DM_SIZE)
            cs.stroke()
            cs.beginText()
            cs.setFont(fontBold, 10f)
            cs.setNonStrokingColor(1f, 0f, 0f)
            cs.newLineAtOffset(DM_X + DM_SIZE * 0.3f, DM_Y + DM_SIZE / 2)
            cs.showText("ERR")
            cs.endText()
            cs.setNonStrokingColor(0f, 0f, 0f)
            cs.setStrokingColor(0f, 0f, 0f)
        }

        // --- Text Fields (V1 compact 3-row layout) ---
        cs.setNonStrokingColor(0f, 0f, 0f)

        // Row 1: Warehouse
        drawField(cs, fontRegular, fontBold, X_COL1, Y_ROW1, "Warehouse:", dispWh)

        // Row 2: Bay, Aisle, Bin
        drawField(cs, fontRegular, fontBold, X_COL1, Y_ROW2, "Bay:", dispBay)
        drawField(cs, fontRegular, fontBold, X_COL2, Y_ROW2, "Aisle:", dispAisle)
        if (dispBin != null) {
            drawField(cs, fontRegular, fontBold, X_COL3, Y_ROW2, "Bin:", dispBin)
        }

        // Row 3: Level, Slot
        drawField(cs, fontRegular, fontBold, X_COL1, Y_ROW3, "Level:", dispLevel)
        if (dispSlot != null) {
            drawField(cs, fontRegular, fontBold, X_COL2, Y_ROW3, "Slot:", dispSlot)
        }

        cs.restoreGraphicsState()
    }

    /**
     * Label in Helvetica 10pt, value in Helvetica-Bold 14pt, right after label.
     */
    private fun drawField(
        cs: PDPageContentStream,
        fontRegular: PDType1Font,
        fontBold: PDType1Font,
        x: Float,
        y: Float,
        label: String,
        value: String
    ) {
        cs.beginText()
        cs.setFont(fontRegular, FONT_LABEL)
        cs.newLineAtOffset(x, y)
        cs.showText(label)
        cs.endText()

        val labelWidth = fontRegular.getStringWidth(label) / 1000f * FONT_LABEL

        cs.beginText()
        cs.setFont(fontBold, FONT_VALUE)
        cs.newLineAtOffset(x + labelWidth + 4f, y)
        cs.showText(value)
        cs.endText()
    }

    /**
     */
    private fun drawDashedCenterLine(cs: PDPageContentStream) {
        cs.setStrokingColor(0f, 0f, 0f)
        cs.setLineWidth(1f)
        cs.setLineDashPattern(floatArrayOf(4f, 4f), 0f)
        cs.moveTo(2f * INCH, 0f)
        cs.lineTo(2f * INCH, PAGE_HEIGHT)
        cs.stroke()
        cs.setLineDashPattern(floatArrayOf(), 0f) // reset dash
    }

    // ═══════════ DataMatrix Generation ═══════════

    private fun generateDataMatrix(data: String, width: Int, height: Int): BufferedImage {
        val hints = mapOf(EncodeHintType.MARGIN to 2)
        val matrix = DataMatrixWriter().encode(data, BarcodeFormat.DATA_MATRIX, width, height, hints)
        return MatrixToImageWriter.toBufferedImage(matrix)
    }
}
