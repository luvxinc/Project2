package com.mgmt.modules.vma

import com.itextpdf.forms.PdfAcroForm
import com.itextpdf.kernel.colors.ColorConstants
import com.itextpdf.kernel.colors.DeviceRgb
import com.itextpdf.kernel.font.PdfFontFactory
import com.itextpdf.kernel.geom.PageSize
import com.itextpdf.kernel.pdf.PdfDocument
import com.itextpdf.kernel.pdf.PdfReader
import com.itextpdf.kernel.pdf.PdfWriter
import com.itextpdf.kernel.pdf.canvas.PdfCanvas
import com.itextpdf.io.font.constants.StandardFonts
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * VmaPdfGeneratorService — PDF 模板填充 + SOP 列表页 + 合并
 *
 * V2 parity: pdf-generator.service.ts (339 lines)
 * Uses iText 9 (Java) instead of pdf-lib (JS).
 *
 * Features:
 *   - Fill vma-training.pdf AcroForm template
 *   - Generate SOP list pages (auto-pagination)
 *   - Merge multiple PDFs
 *   - Zero disk persistence (all in-memory ByteArray)
 */
@Service
class VmaPdfGeneratorService {

    private val log = LoggerFactory.getLogger(javaClass)

    private val templateDir: java.nio.file.Path = java.nio.file.Paths.get(System.getProperty("user.dir"))
        .resolve("./apps/web/src/app/(dashboard)/vma/data")
        .normalize()

    // Dropdown field name map (V2 parity)
    private val deptDropdownMap = mapOf(
        1 to "Dropdown2", 2 to "Dropdown3", 3 to "Dropdown4", 4 to "Dropdown5",
        5 to "Dropdown6", 6 to "Dropdown7", 7 to "Dropdown8", 8 to "Dropdown9",
        9 to "Dropdown10", 10 to "Dropdown11", 11 to "Dropdown12",
        18 to "Dropdown13", 19 to "Dropdown14", 20 to "Dropdown15",
        21 to "Dropdown16", 22 to "Dropdown17", 23 to "Dropdown18",
    )

    data class SessionData(
        val trainingNo: String,
        val trainingDate: Instant,
        val trainingSubject: String,
        val trainingObjective: String = "Ensure understanding of updated working procedures and responsibilities",
        val evaluationMethod: String, // "oral_qa" | "self_training"
        val lecturerName: String,
        val timeStart: String,
        val timeEnd: String,
        val employees: List<EmployeeEntry>,
        val sops: List<SopEntry>,
    )

    data class EmployeeEntry(val employeeNo: String, val departmentCode: String)
    data class SopEntry(val sopNo: String, val sopName: String, val version: String)

    // ═══════════ Public API ═══════════

    fun generateSessionPdf(session: SessionData): ByteArray {
        val filledPdf = fillTrainingPdf(session)
        val listPdf = generateListPdf(session)
        return mergePdfs(listOf(filledPdf, listPdf))
    }

    fun generateAllSessionsPdf(sessions: List<SessionData>): ByteArray {
        val pdfs = sessions.map { generateSessionPdf(it) }
        return mergePdfs(pdfs)
    }

    // ═══════════ Template Filler ═══════════

