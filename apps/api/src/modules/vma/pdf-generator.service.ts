import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, rgb } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';

// Field map positions for vma-training.pdf 
// Left sign-in: rows 1-17, Right sign-in: rows 1-17 (suffix _2)
const DEPT_DROPDOWN_MAP: Record<number, string> = {
  // Left side: rows 1-17 map to specific dropdown field names
  1: 'Dropdown2', 2: 'Dropdown3', 3: 'Dropdown4', 4: 'Dropdown5',
  5: 'Dropdown6', 6: 'Dropdown7', 7: 'Dropdown8', 8: 'Dropdown9',
  9: 'Dropdown10', 10: 'Dropdown11', 11: 'Dropdown12',
  // Right side: rows 1-17 (_2 suffix employee fields)
  18: 'Dropdown13', 19: 'Dropdown14', 20: 'Dropdown15',
  21: 'Dropdown16', 22: 'Dropdown17', 23: 'Dropdown18',
};

interface SessionData {
  trainingNo: string;
  trainingDate: Date;
  trainingSubject: string;
  trainingObjective: string;
  evaluationMethod: string; // "oral_qa" | "self_training"
  lecturerName: string;
  timeStart: string;
  timeEnd: string;
  employees: { employeeNo: string; departmentCode: string }[];
  sops: { sopNo: string; sopName: string; version: string }[];
}

@Injectable()
export class PdfGeneratorService {
  private readonly logger = new Logger(PdfGeneratorService.name);
  private readonly templateDir: string;
  private readonly outputDir: string;

  constructor() {
    // Templates are in the web app's data folder
    this.templateDir = path.resolve(__dirname, '../../../../web/src/app/(dashboard)/vma/data');
    this.outputDir = path.resolve(__dirname, '../../../generated-pdfs');
    // Ensure output dir exists
    fs.mkdir(this.outputDir, { recursive: true }).catch(() => {});
  }

  /**
   * Generate a merged PDF for one training session (PDF form + DOCX→PDF)
   */
  async generateSessionPdf(session: SessionData): Promise<Buffer> {
    // 1. Fill the vma-training.pdf form
    const filledPdf = await this.fillTrainingPdf(session);

    // 2. Generate the vma-list DOCX and convert to PDF  
    const listPdf = await this.generateListPdf(session);

    // 3. Merge both PDFs
    const merged = await this.mergePdfs([filledPdf, listPdf]);
    return merged;
  }

  /**
   * Generate merged PDF for multiple sessions
   */
  async generateAllSessionsPdf(sessions: SessionData[]): Promise<Buffer> {
    const pdfs: Buffer[] = [];
    for (const session of sessions) {
      const pdf = await this.generateSessionPdf(session);
      pdfs.push(pdf);
    }
    return this.mergePdfs(pdfs);
  }

