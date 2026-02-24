/**
 * Project-level Status Color Utility
 *
 * Centralizes all status → color mappings for the entire ERP.
 * Every module (finance, purchase, etc.) should import from here
 * instead of defining local PAYMENT_STATUS_COLORS consts.
 *
 * Usage in components:
 *   const colors = themeColors[theme];
 *   const badge = paymentStatusStyle('paid', colors);
 *   // → { bg, color, dot, ring }
 */

// ═══════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════

export interface StatusBadgeStyle {
  bg: string;
  color: string;
  dot: string;
  ring: string;
}

/** Theme colors object shape (subset needed) */
interface ThemeColors {
  green: string;
  red: string;
  blue: string;
  orange: string;
  yellow: string;
  teal: string;
  gray: string;
  gray2: string;
  purple: string;
  [key: string]: string;
}

// ═══════════════════════════════════════════════
// Helpers (exported for one-off rgba needs)
// ═══════════════════════════════════════════════

/** Convert a hex color to rgba with opacity */
export function hexToRgba(hex: string, opacity: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

/** Build a full badge style from a single accent color */
function badge(accent: string, bgOpacity = 0.12, ringOpacity = 0.3): StatusBadgeStyle {
  return {
    bg: hexToRgba(accent, bgOpacity),
    color: accent,
    dot: accent,
    ring: hexToRgba(accent, ringOpacity),
  };
}

// ═══════════════════════════════════════════════
// 1. Payment Status (PO Payment, Deposit, Logistics)
//    Used by: LogisticDetailPanel, DepositDetailPanel,
//    POPaymentDetailPanel, DepositTable, POPaymentTable,
//    PaidPaymentTable, LogisticTable
// ═══════════════════════════════════════════════

export function paymentStatusStyle(status: string, c: ThemeColors): StatusBadgeStyle {
  switch (status) {
    case 'paid':
      return badge(c.green);
    case 'partial':
      return badge(c.teal);
    case 'deleted':
      return badge(c.gray, 0.14, 0.25);
    case 'not_required':
      return badge(c.teal);
    case 'override':
      return badge(c.green);
    case 'unpaid':
    default:
      return badge(c.orange);
  }
}

// ═══════════════════════════════════════════════
// 2. Shipment / Receive Status (full badge)
//    Used by: ShipmentDetailPanel, ShipmentTable,
//    ReceiveTable, ReceiveDetailPanel, DepositPODetailPanel
// ═══════════════════════════════════════════════

export function shipmentStatusStyle(status: string, c: ThemeColors): StatusBadgeStyle {
  switch (status) {
    case 'ALL_RECEIVED':
      return badge(c.green);
    case 'DIFF_UNRESOLVED':
      return badge(c.red);
    case 'DIFF_RESOLVED':
      return badge(c.teal);
    case 'deleted':
    case 'DELETED':
      return badge(c.gray, 0.14, 0.25);
    case 'IN_TRANSIT':
    default:
      return badge(c.orange);
  }
}

// ═══════════════════════════════════════════════
// 3. Abnormal Status
//    Used by: AbnormalTable, AbnormalDetailPanel
// ═══════════════════════════════════════════════

export function abnormalStatusStyle(status: string, c: ThemeColors): StatusBadgeStyle {
  switch (status) {
    case 'resolved':
      return badge(c.green);
    case 'deleted':
      return badge(c.gray2, 0.10, 0.20);
    case 'pending':
    default:
      return badge(c.orange);
  }
}

// ═══════════════════════════════════════════════
// 4. Receive Item Status (per-SKU line item)
//    Used by: ReceiveDetailPanel ItemsFlatTable
// ═══════════════════════════════════════════════

export function receiveItemStatusColor(status: string, c: ThemeColors): string {
  switch (status) {
    case 'normal':
      return c.green;
    case 'deficit':
      return c.red;
    case 'excess':
      return c.orange;
    default:
      return c.gray;
  }
}

// ═══════════════════════════════════════════════
// 5. Diff Status (pending / resolved)
//    Used by: ReceiveDetailPanel diffs tab
// ═══════════════════════════════════════════════

export function diffStatusStyle(status: string, c: ThemeColors): { bg: string; color: string } {
  return status === 'pending'
    ? { bg: hexToRgba(c.red, 0.12), color: c.red }
    : { bg: hexToRgba(c.gray, 0.12), color: c.gray };
}

// ═══════════════════════════════════════════════
// 6. Currency Badge
// ═══════════════════════════════════════════════

export function currencyBadgeStyle(currency: string, c: ThemeColors): { bg: string; color: string } {
  const isUsd = currency === 'USD';
  return {
    bg: hexToRgba(isUsd ? c.teal : c.yellow, 0.14),
    color: isUsd ? c.teal : c.yellow,
  };
}

/** Currency symbol helper */
export function currencySymbol(currency: string): string {
  return (currency === 'RMB' || currency === 'CNY') ? '¥' : '$';
}

// ═══════════════════════════════════════════════
// 7. Rate Mode Badge
// ═══════════════════════════════════════════════

export function rateModeStyle(isAuto: boolean, c: ThemeColors): { bg: string; color: string } {
  return {
    bg: hexToRgba(isAuto ? c.blue : c.gray, 0.14),
    color: isAuto ? c.blue : c.gray,
  };
}

// ═══════════════════════════════════════════════
// 8. Override Badge
// ═══════════════════════════════════════════════

export function overrideBadgeStyle(c: ThemeColors): { bg: string; color: string } {
  return {
    bg: hexToRgba(c.red, 0.12),
    color: c.red,
  };
}

// ═══════════════════════════════════════════════
// 9. Diff Warning Badge (Flow page)
// ═══════════════════════════════════════════════

export function diffWarningStyle(c: ThemeColors): { bg: string; color: string } {
  return {
    bg: hexToRgba(c.orange, 0.15),
    color: c.orange,
  };
}
