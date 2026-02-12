import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument, PDFName, PDFBool } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parsePacificDate, MONTHS } from './vma-shared.util';

interface SiteInfo {
  siteName: string;
  address: string;
  address2: string;
  city: string;
  state: string;
  zipCode: string;
  country: string;
}

interface PackingItem {
  itemNo: number;
  specNo: string;
  serialNo: string;
  expDate: string;
  expDateFormatted: string;
  deviceName: string;
}

interface PackingListData {
  caseId: string;
  caseDate: string;       // YYYY-MM-DD
  site: SiteInfo;
  items: PackingItem[];
}

@Injectable()
export class PackingListPdfService {
  private readonly logger = new Logger(PackingListPdfService.name);
  private readonly templatePath: string;

  constructor() {
    this.templatePath = path.resolve(
      __dirname, '..', '..', '..', '..', 'web', 'src', 'app', '(dashboard)', 'vma', 'data', 'PackingList_UVP.pdf',
    );
    this.logger.log(`PDF template path: ${this.templatePath}`);
  }

  /**
   * Format case date to "MMM _____ , YYYY"
   */
  private formatEmailDate(dateStr: string): string {
    const d = parsePacificDate(dateStr);
    return `${MONTHS[d.getUTCMonth()]} _____ , ${d.getUTCFullYear()}`;
  }

  /**
   * Set a text field value. Only sets the /V (value) on the field.
   * Does NOT generate an appearance stream — we rely on the PDF viewer
   * to render using the template's original field properties (font, alignment, etc.)
   */
  private setText(form: any, name: string, value: string) {
    try {
      const field = form.getTextField(name);
      field.setText(value);

      // Remove the appearance stream that pdf-lib auto-generated.
      // This forces the PDF viewer to create its own appearance
      // using the template's original properties (vertical centering, font, etc.)
      const widgets = field.acroField.getWidgets();
      for (const widget of widgets) {
        widget.dict.delete(PDFName.of('AP'));
      }
    } catch {
      this.logger.warn(`PDF text field not found: ${name}`);
    }
  }

  /**
   * Generate the Packing List PDF by filling the AcroForm template.
   * Returns a real PDF buffer — no external dependencies (soffice, LibreOffice, etc.)
   */
  async generate(data: PackingListData): Promise<{ buffer: Buffer; mimeType: string; extension: string }> {
    try {
      await fs.access(this.templatePath);
    } catch {
      throw new Error(`PackingList PDF template not found: ${this.templatePath}`);
    }

    const templateBytes = await fs.readFile(this.templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // ===========================
    // 1. Site / Ship-To fields
    // ===========================
    this.setText(form, 'SiteName', data.site.siteName);

    if (data.site.address2) {
      this.setText(form, 'SiteAddress1', data.site.address);
      this.setText(form, 'SiteAddress2', data.site.address2);
      this.setText(form, 'SiteState', `${data.site.city}, ${data.site.state} ${data.site.zipCode}`);
      this.setText(form, 'SiteCountry', data.site.country);
    } else {
      // Single-line address: shift up
      this.setText(form, 'SiteAddress1', data.site.address);
      this.setText(form, 'SiteAddress2', `${data.site.city}, ${data.site.state} ${data.site.zipCode}`);
      this.setText(form, 'SiteState', data.site.country);
    }

    // ===========================
    // 2. Reference & Date
    // ===========================
    this.setText(form, 'Reference', data.caseId);
    this.setText(form, 'emailDate', this.formatEmailDate(data.caseDate));

    // ===========================
    // 3. Product table (page 1: Row1-Row14, page 2: Row1_2-Row14_2)
    // ===========================
    for (let i = 0; i < data.items.length && i < 28; i++) {
      const item = data.items[i];
      const suffix = i < 14 ? `Row${i + 1}` : `Row${i - 13}_2`;

      this.setText(form, `Items${suffix}`, String(item.itemNo));

      // Device Name: if single-line text, disable multiline so it
      // vertically centers like the adjacent single-line columns
      const dnField = form.getTextField(`Device Name${suffix}`);
      if (item.deviceName.includes('\n')) {
        dnField.enableMultiline();
      } else {
        dnField.disableMultiline();
      }
      dnField.setText(item.deviceName);
      // Remove pdf-lib appearance so viewer uses template formatting
      for (const w of dnField.acroField.getWidgets()) {
        w.dict.delete(PDFName.of('AP'));
      }

      this.setText(form, `Model and Specification${suffix}`, item.specNo);
      this.setText(form, `Serial NumberLot Number${suffix}`, item.serialNo);
      this.setText(form, `Expiry Date${suffix}`, item.expDateFormatted);
    }

    // Tell the PDF viewer to regenerate appearances from field properties
    // This preserves the template's original formatting (vertical centering, font, etc.)
    const acroFormDict = form.acroForm.dict;
    acroFormDict.set(PDFName.of('NeedAppearances'), PDFBool.True);

    // Mark all fields as read-only
    const allFields = form.getFields();
    for (const field of allFields) {
      field.enableReadOnly();
    }

    const pdfBytes = await pdfDoc.save();
    const buffer = Buffer.from(pdfBytes);

    this.logger.log(`Generated PackingList PDF for case ${data.caseId}: ${buffer.length} bytes (pdf-lib)`);

    return {
      buffer,
      mimeType: 'application/pdf',
      extension: 'pdf',
    };
  }
}
