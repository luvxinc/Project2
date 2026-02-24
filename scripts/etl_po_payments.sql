-- ═══════════════════════════════════════════════════════════
-- ETL: V1 in_pmt_po_final → V3 payments (payment_type='po')
-- 
-- Audit: V1 has 20 records, V3 has only 1 (PPMT_20260114_N01)
-- This script migrates the remaining 19 records.
-- ═══════════════════════════════════════════════════════════

BEGIN;

INSERT INTO payments (
  payment_type, payment_no, po_num, po_id, supplier_code, supplier_id,
  payment_date, currency, cash_amount, exchange_rate, rate_mode,
  prepay_amount, deposit_override,
  extra_amount, extra_currency, extra_note, note,
  created_at, updated_at, version
)
SELECT
  'po'::payment_type,
  v.payment_no,
  v.po_num,
  po.id,
  po.supplier_code,
  po.supplier_id,
  v.payment_date::date,
  v.currency::currency_code,
  v.cash_amount,
  v.exchange_rate,
  v.rate_mode::exchange_rate_mode,
  v.prepay_amount,
  v.deposit_override,
  v.extra_amount,
  CASE WHEN v.extra_currency = '' THEN NULL ELSE v.extra_currency::currency_code END,
  CASE WHEN v.extra_note = '' THEN NULL ELSE v.extra_note END,
  CASE WHEN v.note = '' THEN NULL ELSE v.note END,
  v.src_ts,
  v.src_ts,
  0