    private fun fillTrainingPdf(session: SessionData): ByteArray {
        val templatePath = templateDir.resolve("vma-training.pdf")
        if (!java.nio.file.Files.exists(templatePath)) {
            log.warn("PDF template not found at $templatePath, generating list-only PDF")
            return generateListPdf(session)
        }

        val baos = ByteArrayOutputStream()
        val reader = PdfReader(templatePath.toString())
        val pdfDoc = PdfDocument(reader, PdfWriter(baos))
        val form = PdfAcroForm.getAcroForm(pdfDoc, false)

        if (form != null) {
            setTextField(form, "DocNum", session.trainingNo)
            setTextField(form, "Training Subjects", session.trainingSubject)
            setTextField(form, "Training Objectives", session.trainingObjective)
            setTextField(form, "Place of Training", "On-Site")

            // Date: MMM-DD-YYYY
            val dateFormatter = DateTimeFormatter.ofPattern("MMM-dd-yyyy")
                .withZone(ZoneId.of("America/Los_Angeles"))
            val dateStr = dateFormatter.format(session.trainingDate)
            setTextField(form, "Record Date", dateStr)

            val timeStr = "${session.timeStart} - ${session.timeEnd} PST"
            setTextField(form, "Written Examinations Oral QA Job Practice Evaluation OthersTime of Training", dateStr)
            setTextField(form, "Duration", timeStr)

            // Checkboxes
            if (session.evaluationMethod == "oral_qa") {
                try { form.getField("Check Box2")?.setValue("Yes") } catch (_: Exception) {}
            } else {
                try { form.getField("Check Box4")?.setValue("Yes") } catch (_: Exception) {}
                setTextField(form, "Others", "Self-Training")
            }

            // Lecturer dropdown
            try {
                val lecturerField = form.getField("Lecturer")
                if (lecturerField != null) {
                    // Try to match lecturer name
                    lecturerField.setValue(session.lecturerName)
                }
            } catch (_: Exception) {}

            // Employees sign-in (max 34)
            val maxPerSide = 17
            for (i in session.employees.indices) {
                if (i >= 34) break
                val emp = session.employees[i]
                val side = if (i < maxPerSide) 1 else 2
                val row = if (i < maxPerSide) i + 1 else i - maxPerSide + 1

                val empFieldName = if (side == 1) "Employee NoRow$row" else "Employee NoRow${row}_2"
                setTextField(form, empFieldName, emp.employeeNo)

                val deptFieldIdx = i + 1
                val deptFieldName = deptDropdownMap[deptFieldIdx]
                if (deptFieldName != null) {
                    try {
                        val dropdown = form.getField(deptFieldName)
                        dropdown?.setValue(emp.departmentCode)
                    } catch (_: Exception) {}
                }
            }

            // Assessment
            setTextField(form, "Num of Attend", session.employees.size.toString())
            setTextField(form, "Num of Pass", session.employees.size.toString())

            form.flattenFields()
        }

        pdfDoc.close()
        return baos.toByteArray()
    }

    // ═══════════ SOP List PDF Generator ═══════════

