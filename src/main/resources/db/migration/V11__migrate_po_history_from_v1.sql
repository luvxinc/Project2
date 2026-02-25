-- Migrate V1 PO history data from in_po table into V3 purchase_order_events.
-- This creates audit events for existing POs that were created before V3 event tracking.
-- Only runs if purchase_orders has data but purchase_order_events is empty.

-- For each existing PO, create a CREATE event (event_seq=1) with current items snapshot.
INSERT INTO purchase_order_events (po_id, po_num, event_type, event_seq, changes, note, operator, created_at)
SELECT
    po.id,
    po.po_num,
    'CREATE',
    1,
    jsonb_build_object(
        'items', COALESCE(
            (SELECT jsonb_agg(jsonb_build_object('sku', poi.sku, 'qty', poi.quantity, 'price', poi.unit_price))
             FROM purchase_order_items poi
             WHERE poi.po_id = po.id AND poi.deleted_at IS NULL),
            '[]'::jsonb
        ),
        'strategy', COALESCE(
            (SELECT jsonb_build_object(
                'currency', pos.currency,
                'exchangeRate', pos.exchange_rate,
                'floatEnabled', pos.float_enabled,
                'floatThreshold', pos.float_threshold,
                'requireDeposit', pos.require_deposit,
                'depositRatio', pos.deposit_ratio
            )
             FROM purchase_order_strategies pos
             WHERE pos.po_id = po.id
             LIMIT 1),
            '{}'::jsonb
        ),
        'migrated_from', 'v1'
    ),
    '原始订单 (V1迁移)',
    COALESCE(po.created_by, 'system'),
    po.created_at
FROM purchase_orders po
WHERE NOT EXISTS (
    SELECT 1 FROM purchase_order_events poe WHERE poe.po_id = po.id
);