FROM (
  VALUES
    -- 1. PPMT_20250512_N01  LF20250219-S01  RMB 43802  7.2286 A  extra=56.64 USD 手续费
    ('PPMT_20250512_N01', 'LF20250219-S01', '2025-05-12', 'RMB', 43802.00000, 7.2286, 'auto', 0.00000, false, 56.64000, 'USD', '手续费', '原始货款单', '2025-05-12T00:00:00Z'::timestamptz),
    -- 2. PPMT_20250514_N01  HN20250305-S01  USD 6453.496  7.2136 A  extra=40 USD 手续费
    ('PPMT_20250514_N01', 'HN20250305-S01', '2025-05-14', 'USD', 6453.49600, 7.2136, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2025-05-14T00:00:00Z'::timestamptz),
    -- 3. PPMT_20250620_N01  XX20250307-S01  USD 24590.844  7.1796 A  extra=0.5 USD 手续费
    ('PPMT_20250620_N01', 'XX20250307-S01', '2025-06-20', 'USD', 24590.84447, 7.1796, 'auto', 0.00000, false, 0.50000, 'USD', '手续费', '原始货款单', '2025-06-20T00:00:00Z'::timestamptz),
    -- 4. PPMT_20250620_N01  XX20250405-S01  USD 10138.76  7.1796 A  extra=0.5 USD 手续费
    ('PPMT_20250620_N01', 'XX20250405-S01', '2025-06-20', 'USD', 10138.76000, 7.1796, 'auto', 0.00000, false, 0.50000, 'USD', '手续费', '原始货款单', '2025-06-20T00:00:00Z'::timestamptz),
    -- 5. PPMT_20250620_N02  ZH20250305-S01  RMB 31920  7.1796 A  extra=40 USD 手续费
    ('PPMT_20250620_N02', 'ZH20250305-S01', '2025-06-20', 'RMB', 31920.00000, 7.1796, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2025-06-20T00:00:00Z'::timestamptz),
    -- 6. PPMT_20250728_N01  ZH20250417-S01  RMB 89982  7.1682 A  extra=40 USD 手续费
    ('PPMT_20250728_N01', 'ZH20250417-S01', '2025-07-28', 'RMB', 89982.00000, 7.1682, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2025-07-28T00:00:00Z'::timestamptz),
    -- 7. PPMT_20250905_N01  HN20250603-S01  USD 5059.74  7.12 M(Manual!)  extra=0
    ('PPMT_20250905_N01', 'HN20250603-S01', '2025-09-05', 'USD', 5059.74000, 7.1200, 'manual', 0.00000, false, 0.00000, '', '', '原始货款单', '2025-09-05T00:00:00Z'::timestamptz),
    -- 8. PPMT_20250905_N02  XX20250605-S01  USD 10203.171  7.1378 A  extra=40 USD 手续费
    ('PPMT_20250905_N02', 'XX20250605-S01', '2025-09-05', 'USD', 10203.17109, 7.1378, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2025-09-05T00:00:00Z'::timestamptz),
    -- 9. PPMT_20251031_N01  ZH20250603-S01  USD 6988.34  7.1108 A  override=true!
    ('PPMT_20251031_N01', 'ZH20250603-S01', '2025-10-31', 'USD', 6988.34000, 7.1108, 'auto', 0.00000, true, 0.00000, '', '', '原始货款单', '2025-10-31T00:00:00Z'::timestamptz),
    -- 10. PPMT_20251205_N01  XX20250917-S01  USD 9226.550  7.0701 A  extra=40 USD 手续费
    ('PPMT_20251205_N01', 'XX20250917-S01', '2025-12-05', 'USD', 9226.55016, 7.0701, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2025-12-05T00:00:00Z'::timestamptz),
    -- 11. PPMT_20251205_N02  ZH20250907-S01  RMB 25323.60  7.0701 A  extra=50.21 USD 手续费
    ('PPMT_20251205_N02', 'ZH20250907-S01', '2025-12-05', 'RMB', 25323.60000, 7.0701, 'auto', 0.00000, false, 50.21000, 'USD', '手续费', '原始货款单', '2025-12-05T00:00:00Z'::timestamptz),
    -- 12. PPMT_20260105_N01  HN20251106-S01  USD 3778.944  6.9822 A  extra=40 USD 手续费
    ('PPMT_20260105_N01', 'HN20251106-S01', '2026-01-05', 'USD', 3778.94400, 6.9822, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2026-01-05T00:00:00Z'::timestamptz),
    -- 13. PPMT_20260105_N02  XX20251107-S01  USD 6977.727  6.9822 A  extra=40 USD 手续费
    ('PPMT_20260105_N02', 'XX20251107-S01', '2026-01-05', 'USD', 6977.72699, 6.9822, 'auto', 0.00000, false, 40.00000, 'USD', '手续费', '原始货款单', '2026-01-05T00:00:00Z'::timestamptz),
    -- 14. PPMT_20260105_N03  LF20250917-S01  RMB 25900  6.9822 A  extra=18.39667 USD 手续费
    ('PPMT_20260105_N03', 'LF20250917-S01', '2026-01-05', 'RMB', 25900.00000, 6.9822, 'auto', 0.00000, false, 18.39667, 'USD', '手续费', '原始货款单', '2026-01-05T00:00:00Z'::timestamptz),
    -- 15. PPMT_20260105_N03  LF20250925-S01  RMB 54432  6.9822 A  extra=18.39667 USD 手续费
    ('PPMT_20260105_N03', 'LF20250925-S01', '2026-01-05', 'RMB', 54432.00000, 6.9822, 'auto', 0.00000, false, 18.39667, 'USD', '手续费', '原始货款单', '2026-01-05T00:00:00Z'::timestamptz),
    -- 16. PPMT_20260105_N03  LF20251106-S01  RMB 39022  6.9822 A  extra=18.39667 USD 手续费
    ('PPMT_20260105_N03', 'LF20251106-S01', '2026-01-05', 'RMB', 39022.00000, 6.9822, 'auto', 0.00000, false, 18.39667, 'USD', '手续费', '原始货款单', '2026-01-05T00:00:00Z'::timestamptz),
    -- 17. PPMT_20260202_N01  LF20251217-S01  RMB 15300  6.9502 A  extra=43.80 USD 手续费
    ('PPMT_20260202_N01', 'LF20251217-S01', '2026-02-02', 'RMB', 15300.00000, 6.9502, 'auto', 0.00000, false, 43.80000, 'USD', '手续费', '原始货款单', '2026-02-02T00:00:00Z'::timestamptz),
    -- 18. PPMT_20260220_N01  HN20250603-S01  USD 0.50  7.2004 A  extra=0
    ('PPMT_20260220_N01', 'HN20250603-S01', '2026-02-20', 'USD', 0.50000, 7.2004, 'auto', 0.00000, false, 0.00000, '', '', '原始货款单', '2026-02-20T00:00:00Z'::timestamptz),
    -- 19. PPMT_20260220_N02  HN20250603-S01  USD 22.00  7.2004 A  extra=0
    ('PPMT_20260220_N02', 'HN20250603-S01', '2026-02-20', 'USD', 22.00000, 7.2004, 'auto', 0.00000, false, 0.00000, '', '', '原始货款单', '2026-02-20T00:00:00Z'::timestamptz)
) AS v(payment_no, po_num, payment_date, currency, cash_amount, exchange_rate, rate_mode, prepay_amount, deposit_override, extra_amount, extra_currency, extra_note, note, src_ts)
JOIN purchase_orders po ON po.po_num = v.po_num AND po.deleted_at IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM payments p
  WHERE p.payment_type = 'po'
    AND p.payment_no = v.payment_no
    AND p.po_num = v.po_num
);

COMMIT;
