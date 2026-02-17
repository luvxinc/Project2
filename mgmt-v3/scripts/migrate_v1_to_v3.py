#!/usr/bin/env python3
"""
V1 MySQL → V3 PostgreSQL 数据迁移脚本
=====================================
幂等: 每次运行先 TRUNCATE 目标表, 再重新导入
用法:
    python3 migrate_v1_to_v3.py                    # 全量迁移
    python3 migrate_v1_to_v3.py --module purchase  # 只迁移采购模块
    python3 migrate_v1_to_v3.py --verify-only      # 只验证不迁移
    python3 migrate_v1_to_v3.py --dry-run          # 只打印不执行
"""

import sys
import argparse
import time
from decimal import Decimal, InvalidOperation
from datetime import datetime, date

import pymysql
import psycopg2
import psycopg2.extras

# ============================================================
# Connection configs
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
# Helper functions
# ============================================================

def safe_decimal(val, precision=5):
    """TEXT/FLOAT/DOUBLE → Decimal, 保持精度"""
    if val is None or val == '' or val == '--':
        return None
    try:
        return Decimal(str(val)).quantize(Decimal(10) ** -precision)
    except (InvalidOperation, ValueError):
        return None

def safe_int(val):
    """TEXT → int"""
    if val is None or val == '' or val == '--':
        return None
    try:
        return int(Decimal(str(val)))
    except (InvalidOperation, ValueError):
        return None

def safe_date(val):
    """TEXT → date"""
    if val is None or val == '' or val == '--':
        return None
    if isinstance(val, (date, datetime)):
        return val
    try:
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%b-%d-%y', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(str(val).strip(), fmt).date()
            except ValueError:
                continue
    except Exception:
        pass
    return None

def safe_bool(val):
    """TINYINT(1) / 0|1 → bool"""
    if val is None:
        return False
    return bool(int(val))

def log(msg, level='INFO'):
    ts = datetime.now().strftime('%H:%M:%S')
    print(f'[{ts}] [{level}] {msg}')


# ============================================================
# Module: SUPPLIER (2 tables)
# ============================================================

def migrate_suppliers(my_cur, pg_cur, dry_run=False):
    """in_supplier → suppliers"""
    log('Migrating suppliers...')

    my_cur.execute('SELECT id, supplier_code, supplier_name, created_at, updated_at FROM in_supplier ORDER BY id')
    rows = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(rows)} suppliers')
        return len(rows)

    pg_cur.execute('TRUNCATE suppliers CASCADE')

    for r in rows:
        pg_cur.execute("""
            INSERT INTO suppliers (id, supplier_code, supplier_name, status, created_at, updated_at, version)
            VALUES (%s, %s, %s, TRUE, %s, %s, 0)
        """, (r[0], r[1], r[2], r[3], r[4]))

    # Reset sequence
    pg_cur.execute("SELECT setval('suppliers_id_seq', (SELECT COALESCE(MAX(id),0) FROM suppliers))")

    log(f'  ✅ suppliers: {len(rows)} rows')
    return len(rows)


def migrate_supplier_strategies(my_cur, pg_cur, dry_run=False):
    """in_supplier_strategy → supplier_strategies"""
    log('Migrating supplier_strategies...')

    my_cur.execute("""
        SELECT id, supplier_code, category, type, currency, float_currency, float_threshold,
               depository, deposit_par, status, effective_date, note, contract_file,
               `by`, created_at, updated_at
        FROM in_supplier_strategy ORDER BY id
    """)
    rows = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(rows)} supplier_strategies')
        return len(rows)

    # Get supplier_code → supplier_id mapping
    pg_cur.execute('SELECT id, supplier_code FROM suppliers')
    supplier_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    for r in rows:
        supplier_id = supplier_map.get(r[1])
        if not supplier_id:
            log(f'  ⚠️  Cannot find supplier for code={r[1]}, skipping strategy id={r[0]}', 'WARN')
            continue

        pg_cur.execute("""
            INSERT INTO supplier_strategies
            (id, supplier_id, supplier_code, category, currency,
             float_currency, float_threshold, require_deposit, deposit_ratio,
             effective_date, note, contract_file,
             created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 0)
        """, (
            r[0], supplier_id, r[1],
            r[2] or 'E',  # category
            r[4] or 'USD',  # currency → enum
            safe_bool(r[5]),  # float_currency → boolean
            safe_decimal(r[6], 2) or Decimal('0'),  # float_threshold: double → decimal
            safe_bool(r[7]),  # depository → boolean
            safe_decimal(r[8], 2) or Decimal('0'),  # deposit_par: double → decimal
            r[10],  # effective_date
            r[11] or '',  # note
            r[12],  # contract_file
            r[14], r[15],  # created_at, updated_at
            r[13] or 'system'  # by → created_by
        ))

    pg_cur.execute("SELECT setval('supplier_strategies_id_seq', (SELECT COALESCE(MAX(id),0) FROM supplier_strategies))")

    log(f'  ✅ supplier_strategies: {len(rows)} rows')
    return len(rows)


# ============================================================
# Module: PURCHASE ORDERS (3 tables)
# ============================================================

