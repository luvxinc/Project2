// ═══════════════════════════════════════
// CSV Parser — eBay Transaction/Earning
// Pure utility functions, no React.
// ═══════════════════════════════════════

const HEADER_MAP: Record<string, string> = {
  'transaction creation date': 'transactionCreationDate',
  'type': 'type', 'reference id': 'referenceId', 'description': 'description',
  'order number': 'orderNumber', 'item id': 'itemId', 'item title': 'itemTitle',
  'custom label': 'customLabel', 'quantity': 'quantity',
  'item subtotal': 'itemSubtotal', 'shipping and handling': 'shippingAndHandling',
  'seller collected tax': 'sellerCollectedTax', 'ebay collected tax': 'ebayCollectedTax',
  'final value fee - fixed': 'finalValueFeeFixed', 'final value fee - variable': 'finalValueFeeVariable',
  'regulatory operating fee': 'regulatoryOperatingFee', 'international fee': 'internationalFee',
  'promoted listings fee': 'promotedListingsFee', 'payments dispute fee': 'paymentsDisputeFee',
  'gross transaction amount': 'grossTransactionAmount', 'refund': 'refund',
  'buyer username': 'buyerUsername', 'ship to city': 'shipToCity', 'ship to country': 'shipToCountry',
  'net amount': 'netAmount', 'order creation date': 'orderCreationDate',
  'buyer name': 'buyerName', 'shipping labels': 'shippingLabels', 'seller': 'seller',
};

function normalizeHeader(h: string): string {
  return HEADER_MAP[h.toLowerCase().trim()] || '';
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

const JUNK_VALUES = new Set(['--', '-', 'n/a', 'null', 'nan', 'none', 'N/A', 'None']);
function sanitizeValue(v: string): string {
  return JUNK_VALUES.has(v) ? '' : v;
}

export function parseEbayCsv(text: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  let headerIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const lower = lines[i].toLowerCase();
    if (lower.includes('order number') || lower.includes('item id')) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return { headers: [], rows: [] };

  const rawHeaders = parseCsvLine(lines[headerIdx]);
  const headers = rawHeaders.map(h => normalizeHeader(h));
  const rows: Record<string, string>[] = [];
  for (let i = headerIdx + 1; i < lines.length; i++) {
    const vals = parseCsvLine(lines[i]);
    if (vals.length < 3) continue;
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      if (headers[j]) row[headers[j]] = sanitizeValue((vals[j] || '').trim());
    }
    if (row.orderNumber || row.type) rows.push(row);
  }
  return { headers: headers.filter(Boolean), rows };
}

export function detectSeller(text: string, filename?: string): string {
  const lines = text.split(/\r?\n/);
  for (const line of lines.slice(0, 30)) {
    const clean = line.replace(/"/g, '').trim().toLowerCase();
    if (clean.startsWith('seller,') || clean.startsWith('seller\t')) {
      const parts = line.replace(/"/g, '').split(/[,\t]/);
      if (parts.length >= 2 && parts[1].trim()) return parts[1].trim();
    }
  }
  if (filename) {
    const fname = filename.toLowerCase();
    if (fname.includes('88')) return 'esparts88';
    if (fname.includes('plus')) return 'espartsplus';
  }
  return '';
}

export function detectFileType(text: string): 'transaction' | 'earning' | 'unknown' {
  const head = text.substring(0, 2048).toLowerCase();
  if (head.includes('transaction report') || head.includes('transaction creation date')) return 'transaction';
  if (head.includes('order earnings report') || head.includes('shipping labels')) return 'earning';
  return 'unknown';
}

export interface DetectedFile {
  file: File;
  type: 'transaction' | 'earning' | 'unknown';
  seller: string;
  rowCount: number;
  rows: Record<string, string>[];
}
