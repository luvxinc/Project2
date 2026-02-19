package com.mgmt.modules.vma

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import com.itextpdf.forms.PdfAcroForm
import com.itextpdf.forms.fields.PdfFormField
import com.itextpdf.kernel.pdf.PdfDocument
import com.itextpdf.kernel.pdf.PdfReader
import com.itextpdf.kernel.pdf.PdfWriter
import com.itextpdf.kernel.pdf.PdfName
import com.itextpdf.kernel.pdf.canvas.PdfCanvas
import com.itextpdf.kernel.pdf.xobject.PdfFormXObject
import com.itextpdf.kernel.font.PdfFontFactory
import com.itextpdf.kernel.geom.Rectangle
import com.itextpdf.io.font.constants.StandardFonts
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.nio.file.Files
import java.nio.file.Path
import java.time.LocalDate

/**
 * VmaPackingListPdfService — 临床案例 Packing List PDF 生成
 *
 * V2 parity: packing-list-pdf.service.ts (164 lines)
 *
 * Fills AcroForm template with site info, case reference, and product table.
 * Template supports 28 rows across 2 pages (Row1–Row14, Row1_2–Row14_2).
 */
@Service
class VmaPackingListPdfService {

    private val log = LoggerFactory.getLogger(javaClass)

    private val months = arrayOf(
        "Jan", "Feb", "Mar", "Apr", "May", "Jun",
        "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
    )

    data class SiteInfo(
        val siteName: String,
        val address: String,
        val address2: String?,
        val city: String,
        val state: String,
        val zipCode: String,
        val country: String,
    )

    data class PackingItem(
        val itemNo: Int,
        val specNo: String,
        val serialNo: String,
        val expDate: String,
        val expDateFormatted: String,
        val deviceName: String,
    )

    data class PackingListData(
        val caseId: String,
        val caseDate: String,  // YYYY-MM-DD
        val site: SiteInfo,
        val items: List<PackingItem>,
    )

    private fun formatEmailDate(dateStr: String): String {
        val d = LocalDate.parse(dateStr)
        return "${months[d.monthValue - 1]} _____ , ${d.year}"
    }

    private fun setText(form: PdfAcroForm, name: String, value: String) {
        try {
            val field = form.getField(name) ?: run {
                log.warn("PDF text field not found: {}", name)
                return
            }
            // Use Helvetica to avoid template CJK font mangling ASCII chars like '
            val font = PdfFontFactory.createFont(StandardFonts.HELVETICA)
            field.setFont(font)
            field.setValue(value)
        } catch (e: Exception) {
            log.warn("PDF text field error '{}': {}", name, e.message)
        }
    }

    /**
     * Draw text directly on the PDF page at the field's location, vertically centered.
     * Bypasses AcroForm rendering entirely — most reliable for precise positioning.
     * Reads the font size from the field's Default Appearance (DA) to match template styling.
     * Clears the field value to prevent duplicate text from NeedAppearances.
     */
    private fun drawTextCentered(pdfDoc: PdfDocument, form: PdfAcroForm, name: String, value: String) {
        try {
            val field = form.getField(name) ?: run {
                log.warn("PDF text field not found: {}", name)
                return
            }
            val widget = field.getWidgets().firstOrNull() ?: return
            val rect = widget.rectangle.toRectangle()

            // Extract font size from the field's DA (Default Appearance) string, e.g. "/Helv 10 Tf"
            val daStr = field.pdfObject.getAsString(PdfName.DA)?.value ?: ""
            val sizeMatch = Regex("""(\d+(?:\.\d+)?)\s+Tf""").find(daStr)
            val fontSize = sizeMatch?.groupValues?.get(1)?.toFloatOrNull() ?: 10f

            // Find which page this widget is on
            val page = widget.page ?: pdfDoc.getPage(1)

            val font = PdfFontFactory.createFont(StandardFonts.HELVETICA)
            val textWidth = font.getWidth(value, fontSize)
            // Position at absolute page coordinates, centered in the field rect
            val x = rect.x + (rect.width - textWidth) / 2f
            val y = rect.y + (rect.height - fontSize) / 2f

            val canvas = PdfCanvas(page)
            canvas.beginText()
                .setFontAndSize(font, fontSize)
                .moveText(x.toDouble(), y.toDouble())
                .showText(value)
                .endText()

            // Clear field value so NeedAppearances doesn't render duplicate text
            field.setValue("")
            widget.pdfObject.remove(PdfName.AP)
        } catch (e: Exception) {
            log.warn("PDF drawTextCentered error '{}': {}", name, e.message)
        }
    }

    fun generate(data: PackingListData, templatePath: Path): ByteArray {
        require(Files.exists(templatePath)) { "PackingList PDF template not found: $templatePath" }

        val templateBytes = Files.readAllBytes(templatePath)
        val baos = ByteArrayOutputStream()

        PdfDocument(
            PdfReader(ByteArrayInputStream(templateBytes)),
            PdfWriter(baos),
        ).use { pdfDoc ->
            val form = PdfAcroForm.getAcroForm(pdfDoc, true)

            // 1. Site / Ship-To fields
            setText(form, "SiteName", data.site.siteName)

            if (!data.site.address2.isNullOrBlank()) {
                setText(form, "SiteAddress1", data.site.address)
                setText(form, "SiteAddress2", data.site.address2)
                setText(form, "SiteState", "${data.site.city}, ${data.site.state} ${data.site.zipCode}")
                setText(form, "SiteCountry", data.site.country)
            } else {
                setText(form, "SiteAddress1", data.site.address)
                setText(form, "SiteAddress2", "${data.site.city}, ${data.site.state} ${data.site.zipCode}")
                setText(form, "SiteState", data.site.country)
            }

            // 2. Reference & Date
            setText(form, "Reference", data.caseId)
            setText(form, "emailDate", formatEmailDate(data.caseDate))

            // 3. Product table (page 1: Row1-Row14, page 2: Row1_2-Row14_2)
            for (i in data.items.indices) {
                if (i >= 28) break
                val item = data.items[i]
                val suffix = if (i < 14) "Row${i + 1}" else "Row${i - 13}_2"

                setText(form, "Items$suffix", item.itemNo.toString())
                // P-Valve: two lines (normal setText), DS: single line (vertically centered)
                if (item.deviceName.contains("\n")) {
                    setText(form, "Device Name$suffix", item.deviceName)
                } else {
                    drawTextCentered(pdfDoc, form, "Device Name$suffix", item.deviceName)
                }
                setText(form, "Model and Specification$suffix", item.specNo)
                setText(form, "Serial NumberLot Number$suffix", item.serialNo)
                setText(form, "Expiry Date$suffix", item.expDateFormatted)
            }

            // Flatten form — bake all field values into static content
            form.flattenFields()
        }

        val bytes = baos.toByteArray()
        log.info("Generated PackingList PDF for case {}: {} bytes", data.caseId, bytes.size)
        return bytes
    }
}