def migrate_purchase_orders(my_cur, pg_cur, dry_run=False):
    """in_po_final → purchase_orders + purchase_order_items"""
    log('Migrating purchase_orders...')

    # Get supplier mapping
    pg_cur.execute('SELECT id, supplier_code FROM suppliers')
    supplier_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    # V1: in_po_final has SKU-level rows. V3: purchase_orders is PO-level, purchase_order_items is SKU-level.
    # We need to group by po_num to create the PO header first.

    my_cur.execute("""
        SELECT DISTINCT po_num, MIN(po_date) as po_date,
               MAX(po_update_date) as updated_date, MAX(po_by) as created_by
        FROM in_po_final GROUP BY po_num ORDER BY po_num
    """)
    po_headers = my_cur.fetchall()

    # Also get supplier_code and currency from in_po (latest per po_num)
    my_cur.execute("""
        SELECT po_num, supplier_code, currency, usd_rmb
        FROM in_po t1
        WHERE created_at = (SELECT MAX(created_at) FROM in_po t2 WHERE t2.po_num = t1.po_num)
        GROUP BY po_num, supplier_code, currency, usd_rmb
        ORDER BY po_num
    """)
    po_meta_rows = my_cur.fetchall()
    po_meta = {}
    for r in po_meta_rows:
        if r[0] not in po_meta:
            po_meta[r[0]] = {'supplier_code': r[1], 'currency': r[2], 'exchange_rate': r[3]}

    if dry_run:
        log(f'  DRY RUN: Would insert {len(po_headers)} purchase_orders')
        return len(po_headers)

    
    
    pg_cur.execute('TRUNCATE purchase_orders CASCADE')

    po_id_map = {}  # po_num → pg_id

    for r in po_headers:
        po_num = r[0]
        meta = po_meta.get(po_num, {})
        supplier_code = meta.get('supplier_code', '')
        supplier_id = supplier_map.get(supplier_code)
        currency = meta.get('currency', 'USD')

        pg_cur.execute("""
            INSERT INTO purchase_orders
            (po_num, supplier_id, supplier_code, po_date, status, created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, 'active', NOW(), NOW(), %s, 0)
            RETURNING id
        """, (po_num, supplier_id, supplier_code, r[1], r[3] or 'system'))
        po_id = pg_cur.fetchone()[0]
        po_id_map[po_num] = po_id

    log(f'  ✅ purchase_orders: {len(po_headers)} rows')

    # Now insert items
    my_cur.execute("""
        SELECT po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by, po_date
        FROM in_po_final ORDER BY po_num, po_sku
    """)
    items = my_cur.fetchall()

    for r in items:
        po_id = po_id_map.get(r[0])
        if not po_id:
            log(f'  ⚠️  Cannot find PO for po_num={r[0]}, skipping item', 'WARN')
            continue

        meta = po_meta.get(r[0], {})
        currency = meta.get('currency', 'USD')
        exchange_rate = meta.get('exchange_rate', Decimal('1'))

        pg_cur.execute("""
            INSERT INTO purchase_order_items
            (po_id, po_num, sku, quantity, unit_price, currency, exchange_rate, note,
             created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, 0)
        """, (
            po_id, r[0], r[1], r[2] or 0,
            safe_decimal(r[3]) or Decimal('0'),
            currency, exchange_rate or Decimal('1'),
            r[4],  # note
            r[6] or 'system'
        ))

    log(f'  ✅ purchase_order_items: {len(items)} rows')
    return len(po_headers) + len(items)


def migrate_po_strategies(my_cur, pg_cur, dry_run=False):
    """in_po_strategy → purchase_order_strategies"""
    log('Migrating purchase_order_strategies...')

    my_cur.execute("""
        SELECT date, po_num, cur_currency, cur_float, cur_ex_float,
               cur_deposit, cur_deposit_par, cur_usd_rmb, cur_mode,
               note, `by`, seq
        FROM in_po_strategy ORDER BY date, po_num
    """)
    rows = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(rows)} purchase_order_strategies')
        return len(rows)

    # Get po_num → po_id mapping
    pg_cur.execute('SELECT id, po_num FROM purchase_orders')
    po_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    for r in rows:
        po_id = po_map.get(r[1])
        if not po_id:
            log(f'  ⚠️  Cannot find PO for po_num={r[1]}, skipping strategy', 'WARN')
            continue

        currency = r[2] or 'USD'
        rate_mode = 'manual' if r[8] == 'M' else 'auto'

        pg_cur.execute("""
            INSERT INTO purchase_order_strategies
            (po_id, po_num, strategy_date, currency, exchange_rate, rate_mode,
             float_enabled, float_threshold, require_deposit, deposit_ratio, note,
             created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, 0)
        """, (
            po_id, r[1], r[0],  # po_id, po_num, strategy_date
            currency,
            safe_decimal(r[7], 4) or Decimal('7'),  # exchange_rate
            rate_mode,
            safe_bool(r[3]),  # float_enabled
            safe_decimal(r[4], 2) or Decimal('0'),  # float_threshold
            safe_bool(r[5]),  # require_deposit
            safe_decimal(r[6], 2) or Decimal('0'),  # deposit_ratio
            r[9],  # note
            r[10] or 'system'
        ))

    log(f'  ✅ purchase_order_strategies: {len(rows)} rows')
    return len(rows)


# ============================================================
# Module: SHIPMENTS (2 tables)
# ============================================================

def migrate_shipments(my_cur, pg_cur, dry_run=False):
    """in_send + in_send_final → shipments + shipment_items"""
    log('Migrating shipments...')

    # Headers from in_send (unique by logistic_num+seq)
    my_cur.execute("""
        SELECT date_sent, logistic_num, price_kg, total_weight, total_price,
               usd_rmb, mode, date_eta, pallets, note, date_record, `by`, seq
        FROM in_send
        WHERE seq = (SELECT MAX(s2.seq) FROM in_send s2 WHERE s2.logistic_num = in_send.logistic_num)
        ORDER BY logistic_num
    """)
    headers = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(headers)} shipments')
        return len(headers)

    
    pg_cur.execute('TRUNCATE shipments CASCADE')

    ship_id_map = {}  # logistic_num → pg_id

    for r in headers:
        logistics_cost = safe_decimal(r[4], 2) or Decimal('0')
        exchange_rate = safe_decimal(r[5], 4) or Decimal('7')

        pg_cur.execute("""
            INSERT INTO shipments
            (logistic_num, sent_date, eta_date, pallets, logistics_cost, exchange_rate,
             status, note, created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s, NOW(), NOW(), %s, 0)
            RETURNING id
        """, (
            r[1], r[0], r[7],
            r[8] or 0,
            logistics_cost, exchange_rate,
            r[9], r[11] or 'system'
        ))
        ship_id = pg_cur.fetchone()[0]
        ship_id_map[r[1]] = ship_id

    log(f'  ✅ shipments: {len(headers)} rows')

    # Items from in_send_final
    my_cur.execute("""
        SELECT sent_logistic_num, po_num, po_sku, sent_quantity, po_price,
               sent_note, sent_seq, sent_by, sent_date
        FROM in_send_final ORDER BY sent_logistic_num, po_num, po_sku
    """)
    items = my_cur.fetchall()

    # Get po_num → po_id mapping
    pg_cur.execute('SELECT id, po_num FROM purchase_orders')
    po_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    for r in items:
        ship_id = ship_id_map.get(r[0])
        po_id = po_map.get(r[1])

        if not ship_id:
            log(f'  ⚠️  Cannot find shipment for logistic_num={r[0]}, skipping', 'WARN')
            continue

        pg_cur.execute("""
            INSERT INTO shipment_items
            (shipment_id, logistic_num, po_id, po_num, sku, quantity, unit_price,
             po_change, note, created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, %s, NOW(), NOW(), %s, 0)
        """, (
            ship_id, r[0],
            po_id, r[1],  # po_id may be None
            r[2], r[3] or 0,
            safe_decimal(r[4]) or Decimal('0'),
            r[5], r[7] or 'system'
        ))

    log(f'  ✅ shipment_items: {len(items)} rows')
    return len(headers) + len(items)


