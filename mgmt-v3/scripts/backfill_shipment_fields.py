#!/usr/bin/env python3
"""
V1→V3 发货单回填脚本
===================
修复两个问题:
  1. total_weight / price_kg / rate_mode 在 V3 中为默认值 0/'M'
  2. V1 中新增的发货单在 V3 中不存在

幂等: 可多次运行, 不会重复创建记录

用法:
    python3 backfill_shipment_fields.py              # 执行回填
    python3 backfill_shipment_fields.py --dry-run     # 只打印不执行
    python3 backfill_shipment_fields.py --verify-only  # 只验证差异
"""

import sys
import argparse
from decimal import Decimal, InvalidOperation
from datetime import datetime, date

import pymysql
import psycopg2
import psycopg2.extras

# ============================================================
# Connection configs — 与 migrate_v1_to_v3.py 保持一致
# ============================================================
MYSQL_CONF = dict(
    host='localhost', port=3306, user='root',
    password='***REDACTED_PASSWORD***', database='MGMT',
    charset='utf8mb4', connect_timeout=10, read_timeout=120
)
PG_CONF = dict(
    host='localhost', port=5432, user='aaron',
    password='***REDACTED_PASSWORD***', dbname='mgmt_v2'
)

# ============================================================
# Helpers
# ============================================================

def safe_decimal(val, precision=5):
    if val is None or val == '' or val == '--':
        return None
    try:
        return Decimal(str(val)).quantize(Decimal(10) ** -precision)
    except (InvalidOperation, ValueError):
        return None

def safe_date(val):
    if val is None or val == '' or val == '--':
        return None
    if isinstance(val, (date, datetime)):
        return val
    try:
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(str(val).strip(), fmt).date()
            except ValueError:
                continue
    except Exception:
        pass
    return None

def log(msg, level='INFO'):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] [{level}] {msg}')


# ============================================================
# Step 1: 从 V1 MySQL 读取所有发货单 (latest seq per logistic_num)
# ============================================================

def fetch_v1_shipments(my_cur):
    """获取 V1 in_send 中每个 logistic_num 的最新版本"""
    my_cur.execute("""
        SELECT
            s.date_sent, s.logistic_num, s.price_kg, s.total_weight,
            s.total_price, s.usd_rmb, s.mode, s.date_eta, s.pallets,
            s.note, s.date_record, s.`by`, s.seq
        FROM in_send s
        INNER JOIN (
            SELECT logistic_num, MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) AS max_seq
            FROM in_send
            GROUP BY logistic_num
        ) latest ON s.logistic_num = latest.logistic_num
            AND CAST(SUBSTRING(s.seq, 2) AS UNSIGNED) = latest.max_seq
        ORDER BY s.logistic_num
    """)
    rows = my_cur.fetchall()
    log(f'  V1 in_send: {len(rows)} unique logistic_nums (latest version)')
    return rows


def fetch_v1_items(my_cur):
    """获取 V1 in_send_final 中的所有发货明细"""
    my_cur.execute("""
        SELECT sent_logistic_num, po_num, po_sku, sent_quantity, po_price,
               sent_note, sent_seq, sent_by, sent_date
        FROM in_send_final
        ORDER BY sent_logistic_num, po_num, po_sku
    """)
    rows = my_cur.fetchall()
    log(f'  V1 in_send_final: {len(rows)} item rows')
    return rows


# ============================================================
# Step 2: 从 V3 PostgreSQL 读取现有发货单
# ============================================================

def fetch_v3_shipments(pg_cur):
    """获取 V3 shipments 表中所有记录的 logistic_num → (id, total_weight, price_kg, rate_mode)"""
    pg_cur.execute("""
        SELECT id, logistic_num, total_weight, price_kg, rate_mode
        FROM shipments
        ORDER BY logistic_num
    """)
    rows = pg_cur.fetchall()
    result = {}
    for r in rows:
        result[r[1]] = {
            'id': r[0],
            'total_weight': r[2],
            'price_kg': r[3],
            'rate_mode': r[4],
        }
    log(f'  V3 shipments: {len(result)} records')
    return result


# ============================================================
# Step 3: 回填逻辑
# ============================================================

