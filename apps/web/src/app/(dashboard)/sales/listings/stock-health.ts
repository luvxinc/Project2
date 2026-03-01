/**
 * Stock health level based on warehouse qty vs eBay sold velocity.
 * 5 levels: critically-low, low, normal, high, very-high
 * Logic: ratio = warehouseQty / max(1, soldQuantity)
 *   <= 0.5  → critically-low (超低库存)
 *   <= 1.5  → low (低库存)
 *   <= 4.0  → normal (正常库存)
 *   <= 8.0  → high (高库存)
 *   >  8.0  → very-high (超高库存)
 * For multi-SKU, take the worst (lowest) level.
 */

export type StockLevel = 'critically-low' | 'low' | 'normal' | 'high' | 'very-high' | 'unknown';

export const stockLevelOrder: StockLevel[] = ['critically-low', 'low', 'normal', 'high', 'very-high'];

export function getSkuStockLevel(
  sku: string,
  sold: number,
  stockMap: Record<string, number>,
): StockLevel {
  const warehouseQty = stockMap[sku.toUpperCase()] ?? stockMap[sku] ?? 0;
  if (warehouseQty === 0 && sold === 0) return 'unknown';
  if (warehouseQty === 0) return 'critically-low';
  const ratio = warehouseQty / Math.max(1, sold);
  if (ratio <= 0.5) return 'critically-low';
  if (ratio <= 1.5) return 'low';
  if (ratio <= 4.0) return 'normal';
  if (ratio <= 8.0) return 'high';
  return 'very-high';
}

export function getListingStockHealth(
  skus: string[],
  sold: number,
  stockMap: Record<string, number>,
): StockLevel {
  if (skus.length === 0) return 'unknown';
  let worst = stockLevelOrder.length - 1;
  for (const sku of skus) {
    const level = getSkuStockLevel(sku, sold, stockMap);
    const idx = stockLevelOrder.indexOf(level);
    if (idx >= 0 && idx < worst) worst = idx;
  }
  return stockLevelOrder[worst] ?? 'unknown';
}

export function stockLevelColor(
  level: StockLevel,
  colors: { red: string; orange: string; green: string; blue: string; purple: string; textSecondary: string },
): string {
  switch (level) {
    case 'critically-low': return colors.red;
    case 'low': return colors.orange;
    case 'normal': return colors.green;
    case 'high': return colors.blue;
    case 'very-high': return colors.purple;
    default: return colors.textSecondary;
  }
}