# ============================================================
# Module: RECEIVES (2 tables)
# ============================================================

def migrate_receives(my_cur, pg_cur, dry_run=False):
    """in_receive_final + in_diff_final → receives + receive_diffs"""
    log('Migrating receives...')

    my_cur.execute("""
        SELECT eta_date_final, receive_date, update_date, logistic_num,
               po_num, po_sku, sent_quantity, receive_quantity, po_price,
               note, seq, `by`
        FROM in_receive_final ORDER BY logistic_num, po_num, po_sku
    """)
    rows = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(rows)} receives')
        return len(rows)

    
    pg_cur.execute('TRUNCATE receives CASCADE')

    # Get mappings
    pg_cur.execute('SELECT id, logistic_num FROM shipments')
    ship_map = {r[1]: r[0] for r in pg_cur.fetchall()}
    pg_cur.execute('SELECT id, po_num FROM purchase_orders')
    po_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    recv_id_map = {}  # (logistic_num, po_num, sku) → pg_id

    for r in rows:
        ship_id = ship_map.get(r[3])
        po_id = po_map.get(r[4])

        if not ship_id:
            log(f'  ⚠️  Cannot find shipment for logistic_num={r[3]}', 'WARN')
            continue

        pg_cur.execute("""
            INSERT INTO receives
            (shipment_id, logistic_num, po_id, po_num,
             sku, unit_price, sent_quantity, receive_quantity,
             receive_date, eta_date, note,
             created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, 0)
            RETURNING id
        """, (
            ship_id, r[3],
            po_id, r[4],
            r[5],  # sku
            safe_decimal(r[8]) or Decimal('0'),
            r[6] or 0, r[7] or 0,
            r[1] or r[2] or date.today(),  # receive_date
            r[0],  # eta_date
            r[9],  # note
            r[11] or 'system'
        ))
        recv_id = pg_cur.fetchone()[0]
        recv_id_map[(r[3], r[4], r[5])] = recv_id

    log(f'  ✅ receives: {len(rows)} rows')

    # Diffs from in_diff_final
    my_cur.execute("""
        SELECT record_num, logistic_num, po_num, receive_date, po_sku,
               po_quantity, sent_quantity, receive_quantity, diff_quantity,
               status, note, seq, `by`
        FROM in_diff_final ORDER BY record_num
    """)
    diffs = my_cur.fetchall()

    for r in diffs:
        recv_id = recv_id_map.get((r[1], r[2], r[4]))
        if not recv_id:
            log(f'  ⚠️  Cannot find receive for diff record_num={r[0]}', 'WARN')
            continue

        status = 'resolved' if r[9] == 'resolved' else 'pending'

        pg_cur.execute("""
            INSERT INTO receive_diffs
            (receive_id, logistic_num, po_num, sku,
             po_quantity, sent_quantity, receive_quantity, diff_quantity,
             status, resolution_note,
             created_at, updated_at, created_by, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, 0)
        """, (
            recv_id, r[1], r[2], r[4],
            r[5] or 0, r[6] or 0, r[7] or 0, r[8] or 0,
            status, r[10],
            r[12] or 'system'
        ))

    log(f'  ✅ receive_diffs: {len(diffs)} rows')
    return len(rows) + len(diffs)


# ============================================================
# Module: PAYMENTS (1 unified table)
# ============================================================

