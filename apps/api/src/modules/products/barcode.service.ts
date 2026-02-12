/**
 * Barcode Service - 条形码生成服务
 *
 * 使用 bwip-js 生成条形码图像
 * 使用 pdfkit 生成 PDF 文件
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as bwipjs from 'bwip-js';
import PDFDocument from 'pdfkit';

// 条形码格式配置
const BARCODE_FORMATS = {
  CODE128: {
    bcid: 'code128',
    height: 12,  // mm
    includetext: true,
    textxalign: 'center',
  },
  EAN13: {
    bcid: 'ean13',
    height: 12,
    includetext: true,
    textxalign: 'center',
  },
  UPC: {
    bcid: 'upca',
    height: 12,
    includetext: true,
    textxalign: 'center',
  },
} as const;

// 标签尺寸配置 (点, 1点 = 1/72 英寸)
const LABEL_CONFIG = {
  // 标准条形码标签 (2.25" x 1.25")
  width: 162,      // 2.25 * 72
  height: 90,      // 1.25 * 72
  marginTop: 10,
  marginLeft: 10,
  marginRight: 10,
  marginBottom: 5,
  barcodeWidth: 142,
  barcodeHeight: 50,
  skuFontSize: 8,
  nameFontSize: 6,
};

// 页面布局配置 (Letter 纸张)
const PAGE_CONFIG = {
  width: 612,      // 8.5 * 72
  height: 792,     // 11 * 72
  marginTop: 36,   // 0.5"
  marginLeft: 36,  // 0.5"
  marginRight: 36,
  marginBottom: 36,
  labelsPerRow: 3,
  labelsPerColumn: 8,
};

export interface BarcodeGenerateOptions {
  skus: string[];
  names?: Record<string, string>;  // SKU -> 产品名称映射
  copiesPerSku?: number;
  format?: 'CODE128' | 'EAN13' | 'UPC';
}

export interface BarcodeResult {
  success: boolean;
  pdfBuffer?: Buffer;
  error?: string;
  skuCount: number;
  totalLabels: number;
}

@Injectable()
export class BarcodeService {
  private readonly logger = new Logger(BarcodeService.name);

  /**
   * 生成单个条形码图像
   */
  async generateBarcodeImage(
    text: string,
    format: 'CODE128' | 'EAN13' | 'UPC' = 'CODE128',
  ): Promise<Buffer> {
    const formatConfig = BARCODE_FORMATS[format];

    try {
      const png = await bwipjs.toBuffer({
        bcid: formatConfig.bcid,
        text: text,
        scale: 3,             // 3x 缩放
        height: formatConfig.height,
        includetext: formatConfig.includetext,
        textxalign: formatConfig.textxalign,
      });

      return png;
    } catch (error) {
      this.logger.error(`Failed to generate barcode for ${text}: ${error}`);
      throw new BadRequestException(`Invalid barcode text: ${text}`);
    }
  }

  /**
   * 生成包含多个条形码的 PDF
   */
  async generateBarcodePdf(options: BarcodeGenerateOptions): Promise<BarcodeResult> {
    const {
      skus,
      names = {},
      copiesPerSku = 1,
      format = 'CODE128',
    } = options;

    if (!skus || skus.length === 0) {
      return {
        success: false,
        error: 'No SKUs provided',
        skuCount: 0,
        totalLabels: 0,
      };
    }

    // 生成所有条形码图像
    const barcodeImages: { sku: string; name?: string; image: Buffer }[] = [];

    for (const sku of skus) {
      try {
        const image = await this.generateBarcodeImage(sku, format);
        for (let i = 0; i < copiesPerSku; i++) {
          barcodeImages.push({
            sku,
            name: names[sku],
            image,
          });
        }
      } catch (error) {
        this.logger.warn(`Skipping SKU ${sku}: ${error}`);
        // 继续处理其他 SKU
      }
    }

    if (barcodeImages.length === 0) {
      return {
        success: false,
        error: 'Failed to generate any barcodes',
        skuCount: 0,
        totalLabels: 0,
      };
    }

    // 创建 PDF 文档
    const pdfBuffer = await this.createPdfWithLabels(barcodeImages);

    this.logger.log(
      `Generated PDF with ${barcodeImages.length} labels for ${skus.length} SKUs`,
    );

    return {
      success: true,
      pdfBuffer,
      skuCount: skus.length,
      totalLabels: barcodeImages.length,
    };
  }

  /**
   * 创建包含标签的 PDF
   */
  private async createPdfWithLabels(
    labels: { sku: string; name?: string; image: Buffer }[],
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      const doc = new PDFDocument({
        size: 'LETTER',
        margins: {
          top: PAGE_CONFIG.marginTop,
          left: PAGE_CONFIG.marginLeft,
          right: PAGE_CONFIG.marginRight,
          bottom: PAGE_CONFIG.marginBottom,
        },
      });

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // 计算标签位置
      const labelWidth = LABEL_CONFIG.width;
      const labelHeight = LABEL_CONFIG.height;
      const labelsPerRow = PAGE_CONFIG.labelsPerRow;
      const labelsPerColumn = PAGE_CONFIG.labelsPerColumn;
      const labelsPerPage = labelsPerRow * labelsPerColumn;

      // 计算水平和垂直间距
      const contentWidth = PAGE_CONFIG.width - PAGE_CONFIG.marginLeft - PAGE_CONFIG.marginRight;
      const contentHeight = PAGE_CONFIG.height - PAGE_CONFIG.marginTop - PAGE_CONFIG.marginBottom;
      const hGap = (contentWidth - labelsPerRow * labelWidth) / (labelsPerRow - 1 || 1);
      const vGap = (contentHeight - labelsPerColumn * labelHeight) / (labelsPerColumn - 1 || 1);

      labels.forEach((label, index) => {
        const pageIndex = Math.floor(index / labelsPerPage);
        const indexOnPage = index % labelsPerPage;
        const row = Math.floor(indexOnPage / labelsPerRow);
        const col = indexOnPage % labelsPerRow;

        // 添加新页面
        if (index > 0 && indexOnPage === 0) {
          doc.addPage();
        }

        // 计算标签左上角位置
        const x = PAGE_CONFIG.marginLeft + col * (labelWidth + hGap);
        const y = PAGE_CONFIG.marginTop + row * (labelHeight + vGap);

        // 绘制标签边框 (可选，调试用)
        // doc.rect(x, y, labelWidth, labelHeight).stroke();

        // 绘制条形码图像
        const barcodeX = x + LABEL_CONFIG.marginLeft;
        const barcodeY = y + LABEL_CONFIG.marginTop;

        try {
          doc.image(label.image, barcodeX, barcodeY, {
            width: LABEL_CONFIG.barcodeWidth,
            height: LABEL_CONFIG.barcodeHeight,
            align: 'center',
          });
        } catch (err) {
          this.logger.warn(`Failed to embed barcode image for ${label.sku}`);
        }

        // 绘制产品名称 (如果有)
        if (label.name) {
          const nameY = y + LABEL_CONFIG.marginTop + LABEL_CONFIG.barcodeHeight + 2;
          doc
            .fontSize(LABEL_CONFIG.nameFontSize)
            .font('Helvetica')
            .text(label.name, x + LABEL_CONFIG.marginLeft, nameY, {
              width: LABEL_CONFIG.barcodeWidth,
              align: 'center',
              lineBreak: false,
            });
        }
      });

      doc.end();
    });
  }
}