def backfill(my_cur, pg_cur, dry_run=False, verify_only=False):
    v1_rows = fetch_v1_shipments(my_cur)
    v1_items = fetch_v1_items(my_cur)
    v3_map = fetch_v3_shipments(pg_cur)

    # Build V1 items map: logistic_num → [items]
    v1_items_map = {}
    for r in v1_items:
        ln = r[0]
        if ln not in v1_items_map:
            v1_items_map[ln] = []
        v1_items_map[ln].append(r)

    # Get PO mapping for inserts
    pg_cur.execute('SELECT id, po_num FROM purchase_orders')
    po_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    updated = 0
    inserted = 0
    skipped = 0
    missing_in_v3 = []

    for r in v1_rows:
        date_sent = r[0]
        logistic_num = r[1]
        price_kg = safe_decimal(r[2], 5) or Decimal('0')
        total_weight = safe_decimal(r[3], 2) or Decimal('0')
        total_price = safe_decimal(r[4], 2) or Decimal('0')
        exchange_rate = safe_decimal(r[5], 4) or Decimal('7')
        mode = r[6] or 'M'
        eta_date = safe_date(r[7])
        pallets = r[8] or 0
        note = r[9]
        created_by = r[11] or 'system'

        if logistic_num in v3_map:
            # ── EXISTS in V3 → UPDATE total_weight, price_kg, rate_mode ──
            v3_rec = v3_map[logistic_num]
            needs_update = (
                float(v3_rec['total_weight']) == 0 and float(total_weight) != 0
            ) or (
                float(v3_rec['price_kg']) == 0 and float(price_kg) != 0
            ) or (
                v3_rec['rate_mode'] == 'M' and mode == 'A'
            )

            if needs_update:
                if verify_only:
                    log(f'  UPDATE needed: {logistic_num}'
                        f'  weight: {v3_rec["total_weight"]}→{total_weight}'
                        f'  price_kg: {v3_rec["price_kg"]}→{price_kg}'
                        f'  rate_mode: {v3_rec["rate_mode"]}→{mode}')
                elif not dry_run:
                    pg_cur.execute("""
                        UPDATE shipments
                        SET total_weight = %s, price_kg = %s, rate_mode = %s,
                            updated_at = NOW()
                        WHERE id = %s
                    """, (total_weight, price_kg, mode, v3_rec['id']))
                updated += 1
            else:
                skipped += 1
        else:
            # ── NOT in V3 → INSERT new shipment ──
            missing_in_v3.append(logistic_num)
            if verify_only:
                log(f'  MISSING in V3: {logistic_num}  sent={date_sent}  cost=¥{total_price}'
                    f'  weight={total_weight}kg  price_kg={price_kg}')
            elif not dry_run:
                pg_cur.execute("""
                    INSERT INTO shipments
                    (logistic_num, sent_date, eta_date, pallets, logistics_cost,
                     exchange_rate, total_weight, price_kg, rate_mode,
                     status, note, created_at, updated_at, created_by, version)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s,
                            'pending', %s, NOW(), NOW(), %s, 0)
                    RETURNING id
                """, (
                    logistic_num, date_sent, eta_date, pallets, total_price,
                    exchange_rate, total_weight, price_kg, mode,
                    note, created_by
                ))
                ship_id = pg_cur.fetchone()[0]

                # Insert items from V1
                items = v1_items_map.get(logistic_num, [])
                for item in items:
                    po_id = po_map.get(item[1])
                    pg_cur.execute("""
                        INSERT INTO shipment_items
                        (shipment_id, logistic_num, po_id, po_num, sku, quantity,
                         unit_price, po_change, note, created_at, updated_at,
                         created_by, version)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, %s,
                                NOW(), NOW(), %s, 0)
                    """, (
                        ship_id, logistic_num,
                        po_id, item[1],     # po_id, po_num
                        item[2],            # sku
                        item[3] or 0,       # quantity
                        safe_decimal(item[4]) or Decimal('0'),  # unit_price
                        item[5],            # note
                        item[7] or 'system' # created_by
                    ))

                log(f'  INSERT: {logistic_num} + {len(items)} items')
            inserted += 1

    return updated, inserted, skipped, missing_in_v3


# ============================================================
# Main
# ============================================================

def main():
    parser = argparse.ArgumentParser(description='V1→V3 发货单字段回填')
    parser.add_argument('--dry-run', action='store_true', help='只打印不执行')
    parser.add_argument('--verify-only', action='store_true', help='只验证差异')
    args = parser.parse_args()

    log('═══════════════════════════════════════════════')
    log('V1→V3 Shipment Field Backfill')
    log('═══════════════════════════════════════════════')

    my_conn = pymysql.connect(**MYSQL_CONF)
    pg_conn = psycopg2.connect(**PG_CONF)

    try:
        my_cur = my_conn.cursor()
        pg_cur = pg_conn.cursor()

        updated, inserted, skipped, missing = backfill(
            my_cur, pg_cur,
            dry_run=args.dry_run,
            verify_only=args.verify_only
        )

        log('═══════════════════════════════════════════════')
        log(f'Results:')
        log(f'  Updated (weight/price_kg/rate_mode): {updated}')
        log(f'  Inserted (new shipments):            {inserted}')
        log(f'  Skipped (already correct):            {skipped}')
        if missing:
            log(f'  Missing logistic_nums: {", ".join(missing[:20])}{"..." if len(missing) > 20 else ""}')
        log('═══════════════════════════════════════════════')

        if not args.dry_run and not args.verify_only:
            pg_conn.commit()
            log('✅ COMMITTED to V3 database')
        else:
            pg_conn.rollback()
            mode = 'DRY RUN' if args.dry_run else 'VERIFY ONLY'
            log(f'ℹ️  {mode} — no changes applied')

    except Exception as e:
        pg_conn.rollback()
        log(f'❌ Error: {e}', 'ERROR')
        raise
    finally:
        my_conn.close()
        pg_conn.close()

    log('Done.')


if __name__ == '__main__':
    main()
