package com.mgmt.modules.vma

import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import com.itextpdf.forms.PdfAcroForm
import com.itextpdf.forms.fields.PdfFormField
import com.itextpdf.kernel.pdf.PdfDocument
import com.itextpdf.kernel.pdf.PdfReader
import com.itextpdf.kernel.pdf.PdfWriter
import com.itextpdf.kernel.pdf.PdfName
import com.itextpdf.kernel.pdf.PdfBoolean
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
            field.setValue(value)
            // Remove appearances so PDF viewer regenerates from template
            field.getWidgets().forEach { widget ->
                widget.pdfObject.remove(PdfName.AP)
            }
        } catch (e: Exception) {
            log.warn("PDF text field error '{}': {}", name, e.message)
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
                setText(form, "Device Name$suffix", item.deviceName)
                setText(form, "Model and Specification$suffix", item.specNo)
                setText(form, "Serial NumberLot Number$suffix", item.serialNo)
                setText(form, "Expiry Date$suffix", item.expDateFormatted)
            }

            // NeedAppearances = true (viewer will render)
            form.pdfObject.put(PdfName.NeedAppearances, PdfBoolean(true))

            // Mark all fields read-only
            form.allFormFields.values.forEach { f ->
                f.setReadOnly(true)
            }
        }

        val bytes = baos.toByteArray()
        log.info("Generated PackingList PDF for case {}: {} bytes", data.caseId, bytes.size)
        return bytes
    }
}
