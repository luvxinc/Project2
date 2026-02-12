import { Injectable, Logger } from '@nestjs/common';
import { PDFDocument } from 'pdf-lib';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ReceiveProductLineDto, ReceiveFromChinaDto, InspectionResult } from './dto/receive-from-china.dto';

/**
 * PDF checkbox mapping for receiving-inspection.pdf
 *
 * 18 checkboxes for 9 inspection items (pairs: even=PASS, odd=FAIL)
 * 2 checkboxes for conclusion (Accept / Reject)
 *
 * Checkbox names: undefined, undefined_2, ..., undefined_18, undefined_20, undefined_21
 */
const CHECKBOX_NAMES = [
  'undefined',      // Item 1 PASS
  'undefined_2',    // Item 1 FAIL
  'undefined_3',    // Item 2 PASS
  'undefined_4',    // Item 2 FAIL
  'undefined_5',    // Item 3 PASS
  'undefined_6',    // Item 3 FAIL
  'undefined_7',    // Item 4 PASS
  'undefined_8',    // Item 4 FAIL
  'undefined_9',    // Item 5 PASS
  'undefined_10',   // Item 5 FAIL
  'undefined_11',   // Item 6 PASS
  'undefined_12',   // Item 6 FAIL
  'undefined_13',   // Item 7 PASS
  'undefined_14',   // Item 7 FAIL
  'undefined_15',   // Item 8 PASS
  'undefined_16',   // Item 8 FAIL
  'undefined_17',   // Item 9 PASS
  'undefined_18',   // Item 9 FAIL
];

const ACCEPT_CHECKBOX = 'undefined_20';
const REJECT_CHECKBOX = 'undefined_21';
const COMMENTS_FIELD = 'undefined_19';

@Injectable()
export class ReceivingInspectionPdfService {
  private readonly logger = new Logger(ReceivingInspectionPdfService.name);
  private readonly templatePath: string;

  constructor() {
    this.templatePath = path.resolve(
      __dirname, '../../../../web/src/app/(dashboard)/vma/data/receiving-inspection.pdf',
    );
  }

  /**
   * Fill one receiving-inspection PDF for a single product line.
   */
  async fillOnePdf(
    shared: ReceiveFromChinaDto,
    line: ReceiveProductLineDto,
  ): Promise<Buffer> {
    const templateBytes = await fs.readFile(this.templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // --- Text fields ---
    this.setText(form, 'ManufacturerVendor', 'Venus Medtech (Hangzhou)');
    this.setText(form, 'PO No', shared.poNo || '');
    this.setText(form, 'Manufacturer Lot', line.serialNo);
    this.setText(form, 'Product Identification', line.productModel);
    this.setText(form, 'Date Shipped', shared.dateShipped);
    this.setText(form, 'DateTime Received', shared.dateTimeReceived);
    this.setText(form, 'Quantity Received', String(line.qty));
    this.setText(form, 'Received By', shared.operator);
    this.setText(form, COMMENTS_FIELD, shared.comments?.trim() || 'N/A');
    this.setText(form, 'Inspection By', line.inspectionBy);

    // Date Inspected = date portion of dateTimeReceived
    const dateInspected = shared.dateTimeReceived.split(' ')[0] || shared.dateTimeReceived;
    this.setText(form, 'Date Inspected', dateInspected);

    // --- Inspection item checkboxes (9 items × 2 each) ---
    const failedSet = new Set(line.failedNoteIndices);

    for (let item = 0; item < 9; item++) {
      const passIdx = item * 2;     // even index = PASS
      const failIdx = item * 2 + 1; // odd index = FAIL

      if (failedSet.has(item)) {
        // This item FAILED — check the FAIL checkbox
        this.checkBox(form, CHECKBOX_NAMES[failIdx]);
      } else {
        // This item PASSED — check the PASS checkbox
        this.checkBox(form, CHECKBOX_NAMES[passIdx]);
      }
    }

    // --- Conclusion checkboxes ---
    if (line.result === InspectionResult.ACCEPT) {
      this.checkBox(form, ACCEPT_CHECKBOX);
    } else {
      this.checkBox(form, REJECT_CHECKBOX);
    }

    // Flatten to bake values
    form.flatten();

    const pdfBytes = await pdfDoc.save();
    return Buffer.from(pdfBytes);
  }

  /**
   * Generate merged PDF for all product lines in a receiving shipment.
   */
  async generateReceivingPdf(dto: ReceiveFromChinaDto): Promise<Buffer> {
    const pdfs: Buffer[] = [];

    for (const line of dto.products) {
      const pdf = await this.fillOnePdf(dto, line);
      pdfs.push(pdf);
    }

    // Merge all into one PDF
    const merged = await PDFDocument.create();
    for (const buf of pdfs) {
      const doc = await PDFDocument.load(buf);
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    }

    const bytes = await merged.save();
    return Buffer.from(bytes);
  }

  // --- Helpers ---

  private setText(form: any, name: string, value: string) {
    try {
      const field = form.getTextField(name);
      field.setText(value);
    } catch {
      this.logger.warn(`PDF text field not found: ${name}`);
    }
  }

  private checkBox(form: any, name: string) {
    try {
      const cb = form.getCheckBox(name);
      cb.check();
    } catch {
      this.logger.warn(`PDF checkbox not found: ${name}`);
    }
  }
}