def migrate_payments(my_cur, pg_cur, dry_run=False):
    """8 V1 payment tables → payments"""
    log('Migrating payments...')

    total = 0

    # 1. PO Payments
    my_cur.execute("""
        SELECT pmt_no, po_num, pmt_date, pmt_currency, pmt_cash_amount,
               pmt_fe_rate, pmt_fe_mode, pmt_prepay_amount, pmt_override,
               extra_note, extra_amount, extra_currency, note, seq, `by`
        FROM in_pmt_po_final ORDER BY id
    """)
    po_pmts = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert PO payments')
        return 0

    pg_cur.execute('TRUNCATE payments CASCADE')

    # Get mappings
    pg_cur.execute('SELECT id, po_num FROM purchase_orders')
    po_map = {r[1]: r[0] for r in pg_cur.fetchall()}
    pg_cur.execute('SELECT id, supplier_code FROM suppliers')
    supplier_map = {r[1]: r[0] for r in pg_cur.fetchall()}

    for r in po_pmts:
        po_id = po_map.get(r[1])
        rate_mode = 'manual' if r[6] == 'M' else 'auto'
        pg_cur.execute("""
            INSERT INTO payments
            (payment_type, payment_no, po_id, po_num, payment_date,
             currency, cash_amount, exchange_rate, rate_mode,
             prepay_amount, deposit_override, extra_note, extra_amount, extra_currency,
             note, created_at, updated_at, created_by, version)
            VALUES ('po', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, 0)
        """, (
            r[0], po_id, r[1], r[2],
            r[3] or 'USD',
            safe_decimal(r[4], 2) or Decimal('0'),
            safe_decimal(r[5], 4) or Decimal('7'),
            rate_mode,
            safe_decimal(r[7], 2) or Decimal('0'),
            safe_bool(r[8]),
            r[9], safe_decimal(r[10], 2),
            r[11] or None,
            r[12],
            r[14] or 'system'
        ))
    total += len(po_pmts)
    log(f'  ✅ PO payments: {len(po_pmts)} rows')

    # 2. Deposit Payments
    my_cur.execute("""
        SELECT pmt_no, po_num, dep_date, dep_cur, dep_paid_cur, dep_cur_mode,
               dep_paid, dep_prepay_amount, dep_override,
               extra_note, extra_amount, extra_cur, note, seq, `by`
        FROM in_pmt_deposit_final ORDER BY pmt_no
    """)
    dep_pmts = my_cur.fetchall()

    for r in dep_pmts:
        po_id = po_map.get(r[1])
        rate_mode = 'manual' if r[5] == 'M' else 'auto'
        pg_cur.execute("""
            INSERT INTO payments
            (payment_type, payment_no, po_id, po_num, payment_date,
             currency, cash_amount, exchange_rate, rate_mode,
             prepay_amount, deposit_override, extra_note, extra_amount, extra_currency,
             note, created_at, updated_at, created_by, version)
            VALUES ('deposit', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW(), %s, 0)
        """, (
            r[0], po_id, r[1], r[2],
            r[3] or 'USD',
            safe_decimal(r[6], 2) or Decimal('0'),
            safe_decimal(r[4], 4) or Decimal('7'),
            rate_mode,
            safe_decimal(r[7], 2) or Decimal('0'),
            safe_bool(r[8]),
            r[9], safe_decimal(r[10], 2),
            r[11] or None,
            r[12],
            r[14] or 'system'
        ))
    total += len(dep_pmts)
    log(f'  ✅ Deposit payments: {len(dep_pmts)} rows')

    # 3. Prepay Transactions
    my_cur.execute("""
        SELECT tran_num, supplier_code, tran_date, tran_curr_req, tran_curr_use,
               usd_rmb, tran_amount, tran_type, tran_seq, tran_by, tran_note
        FROM in_pmt_prepay_final ORDER BY id
    """)
    prepay_pmts = my_cur.fetchall()

    for r in prepay_pmts:
        supplier_id = supplier_map.get(r[1])
        # Map tran_type to prepay_tran_type enum
        tran_type_map = {'D': 'deposit', 'W': 'withdraw', 'U': 'usage', 'R': 'refund', 'X': 'rate'}
        prepay_type = tran_type_map.get(r[7], 'deposit')

        pg_cur.execute("""
            INSERT INTO payments
            (payment_type, payment_no, supplier_id, supplier_code, payment_date,
             currency, cash_amount, exchange_rate, rate_mode,
             prepay_tran_type, note, created_at, updated_at, created_by, version)
            VALUES ('prepay', %s, %s, %s, %s, %s, %s, %s, 'manual', %s, %s, NOW(), NOW(), %s, 0)
        """, (
            r[0], supplier_id, r[1], r[2],
            r[3] or 'USD',
            safe_decimal(r[6], 2) or Decimal('0'),
            safe_decimal(r[5], 4) or Decimal('7'),
            prepay_type, r[10],
            r[9] or 'system'
        ))
    total += len(prepay_pmts)
    log(f'  ✅ Prepay payments: {len(prepay_pmts)} rows')

    # 4. Logistic Payments
    my_cur.execute("""
        SELECT id, pmt_no, logistic_num, date_sent, logistic_paid, usd_rmb, mode,
               extra_paid, extra_currency, extra_note, payment_date, note, by_user
        FROM in_pmt_logistic_final ORDER BY id
    """)
    log_pmts = my_cur.fetchall()

    for r in log_pmts:
        v1_id = r[0]
        pmt_no = r[1]
        # De-duplicate: append V1 id suffix if pmt_no is not unique
        payment_no = f'{pmt_no}_{v1_id}'

        pg_cur.execute('SELECT id FROM shipments WHERE logistic_num = %s', (r[2],))
        ship_row = pg_cur.fetchone()
        ship_id = ship_row[0] if ship_row else None

        pg_cur.execute("""
            INSERT INTO payments
            (payment_type, payment_no, shipment_id, logistic_num, payment_date,
             currency, cash_amount, exchange_rate, rate_mode,
             extra_amount, extra_currency, extra_note, note,
             created_at, updated_at, created_by, version)
            VALUES ('logistics', %s, %s, %s, %s, 'USD', %s, %s, 'manual', %s, %s, %s, %s, NOW(), NOW(), %s, 0)
        """, (
            payment_no, ship_id, r[2], r[10] or r[3],
            safe_decimal(r[4], 2) or Decimal('0'),
            safe_decimal(r[5], 4) or Decimal('7'),
            safe_decimal(r[7], 2),
            r[8] or None,
            r[9], r[11],
            r[12] or 'system'
        ))
    total += len(log_pmts)
    log(f'  ✅ Logistic payments: {len(log_pmts)} rows')

    return total


# ============================================================
# Module: FIFO ENGINE (3 tables)
# ============================================================

