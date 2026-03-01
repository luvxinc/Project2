// ═══════════════════════════════════════════════════
// SKU Parser — 前端轻量版，复刻 EbayCSVParser 逻辑
// ═══════════════════════════════════════════════════

export interface SkuParseResult {
  display: string;        // "SKU1.Qty+SKU2.Qty2" format
  skus: string[];         // parsed SKU codes
  quantities: number[];   // parsed quantities
  valid: boolean;         // parsing succeeded
  error?: string;         // error message if invalid
}

export function parseCustomLabel(customLabel: string | null | undefined): SkuParseResult {
  if (!customLabel || customLabel.trim() === '' || customLabel === '—') {
    return { display: '—', skus: [], quantities: [], valid: true };
  }
  const label = customLabel.trim();

  // pat1: single SKU — ^(?:PREFIX.)?SKU.QTY(+2K)?(.SUFFIX){0,2}$
  const pat1 = /^(?:[A-Za-z][A-Za-z0-9]{0,2}\.)?([A-Za-z0-9\-_/]{7,})\.(\d{1,3})(\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$/;
  const m1 = label.match(pat1);
  if (m1) {
    return {
      display: `${m1[1].toUpperCase()}.${m1[2]}`,
      skus: [m1[1].toUpperCase()],
      quantities: [parseInt(m1[2])],
      valid: true,
    };
  }

  // pat2: dual SKU — PREFIX.S1.Q1(+2K)?+S2.Q2(+2K)?(.SUFFIX)
  const pat2 = /^(?:[A-Za-z][A-Za-z0-9]{0,2}\.)?([A-Za-z0-9/\-_]{7,})\.(\d{1,3})(\+2K)?[+.]([A-Za-z0-9/\-_]{7,})\.(\d{1,3})(\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$/;
  const m2 = label.match(pat2);
  if (m2) {
    return {
      display: `${m2[1].toUpperCase()}.${m2[2]}+${m2[4].toUpperCase()}.${m2[5]}`,
      skus: [m2[1].toUpperCase(), m2[4].toUpperCase()],
      quantities: [parseInt(m2[2]), parseInt(m2[5])],
      valid: true,
    };
  }

  // Complex fallback: strip prefix, split on '+', each segment split on '.'
  try {
    const prefixMatch = label.match(/^(?:[A-Za-z][A-Za-z0-9]{0,2}\.)?(.+?)(?:\.[A-Za-z0-9_]*)?$/);
    const mainPart = prefixMatch ? prefixMatch[1] : label;
    const parts = mainPart.split('+');
    const junk = new Set(['--', '-', 'N/A', 'NULL', 'NONE', '', 'NAN']);
    const skus: string[] = [];
    const qtys: number[] = [];

    for (const seg of parts) {
      const trimmed = seg.trim();
      if (!trimmed || junk.has(trimmed.toUpperCase())) continue;
      if (trimmed.toUpperCase() === '2K') continue;  // ignore 2K suffix

      const segment = trimmed.replace('+2K', '');
      const arr = segment.split('.');
      const code = arr[0].toUpperCase().trim();
      if (junk.has(code)) continue;

      const qty = arr.length > 1 ? parseInt(arr[1]) || 1 : 1;
      skus.push(code);
      qtys.push(qty);
    }

    if (skus.length > 0) {
      return {
        display: skus.map((s, i) => `${s}.${qtys[i]}`).join('+'),
        skus,
        quantities: qtys,
        valid: true,
      };
    }
  } catch {
    // fallthrough to error
  }

  return {
    display: label,
    skus: [],
    quantities: [],
    valid: false,
    error: `Cannot parse: ${label}`,
  };
}