    private fun generateListPdf(session: SessionData): ByteArray {
        val baos = ByteArrayOutputStream()
        val pdfDoc = PdfDocument(PdfWriter(baos))
        val font = PdfFontFactory.createFont(StandardFonts.HELVETICA)
        val fontBold = PdfFontFactory.createFont(StandardFonts.HELVETICA_BOLD)

        val pageWidth = PageSize.LETTER.width
        val pageHeight = PageSize.LETTER.height
        val margin = 40f
        val tableWidth = pageWidth - 2 * margin
        val rowHeight = 22f
        val pageBottom = 60f

        // Column definitions
        val colRatios = floatArrayOf(0.20f, 0.50f, 0.10f, 0.20f)
        val colLabels = arrayOf("Document No.", "Document Title", "Rev.", "Trainer (Print)")
        val colWidths = colRatios.map { it * tableWidth }
        val colXs = mutableListOf(margin)
        for (i in 1 until colWidths.size) {
            colXs.add(colXs[i - 1] + colWidths[i - 1])
        }

        val totalRows = maxOf(session.sops.size, 21)
        val firstPageStart = 740f - 45f
        val firstPageCapacity = ((firstPageStart - rowHeight - pageBottom) / rowHeight).toInt()
        val contPageStart = pageHeight - 50f - 20f
        val contPageCapacity = ((contPageStart - rowHeight - pageBottom) / rowHeight).toInt()
        val totalPages = if (totalRows <= firstPageCapacity) 1
        else 1 + ((totalRows - firstPageCapacity + contPageCapacity - 1) / contPageCapacity)

        var rowIndex = 0

        for (pageNum in 1..totalPages) {
            val page = pdfDoc.addNewPage(PageSize.LETTER)
            val canvas = PdfCanvas(page)
            var y: Float

            if (pageNum == 1) {
                y = 740f
                canvas.beginText().setFontAndSize(fontBold, 16f)
                val title = "Employee Training Record"
                val titleWidth = fontBold.getWidth(title, 16f)
                canvas.moveText(((pageWidth - titleWidth) / 2).toDouble(), y.toDouble())
                canvas.showText(title).endText()
                y -= 25f

                canvas.beginText().setFontAndSize(fontBold, 11f)
                    .moveText(margin.toDouble(), y.toDouble())
                    .showText("List each Document Separately").endText()
                y -= 20f
            } else {
                y = pageHeight - 50f
                canvas.beginText().setFontAndSize(fontBold, 11f)
                    .moveText(margin.toDouble(), y.toDouble())
                    .showText("Employee Training Record (continued)").endText()
                y -= 20f
            }

            // Header row background
            val headerY = y
            canvas.saveState()
                .setFillColor(DeviceRgb(230, 230, 230))
                .rectangle(margin.toDouble(), (headerY - rowHeight + 4).toDouble(), tableWidth.toDouble(), rowHeight.toDouble())
                .fill()
                .restoreState()

            // Header labels
            for (i in colLabels.indices) {
                canvas.beginText().setFontAndSize(fontBold, 9f)
                    .moveText((colXs[i] + 4).toDouble(), (headerY - 12).toDouble())
                    .showText(colLabels[i]).endText()
            }
            y -= rowHeight

            // Header borders
            canvas.setLineWidth(1f)
                .moveTo(margin.toDouble(), (headerY + 4).toDouble())
                .lineTo((margin + tableWidth).toDouble(), (headerY + 4).toDouble()).stroke()
            canvas.moveTo(margin.toDouble(), (y + 4).toDouble())
                .lineTo((margin + tableWidth).toDouble(), (y + 4).toDouble()).stroke()

            // Data rows
            while (rowIndex < totalRows && y >= pageBottom) {
                val sop = session.sops.getOrNull(rowIndex)
                if (sop != null) {
                    val values = arrayOf(
                        sop.sopNo,
                        if (sop.sopName.length > 45) sop.sopName.take(42) + "..." else sop.sopName,
                        sop.version.replace(Regex("^Rev\\s*", RegexOption.IGNORE_CASE), ""),
                        session.lecturerName,
                    )
                    for (i in values.indices) {
                        canvas.beginText().setFontAndSize(font, 8f)
                            .moveText((colXs[i] + 4).toDouble(), (y - 12).toDouble())
                            .showText(values[i]).endText()
                    }
                }
                y -= rowHeight
                rowIndex++

                // Row line
                canvas.setLineWidth(0.5f)
                    .setStrokeColor(DeviceRgb(180, 180, 180))
                    .moveTo(margin.toDouble(), (y + 4).toDouble())
                    .lineTo((margin + tableWidth).toDouble(), (y + 4).toDouble()).stroke()
                canvas.setStrokeColor(ColorConstants.BLACK)
            }

            // Vertical column lines
            val tableTop = headerY + 4
            val tableBottom = y + 4
            canvas.setLineWidth(0.5f)
            canvas.moveTo(margin.toDouble(), tableTop.toDouble())
                .lineTo(margin.toDouble(), tableBottom.toDouble()).stroke()
            for (x in colXs) {
                canvas.moveTo(x.toDouble(), tableTop.toDouble())
                    .lineTo(x.toDouble(), tableBottom.toDouble()).stroke()
            }
            canvas.moveTo((margin + tableWidth).toDouble(), tableTop.toDouble())
                .lineTo((margin + tableWidth).toDouble(), tableBottom.toDouble()).stroke()

            // Page numbers
            if (totalPages > 1) {
                val label = "Page $pageNum of $totalPages"
                val labelWidth = font.getWidth(label, 8f)
                canvas.beginText().setFontAndSize(font, 8f)
                    .setFillColor(DeviceRgb(128, 128, 128))
                    .moveText(((pageWidth - labelWidth) / 2).toDouble(), 30.0)
                    .showText(label).endText()
                canvas.setFillColor(ColorConstants.BLACK)
            }
        }

        pdfDoc.close()
        return baos.toByteArray()
    }

    // ═══════════ PDF Merge ═══════════

    private fun mergePdfs(pdfBuffers: List<ByteArray>): ByteArray {
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
            log.warn("PDF field not found: $name")
        }
    }
}