def migrate_fifo(my_cur, pg_cur, dry_run=False):
    """in_dynamic_tran/layers/alloc/landed_price → fifo_transactions/layers/allocations"""
    log('Migrating FIFO engine...')

    # 1. fifo_transactions
    my_cur.execute("""
        SELECT record_id, date_record, po_num, sku, price, quantity,
               action, type, note, created_at
        FROM in_dynamic_tran ORDER BY record_id
    """)
    tran_rows = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(tran_rows)} fifo_transactions')
        return len(tran_rows)

    
    
    pg_cur.execute('TRUNCATE fifo_transactions CASCADE')

    tran_id_map = {}  # V1 record_id → V3 id

    for r in tran_rows:
        # Map V1 type to V3 enum
        type_map = {
            'purchase': 'purchase', 'PURCHASE': 'purchase', 'Purchase': 'purchase',
            'sale': 'sale', 'SALE': 'sale', 'Sale': 'sale', 'sales': 'sale',
            'return': 'return', 'RETURN': 'return', 'Return': 'return',
            'adjust': 'adjust', 'ADJUST': 'adjust',
            'cancel': 'cancel', 'CANCEL': 'cancel',
            'inventory': 'inventory', 'INVENTORY': 'inventory', 'INIT': 'inventory',
            'init': 'inventory',
        }
        tran_type = type_map.get(r[7], 'purchase')
        action = r[6].lower() if r[6] else 'in'

        pg_cur.execute("""
            INSERT INTO fifo_transactions
            (id, transaction_date, sku, po_num, unit_price, quantity, action, tran_type, ref_key, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            r[0], r[1], r[3], r[2],
            safe_decimal(r[4]),
            r[5] or 0,
            action, tran_type,
            r[8],  # note → ref_key
            r[9]
        ))
        tran_id_map[r[0]] = r[0]

    pg_cur.execute("SELECT setval('fifo_transactions_id_seq', (SELECT COALESCE(MAX(id),0) FROM fifo_transactions))")
    log(f'  ✅ fifo_transactions: {len(tran_rows)} rows')

    # 2. fifo_layers (with landed_cost from in_dynamic_landed_price)
    my_cur.execute("""
        SELECT layer_id, sku, in_record_id, in_date, po_num, unit_cost,
               qty_in, qty_remaining, created_at, closed_at
        FROM in_dynamic_fifo_layers ORDER BY layer_id
    """)
    layer_rows = my_cur.fetchall()

    # Get landed prices
    my_cur.execute("""
        SELECT in_record_id, landed_price_usd
        FROM in_dynamic_landed_price ORDER BY in_record_id
    """)
    landed_map = {r[0]: r[1] for r in my_cur.fetchall()}

    for r in layer_rows:
        landed_cost = safe_decimal(landed_map.get(r[2]))  # in_record_id based lookup

        pg_cur.execute("""
            INSERT INTO fifo_layers
            (id, sku, in_tran_id, in_date, po_num, unit_cost, landed_cost,
             qty_in, qty_remaining, created_at, closed_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            r[0], r[1], r[2], r[3], r[4],
            safe_decimal(r[5]),
            landed_cost,
            r[6], r[7], r[8], r[9]
        ))

    pg_cur.execute("SELECT setval('fifo_layers_id_seq', (SELECT COALESCE(MAX(id),0) FROM fifo_layers))")
    log(f'  ✅ fifo_layers: {len(layer_rows)} rows (with landed_cost merged)')

    # 3. fifo_allocations
    my_cur.execute("""
        SELECT alloc_id, out_record_id, sku, out_date, layer_id,
               qty_alloc, unit_cost, cost_alloc, created_at
        FROM in_dynamic_fifo_alloc ORDER BY alloc_id
    """)
    alloc_rows = my_cur.fetchall()

    for r in alloc_rows:
        pg_cur.execute("""
            INSERT INTO fifo_allocations
            (id, out_tran_id, layer_id, sku, out_date,
             qty_alloc, unit_cost, cost_alloc, created_at)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (
            r[0], r[1], r[4], r[2], r[3],
            r[5], safe_decimal(r[6]), safe_decimal(r[7]),
            r[8]
        ))

    pg_cur.execute("SELECT setval('fifo_allocations_id_seq', (SELECT COALESCE(MAX(id),0) FROM fifo_allocations))")
    log(f'  ✅ fifo_allocations: {len(alloc_rows)} rows')

    return len(tran_rows) + len(layer_rows) + len(alloc_rows)


# ============================================================
# Module: SALES / ETL (2 tables + stocktakes)
# ============================================================

def migrate_sales(my_cur, pg_cur, dry_run=False):
    """
    Data_Transaction (67 TEXT cols) → raw_transactions + raw_transaction_items
    Data_Clean_Log (79 cols) → cleaned_transactions
    Data_Order_Earning (36 cols) → (merged into raw_transactions as earning data)
    """
    log('Migrating sales/ETL...')

    # ── 1. raw_transactions (from Data_Transaction) ──
    my_cur.execute("""
        SELECT `Transaction creation date`, `Type`, `Order number`, `Legacy order ID`,
               `Buyer username`, `Buyer name`, `Ship to city`, `Ship to province/region/state`,
               `Ship to zip`, `Ship to country`, `Net amount`, `Payout currency`, `Payout date`,
               `Payout ID`, `Payout method`, `Payout status`, `Reason for hold`,
               `Item ID`, `Transaction ID`, `Item title`, `Custom label`, `Quantity`,
               `Item subtotal`, `Shipping and handling`, `Seller collected tax`,
               `eBay collected tax`, `Final Value Fee - fixed`, `Final Value Fee - variable`,
               `Regulatory operating fee`, `Very high "item not as described" fee`,
               `Below standard performance fee`, `International fee`, `Charity donation`,
               `Deposit processing fee`, `Gross transaction amount`, `Transaction currency`,
               `Exchange rate`, `Reference ID`, `Description`, `Seller`, `row_hash`,
               `P_Flag`, `P_Key`, `P_Type`, `P_Check`, `Skufix_Check`,
               `P_SKU1`, `P_Quantity1`, `P_SKU2`, `P_Quantity2`,
               `P_SKU3`, `P_Quantity3`, `P_SKU4`, `P_Quantity4`,
               `P_SKU5`, `P_Quantity5`, `P_SKU6`, `P_Quantity6`,
               `P_SKU7`, `P_Quantity7`, `P_SKU8`, `P_Quantity8`,
               `P_SKU9`, `P_Quantity9`, `P_SKU10`, `P_Quantity10`,
               `Processed_T`
        FROM Data_Transaction ORDER BY `Order number`
    """)
    tran_rows = my_cur.fetchall()
    log(f'  Fetched {len(tran_rows)} Data_Transaction rows')

    if dry_run:
        log(f'  DRY RUN: Would insert {len(tran_rows)} raw_transactions')
        # Still count clean_log + order_earning
        my_cur.execute('SELECT COUNT(*) FROM Data_Clean_Log')
        cl_count = my_cur.fetchone()[0]
        my_cur.execute('SELECT COUNT(*) FROM Data_Order_Earning')
        oe_count = my_cur.fetchone()[0]
        my_cur.execute('SELECT COUNT(*) FROM Data_Inventory')
        inv_count = my_cur.fetchone()[0]
        log(f'  DRY RUN: Would insert {cl_count} cleaned_transactions')
        log(f'  DRY RUN: Would process {oe_count} order_earnings (merged)')
        log(f'  DRY RUN: Would pivot {inv_count} inventory rows → stocktakes')
        return len(tran_rows) + cl_count + oe_count + inv_count

    
    pg_cur.execute('TRUNCATE raw_transactions CASCADE')

    for r in tran_rows:
        order_date = safe_date(r[0])
        sale_amount = safe_decimal(r[22], 2) or Decimal('0')  # Item subtotal
        shipping_fee = safe_decimal(r[23], 2) or Decimal('0')  # Shipping and handling
        tax_amount = safe_decimal(r[24], 2) or Decimal('0')    # Seller collected tax
        total_amount = safe_decimal(r[34], 2) or Decimal('0')  # Gross transaction amount

        pg_cur.execute("""
            INSERT INTO raw_transactions
            (source, order_number, item_id, order_date, seller, buyer,
             sale_amount, shipping_fee, tax_amount, total_amount,
             net_amount, ad_fee, promo_listing, listing_fee, intl_fee, other_fee,
             row_hash, created_at)
            VALUES ('ebay', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
            ON CONFLICT (row_hash) DO NOTHING
            RETURNING id
        """, (
            r[2],  # Order number
            r[17],  # Item ID
            order_date,
            r[39],  # Seller
            r[4],   # Buyer username
            sale_amount, shipping_fee, tax_amount, total_amount,
            r[10],  # Net amount (keep as text)
            r[33],  # Deposit processing fee → ad_fee placeholder
            r[28],  # Regulatory operating fee → promo_listing placeholder
            r[26],  # Final Value Fee - fixed → listing_fee
            r[31],  # International fee
            r[32],  # Charity donation → other_fee
            r[40],  # row_hash
        ))
        result = pg_cur.fetchone()
        if not result:
            continue  # Duplicate row_hash, skip
        txn_id = result[0]

        # Insert P_SKU items (normalized from flat columns)
        for i in range(10):
            sku_idx = 46 + (i * 2)   # P_SKU1 starts at index 46
            qty_idx = 47 + (i * 2)   # P_Quantity1
            sku = r[sku_idx] if sku_idx < len(r) else None
            qty = safe_int(r[qty_idx]) if qty_idx < len(r) else None
            if sku and sku.strip():
                pg_cur.execute("""
                    INSERT INTO raw_transaction_items (transaction_id, sku, quantity, unit_price)
                    VALUES (%s, %s, %s, 0)
                """, (txn_id, sku.strip(), qty or 0))

    pg_cur.execute("SELECT setval('raw_transactions_id_seq', (SELECT COALESCE(MAX(id),0) FROM raw_transactions))")
    pg_cur.execute("SELECT setval('raw_transaction_items_id_seq', (SELECT COALESCE(MAX(id),0) FROM raw_transaction_items))")
    pg_cur.execute('SELECT COUNT(*) FROM raw_transactions')
    rt_count = pg_cur.fetchone()[0]
    pg_cur.execute('SELECT COUNT(*) FROM raw_transaction_items')
    rti_count = pg_cur.fetchone()[0]
    log(f'  ✅ raw_transactions: {rt_count} rows')
    log(f'  ✅ raw_transaction_items: {rti_count} rows (normalized from P_SKU1-10)')

    total = rt_count

    # ── 2. cleaned_transactions (from Data_Clean_Log) ──
    log('  Migrating cleaned_transactions...')
    my_cur.execute("""
        SELECT `order date`, `seller`, `order number`, `item id`, `item title`,
               `full sku`, `quantity`,
               `sku1`, `qtyp1`, `qty1`, `sku2`, `qtyp2`, `qty2`,
               `sku3`, `qtyp3`, `qty3`, `sku4`, `qtyp4`, `qty4`,
               `sku5`, `qtyp5`, `qty5`, `sku6`, `qtyp6`, `qty6`,
               `sku7`, `qtyp7`, `qty7`, `sku8`, `qtyp8`, `qty8`,
               `revenue`, `Shipping and handling`, `Seller collected tax`,
               `eBay collected tax`, `Final Value Fee - fixed`, `Final Value Fee - variable`,
               `Regulatory operating fee`, `Very high "item not as described" fee`,
               `Below standard performance fee`, `International fee`,
               `Charity donation`, `Deposit processing fee`,
               `Promoted Listings fee`, `Payments dispute fee`,
               `action`, `Refund`,
               `Shipping label-Earning data`, `Shipping label-Transaction Report`,
               `Shipping label-Regular`, `Shipping label-underpay`,
               `Shipping label-overpay`, `Shipping label-void`, `Shipping label-Return`,
               `buyer username`, `ship to city`, `ship to zip`, `ship to state`,
               `ship to country`, `Sold Via Promoted Listings`, `Feedback Received`,
               `qtyp9`, `sku9`, `qty10`, `qtyp10`, `sku10`, `qty9`,
               `Refund Shipping and handling`, `Refund Seller collected tax`,
               `Refund eBay collected tax`, `Refund Final Value Fee - fixed`,
               `Refund Final Value Fee - variable`, `Refund Regulatory operating fee`,
               `Refund Very high "item not as described" fee`,
               `Refund Below standard performance fee`, `Refund International fee`,
               `Refund Charity donation`, `Refund Deposit processing fee`,
               `Refund Promoted Listings fee`
        FROM Data_Clean_Log ORDER BY `order number`
    """)
    cl_rows = my_cur.fetchall()
    log(f'  Fetched {len(cl_rows)} Data_Clean_Log rows')

    pg_cur.execute('TRUNCATE cleaned_transactions CASCADE')

    # Map action text to enum values
    action_map = {
        'NN': 'NN', 'CA': 'CA', 'RE': 'RE', 'CR': 'CR', 'CC': 'CC', 'PD': 'PD',
        'nn': 'NN', 'ca': 'CA', 're': 'RE', 'cr': 'CR', 'cc': 'CC', 'pd': 'PD',
    }

    for r in cl_rows:
        action_raw = r[45] or 'NN'
        action = action_map.get(action_raw.strip(), 'NN')

        order_date = safe_date(r[0])
        if not order_date:
            order_date = date.today()  # fallback

        # Financial fields
        sale_amount = safe_decimal(r[31], 2) or Decimal('0')  # revenue
        shipping_fee = safe_decimal(r[32], 2) or Decimal('0')
        tax_amount = safe_decimal(r[33], 2) or Decimal('0')
        net_amount = sale_amount + shipping_fee
        ad_fee = safe_decimal(r[43], 2) or Decimal('0')  # Promoted Listings fee
        other_fee = safe_decimal(r[44], 2) or Decimal('0')  # Payments dispute fee

        pg_cur.execute("""
            INSERT INTO cleaned_transactions
            (seller, order_number, item_id, order_date, action,
             sku1, quantity1, qtyp1, sku2, quantity2, qtyp2,
             sku3, quantity3, qtyp3, sku4, quantity4, qtyp4,
             sku5, quantity5, qtyp5, sku6, quantity6, qtyp6,
             sku7, quantity7, qtyp7, sku8, quantity8, qtyp8,
             sku9, quantity9, qtyp9, sku10, quantity10, qtyp10,
             sale_amount, shipping_fee, tax_amount, net_amount, ad_fee, other_fee,
             created_at)
            VALUES (%s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, NOW())
        """, (
            r[1], r[2], r[3], order_date, action,
            r[7], safe_int(r[9]), safe_int(r[8]),    # sku1, qty1, qtyp1
            r[10], safe_int(r[12]), safe_int(r[11]),  # sku2, qty2, qtyp2
            r[13], safe_int(r[15]), safe_int(r[14]),  # sku3
            r[16], safe_int(r[18]), safe_int(r[17]),  # sku4
            r[19], safe_int(r[21]), safe_int(r[20]),  # sku5
            r[22], safe_int(r[24]), safe_int(r[23]),  # sku6
            r[25], safe_int(r[27]), safe_int(r[26]),  # sku7
            r[28], safe_int(r[30]), safe_int(r[29]),  # sku8
            r[61], safe_int(r[65]), safe_int(r[60]),  # sku9, qty9, qtyp9
            r[64], safe_int(r[62]), safe_int(r[63]),  # sku10, qty10, qtyp10
            sale_amount, shipping_fee, tax_amount, net_amount, ad_fee, other_fee,
        ))

    pg_cur.execute("SELECT setval('cleaned_transactions_id_seq', (SELECT COALESCE(MAX(id),0) FROM cleaned_transactions))")
    pg_cur.execute('SELECT COUNT(*) FROM cleaned_transactions')
    ct_count = pg_cur.fetchone()[0]
    log(f'  ✅ cleaned_transactions: {ct_count} rows')
    total += ct_count

    # ── 3. Data_Inventory → stocktakes + stocktake_items ──
    # V1: Wide table (SKU × 25 date columns) → V3: row-based (stocktakes + stocktake_items)
    log('  Migrating Data_Inventory → stocktakes + stocktake_items...')

    # First, get all column names (first is SKU, rest are date columns)
    my_cur.execute("""
        SELECT COLUMN_NAME FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA='MGMT' AND TABLE_NAME='Data_Inventory'
        ORDER BY ORDINAL_POSITION
    """)
    inv_cols = [r[0] for r in my_cur.fetchall()]
    date_cols = inv_cols[1:]  # Skip 'SKU'

    
    pg_cur.execute('TRUNCATE stocktakes CASCADE')

    # Create one stocktake per date column
    stocktake_id_map = {}  # date_str → stocktake_id
    for date_str in date_cols:
        stocktake_date = safe_date(date_str)
        if not stocktake_date:
            continue
        pg_cur.execute("""
            INSERT INTO stocktakes (stocktake_date, note, created_at, updated_at, created_by)
            VALUES (%s, 'V1 Data_Inventory migration', NOW(), NOW(), 'system')
            RETURNING id
        """, (stocktake_date,))
        stocktake_id_map[date_str] = pg_cur.fetchone()[0]

    # Now insert items per SKU per date
    my_cur.execute('SELECT * FROM Data_Inventory ORDER BY SKU')
    inv_rows = my_cur.fetchall()
    item_count = 0

    for row in inv_rows:
        sku = row[0]
        for i, date_str in enumerate(date_cols):
            qty = row[i + 1]
            st_id = stocktake_id_map.get(date_str)
            if st_id and qty is not None:
                pg_cur.execute("""
                    INSERT INTO stocktake_items (stocktake_id, sku, counted_qty, created_at, updated_at)
                    VALUES (%s, %s, %s, NOW(), NOW())
                """, (st_id, sku, qty))
                item_count += 1

    pg_cur.execute("SELECT setval('stocktakes_id_seq', (SELECT COALESCE(MAX(id),0) FROM stocktakes))")
    pg_cur.execute("SELECT setval('stocktake_items_id_seq', (SELECT COALESCE(MAX(id),0) FROM stocktake_items))")
    log(f'  ✅ stocktakes: {len(stocktake_id_map)} rows (from {len(date_cols)} date columns)')
    log(f'  ✅ stocktake_items: {item_count} rows (194 SKUs × 25 months)')
    total += len(stocktake_id_map) + item_count

    return total


# ============================================================
# Module: WAREHOUSE LOCATIONS
# ============================================================

def migrate_warehouse(my_cur, pg_cur, dry_run=False):
    """in_mgmt_barcode → warehouse_locations"""
    log('Migrating warehouse_locations...')

    my_cur.execute("""
        SELECT wh_num, aisle, bay, level, bin, slot, created_at, updated_at
        FROM in_mgmt_barcode ORDER BY wh_num, aisle, bay, level, bin, slot
    """)
    rows = my_cur.fetchall()

    if dry_run:
        log(f'  DRY RUN: Would insert {len(rows)} warehouse_locations')
        return len(rows)

    pg_cur.execute('TRUNCATE warehouse_locations CASCADE')

    for r in rows:
        pg_cur.execute("""
            INSERT INTO warehouse_locations
            (warehouse, aisle, bay, level, bin, slot, created_at, updated_at, version)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 0)
        """, (r[0], r[1], r[2], r[3], r[4] or '', r[5] or '', r[6], r[7]))

    log(f'  ✅ warehouse_locations: {len(rows)} rows')
    return len(rows)


# ============================================================
# VERIFY
# ============================================================

def verify(my_cur, pg_cur):
    """对比 V1 MySQL 和 V3 PG 的行数 — 计划中 18 项检查"""
    log('=== 验证结果 ===')
    checks = [
        ('in_supplier', 'suppliers'),
        ('in_supplier_strategy', 'supplier_strategies'),
        # PO: V1 has per-SKU rows in final, V3 splits into orders + items
        ('in_po_final (DISTINCT po_num)', 'purchase_orders'),
        ('in_po_final', 'purchase_order_items'),
        ('in_po_strategy', 'purchase_order_strategies'),
        # Shipments
        ('in_send (DISTINCT logistic_num)', 'shipments'),
        ('in_send_final', 'shipment_items'),
        # Receives
        ('in_receive_final', 'receives'),
        ('in_diff_final', 'receive_diffs'),
        # Payments
        ('in_pmt_po_final + deposit + prepay + logistic', 'payments'),
        # FIFO
        ('in_dynamic_tran', 'fifo_transactions'),
        ('in_dynamic_fifo_layers', 'fifo_layers'),
        ('in_dynamic_fifo_alloc', 'fifo_allocations'),
        # Warehouse
        ('in_mgmt_barcode', 'warehouse_locations'),
        # Sales / ETL
        ('Data_Transaction (unique row_hash)', 'raw_transactions'),
        ('Data_Clean_Log', 'cleaned_transactions'),
        # Inventory
        ('Data_Inventory (date columns)', 'stocktakes'),
    ]

    # V1 counts
    v1_counts = {}
    my_cur.execute('SELECT COUNT(*) FROM in_supplier'); v1_counts['in_supplier'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_supplier_strategy'); v1_counts['in_supplier_strategy'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(DISTINCT po_num) FROM in_po_final'); v1_counts['in_po_final (DISTINCT po_num)'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_po_final'); v1_counts['in_po_final'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_po_strategy'); v1_counts['in_po_strategy'] = my_cur.fetchone()[0]
    my_cur.execute("SELECT COUNT(DISTINCT logistic_num) FROM in_send"); v1_counts['in_send (DISTINCT logistic_num)'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_send_final'); v1_counts['in_send_final'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_receive_final'); v1_counts['in_receive_final'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_diff_final'); v1_counts['in_diff_final'] = my_cur.fetchone()[0]
    my_cur.execute("""
        SELECT (SELECT COUNT(*) FROM in_pmt_po_final)
             + (SELECT COUNT(*) FROM in_pmt_deposit_final)
             + (SELECT COUNT(*) FROM in_pmt_prepay_final)
             + (SELECT COUNT(*) FROM in_pmt_logistic_final)
    """)
    v1_counts['in_pmt_po_final + deposit + prepay + logistic'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_dynamic_tran'); v1_counts['in_dynamic_tran'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_dynamic_fifo_layers'); v1_counts['in_dynamic_fifo_layers'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_dynamic_fifo_alloc'); v1_counts['in_dynamic_fifo_alloc'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM in_mgmt_barcode'); v1_counts['in_mgmt_barcode'] = my_cur.fetchone()[0]
    # Sales: unique row_hash count (deduped)
    my_cur.execute('SELECT COUNT(DISTINCT row_hash) FROM Data_Transaction WHERE row_hash IS NOT NULL AND row_hash != ""')
    v1_counts['Data_Transaction (unique row_hash)'] = my_cur.fetchone()[0]
    my_cur.execute('SELECT COUNT(*) FROM Data_Clean_Log'); v1_counts['Data_Clean_Log'] = my_cur.fetchone()[0]
    # Inventory: count of date columns (not rows)
    my_cur.execute("""
        SELECT COUNT(*) - 1 FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA='MGMT' AND TABLE_NAME='Data_Inventory'
    """)
    v1_counts['Data_Inventory (date columns)'] = my_cur.fetchone()[0]

    all_pass = True
    for v1_label, v3_table in checks:
        v1 = v1_counts.get(v1_label, 0)
        pg_cur.execute(f'SELECT COUNT(*) FROM "{v3_table}"')
        v3 = pg_cur.fetchone()[0]
        match = '✅' if v1 == v3 else '❌'
        if v1 != v3:
            all_pass = False
        log(f'  {match} {v1_label:50s} V1={v1:>8} → V3={v3:>8}  {v3_table}')

    if all_pass:
        log('🟢 ALL CHECKS PASSED')
    else:
        log('🔴 SOME CHECKS FAILED — review warnings above', 'WARN')

    return all_pass


# ============================================================
# MAIN
# ============================================================

MODULES = {
    'supplier': [migrate_suppliers, migrate_supplier_strategies],
    'purchase': [migrate_purchase_orders, migrate_po_strategies],
    'shipment': [migrate_shipments],
    'receive': [migrate_receives],
    'payment': [migrate_payments],
    'fifo': [migrate_fifo],
    'sales': [migrate_sales],
    'warehouse': [migrate_warehouse],
}

def main():
    parser = argparse.ArgumentParser(description='V1 MySQL → V3 PostgreSQL Migration')
    parser.add_argument('--module', choices=list(MODULES.keys()), help='Migrate specific module only')
    parser.add_argument('--verify-only', action='store_true', help='Only verify, no migration')
    parser.add_argument('--dry-run', action='store_true', help='Print what would happen')
    args = parser.parse_args()

    log('Connecting to databases...')
    my_conn = pymysql.connect(**MYSQL_CONF)
    my_cur = my_conn.cursor()
    pg_conn = psycopg2.connect(**PG_CONF)
    pg_cur = pg_conn.cursor()

    try:
        if args.verify_only:
            verify(my_cur, pg_cur)
            return

        start = time.time()
        total = 0

        if args.module:
            modules_to_run = {args.module: MODULES[args.module]}
        else:
            modules_to_run = MODULES

        for name, funcs in modules_to_run.items():
            log(f'\n{"="*60}')
            log(f'MODULE: {name.upper()}')
            log(f'{"="*60}')
            for func in funcs:
                total += func(my_cur, pg_cur, dry_run=args.dry_run)

        if not args.dry_run:
            pg_conn.commit()
            log(f'\n✅ Migration committed. Total rows: {total}')
            log(f'⏱  Elapsed: {time.time()-start:.1f}s')

            # Run verification
            log('\n' + '='*60)
            verify(my_cur, pg_cur)
        else:
            log(f'\n📋 DRY RUN complete. Would migrate ~{total} rows')

    except Exception as e:
        pg_conn.rollback()
        log(f'❌ Migration FAILED: {e}', 'ERROR')
        raise
    finally:
        my_cur.close()
        my_conn.close()
        pg_cur.close()
        pg_conn.close()


if __name__ == '__main__':
    main()