  /**
   * Fill the vma-training.pdf AcroForm template
   */
  private async fillTrainingPdf(session: SessionData): Promise<Buffer> {
    const templatePath = path.join(this.templateDir, 'vma-training.pdf');
    const templateBytes = await fs.readFile(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // --- Fill text fields ---
    this.setTextField(form, 'DocNum', session.trainingNo);
    this.setTextField(form, 'Training Subjects', session.trainingSubject);
    this.setTextField(form, 'Training Objectives', session.trainingObjective);
    this.setTextField(form, 'Place of Training', 'On-Site');
    
    // Date: MMM-DD-YYYY format
    const dateStr = session.trainingDate.toLocaleDateString('en-US', {
      month: 'short', day: '2-digit', year: 'numeric', timeZone: 'America/Los_Angeles',
    }).replace(/\s/g, '-').replace(',', '');
    this.setTextField(form, 'Record Date', dateStr);
    
    // Time of Training
    const timeStr = `${session.timeStart} - ${session.timeEnd} PST`;
    this.setTextField(form, 'Written Examinations Oral QA Job Practice Evaluation OthersTime of Training', dateStr);
    
    // Duration
    this.setTextField(form, 'Duration', timeStr);

    // --- Checkboxes ---
    if (session.evaluationMethod === 'oral_qa') {
      try { form.getCheckBox('Check Box2').check(); } catch {}
    } else {
      // Others: Self-Training
      try { form.getCheckBox('Check Box4').check(); } catch {}
      this.setTextField(form, 'Others', 'Self-Training');
    }

    // --- Lecturer ---
    try { 
      const lecturerField = form.getDropdown('Lecturer');
      const options = lecturerField.getOptions();
      // Find matching option
      const match = options.find(o => 
        o.toLowerCase().includes(session.lecturerName.toLowerCase().split(' ')[0])
      );
      if (match) lecturerField.select(match);
    } catch {}

    // --- Employees sign-in ---
    const maxPerSide = 17;
    for (let i = 0; i < session.employees.length && i < 34; i++) {
      const emp = session.employees[i];
      const side = i < maxPerSide ? 1 : 2;
      const row = i < maxPerSide ? i + 1 : i - maxPerSide + 1;
      
      // Employee No field
      const empFieldName = side === 1 
        ? `Employee NoRow${row}` 
        : `Employee NoRow${row}_2`;
      this.setTextField(form, empFieldName, emp.employeeNo);

      // Department dropdown
      const deptFieldIdx = i + 1;
      const deptFieldName = DEPT_DROPDOWN_MAP[deptFieldIdx];
      if (deptFieldName) {
        try {
          const dropdown = form.getDropdown(deptFieldName);
          const options = dropdown.getOptions();
          const match = options.find(o => o.trim() === emp.departmentCode);
          if (match) dropdown.select(match);
        } catch {}
      }
    }

    // --- Assessment Conclusion ---
    this.setTextField(form, 'Num of Attend', String(session.employees.length));
    this.setTextField(form, 'Num of Pass', String(session.employees.length));

    // Flatten form to bake values into page content (required for PDF merge)
    form.flatten();

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Generate SOP list page(s) as PDF using pure pdf-lib
   * Supports automatic pagination when SOPs exceed one page capacity
   */
  private async generateListPdf(session: SessionData): Promise<Buffer> {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont('Helvetica' as any);
    const fontBold = await pdfDoc.embedFont('Helvetica-Bold' as any);

    const pageWidth = 612;
    const pageHeight = 792; // Letter size
    const margin = 40;
    const tableWidth = pageWidth - 2 * margin;
    const rowHeight = 22;
    const PAGE_BOTTOM = 60; // leave room for footer

    // Column definitions
    const columns = [
      { label: 'Document No.', ratio: 0.20 },
      { label: 'Document Title', ratio: 0.50 },
      { label: 'Rev.', ratio: 0.10 },
      { label: 'Trainer (Print)', ratio: 0.20 },
    ];
    const colWidths = columns.map(c => c.ratio * tableWidth);
    const colXs = [margin];
    for (let i = 1; i < colWidths.length; i++) {
      colXs.push(colXs[i - 1] + colWidths[i - 1]);
    }

    // Total rows: at least 21 (matching original DOCX template), or actual SOP count
    const totalRows = Math.max(session.sops.length, 21);

    // Pre-calculate total pages needed
    const firstPageContentStart = 740 - 45; // after title + subtitle
    const firstPageCapacity = Math.floor((firstPageContentStart - rowHeight - PAGE_BOTTOM) / rowHeight);
    const contPageContentStart = pageHeight - 50 - 20; // after continuation title
    const contPageCapacity = Math.floor((contPageContentStart - rowHeight - PAGE_BOTTOM) / rowHeight);
    const totalPages = totalRows <= firstPageCapacity
      ? 1
      : 1 + Math.ceil((totalRows - firstPageCapacity) / contPageCapacity);

    let rowIndex = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      const page = pdfDoc.addPage([pageWidth, pageHeight]);
      let y: number;

      if (pageNum === 1) {
        // === First page: title + subtitle ===
        y = 740;
        const title = 'Employee Training Record';
        const titleWidth = fontBold.widthOfTextAtSize(title, 16);
        page.drawText(title, {
          x: (pageWidth - titleWidth) / 2, y,
          size: 16, font: fontBold,
        });
        y -= 25;

        page.drawText('List each Document Separately', {
          x: margin, y,
          size: 11, font: fontBold,
        });
        y -= 20;
      } else {
        // === Continuation pages ===
        y = pageHeight - 50;
        page.drawText('Employee Training Record (continued)', {
          x: margin, y,
          size: 11, font: fontBold,
        });
        y -= 20;
      }

      // Draw header row
      const headerY = y;
      page.drawRectangle({
        x: margin, y: headerY - rowHeight + 4,
        width: tableWidth, height: rowHeight,
        color: rgb(0.9, 0.9, 0.9),
      });
      for (let i = 0; i < columns.length; i++) {
        page.drawText(columns[i].label, {
          x: colXs[i] + 4, y: headerY - 12,
          size: 9, font: fontBold,
        });
      }
      y -= rowHeight;

      // Header borders
      page.drawLine({ start: { x: margin, y: headerY + 4 }, end: { x: margin + tableWidth, y: headerY + 4 }, thickness: 1 });
      page.drawLine({ start: { x: margin, y: y + 4 }, end: { x: margin + tableWidth, y: y + 4 }, thickness: 1 });

      // Data rows — fill until page bottom or all rows done
      while (rowIndex < totalRows && y >= PAGE_BOTTOM) {
        const sop = session.sops[rowIndex];
        if (sop) {
          const values = [
            sop.sopNo,
            sop.sopName.length > 45 ? sop.sopName.substring(0, 42) + '...' : sop.sopName,
            sop.version.replace(/^Rev\s*/i, ''),
            session.lecturerName,
          ];
          for (let i = 0; i < values.length; i++) {
            page.drawText(values[i] || '', {
              x: colXs[i] + 4, y: y - 12,
              size: 8, font,
            });
          }
        }
        y -= rowHeight;
        rowIndex++;

        // Row bottom line
        page.drawLine({
          start: { x: margin, y: y + 4 },
          end: { x: margin + tableWidth, y: y + 4 },
          thickness: 0.5,
          color: rgb(0.7, 0.7, 0.7),
        });
      }

      // Vertical column lines (per page)
      const tableTop = headerY + 4;
      const tableBottom = y + 4;
      page.drawLine({ start: { x: margin, y: tableTop }, end: { x: margin, y: tableBottom }, thickness: 0.5 });
      for (let i = 0; i < colXs.length; i++) {
        page.drawLine({ start: { x: colXs[i], y: tableTop }, end: { x: colXs[i], y: tableBottom }, thickness: 0.5 });
      }
      page.drawLine({ start: { x: margin + tableWidth, y: tableTop }, end: { x: margin + tableWidth, y: tableBottom }, thickness: 0.5 });

      // Page number footer (multi-page only)
      if (totalPages > 1) {
        const pageLabel = `Page ${pageNum} of ${totalPages}`;
        const labelWidth = font.widthOfTextAtSize(pageLabel, 8);
        page.drawText(pageLabel, {
          x: (pageWidth - labelWidth) / 2, y: 30,
          size: 8, font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }
    }

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Merge multiple PDF buffers into one
   */
  private async mergePdfs(pdfBuffers: Buffer[]): Promise<Buffer> {
    const merged = await PDFDocument.create();
    for (const buf of pdfBuffers) {
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    }
    const bytes = await merged.save();
    return Buffer.from(bytes);
  }

  /**
   * Save merged PDF and return the file path
   */
  async savePdf(buffer: Buffer, filename: string): Promise<string> {
    const filepath = path.join(this.outputDir, filename);
    await fs.writeFile(filepath, buffer);
    return filepath;
  }

  // === Helpers ===

  private setTextField(form: any, name: string, value: string) {
    try {
      const field = form.getTextField(name);
      field.setText(value);
    } catch {
      this.logger.warn(`PDF field not found: ${name}`);
    }
  }
}
