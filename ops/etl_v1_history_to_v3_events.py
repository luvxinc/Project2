#!/usr/bin/env python3
"""
ETL V1 History → V3 Events
===========================
Migrates V1 MySQL in_po / in_send_list version history into V3 PostgreSQL
purchase_order_events / shipment_events tables.

V1 architecture:
  - in_po:        PO item log. INCREMENTAL — each seq modifies ONE SKU.
                  seq: L01 (all initial items), L02+ (single item adjust each)
  - in_send_list: Shipment item log. Same incremental pattern.

V3 architecture:
  - purchase_order_events: eventType = CREATE / UPDATE_ITEMS
  - shipment_events:       eventType = CREATE / UPDATE_ITEMS / UPDATE_LOGISTICS

Key insight (user feedback):
  V1 created one version per SKU-adjust, so 10 items adjusted = 10 versions.
  V3 merges all seq entries from the SAME OPERATION (same update_date + operator + note)
  into a SINGLE UPDATE_ITEMS event.

Algorithm:
  1. Build running state from L01 (initial snapshot)
  2. Group L02+ by (update_date, operator, note_prefix) → one operation = one event
  3. Apply all seq entries in the batch to running state
  4. Compute diff between old state and new state → single UPDATE_ITEMS event

Usage:
  python3 ops/etl_v1_history_to_v3_events.py [--dry-run]
"""

import json
import sys
import argparse
from collections import defaultdict, OrderedDict
from datetime import datetime
from decimal import Decimal

# ═══════════════════════════════════════════════════
#                    MySQL (V1)
# ═══════════════════════════════════════════════════
import pymysql

MYSQL_CONFIG = {
    'host': 'localhost',
    'port': 3306,
    'user': 'root',
    'password': '***REDACTED_PASSWORD***',
    'database': 'MGMT',
    'charset': 'utf8mb4',
}

# ═══════════════════════════════════════════════════
#                  PostgreSQL (V3)
# ═══════════════════════════════════════════════════
import psycopg2
import psycopg2.extras

PG_CONFIG = {
    'host': 'localhost',
    'port': 5432,
    'user': 'aaron',
    'dbname': 'mgmt_v2',
}


def fetch_v1_po_history(mysql_conn):
    """Fetch all in_po rows ordered for processing."""
    with mysql_conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("""
            SELECT po_num, po_sku, po_quantity, po_price, action, note, `by`, seq, update_date
            FROM in_po
            ORDER BY po_num, seq, po_sku
        """)
        rows = cur.fetchall()

    # Group: po_num → seq → [rows]
    grouped = defaultdict(lambda: defaultdict(list))
    for r in rows:
        grouped[r['po_num']][r['seq']].append(r)
    return grouped


def fetch_v1_shipment_history(mysql_conn):
    """Fetch all in_send_list rows ordered for processing."""
    with mysql_conn.cursor(pymysql.cursors.DictCursor) as cur:
        cur.execute("""
            SELECT logistic_num, po_num, sku, quantity, price, action, note, `by`, seq,
                   DATE(created_at) as update_date
            FROM in_send_list
            ORDER BY logistic_num, seq, po_num, sku
        """)
        rows = cur.fetchall()

    grouped = defaultdict(lambda: defaultdict(list))
    for r in rows:
        grouped[r['logistic_num']][r['seq']].append(r)
    return grouped


def compute_diff(old_state, new_state, key_fields):
    """
    Compute item diff between two states (dict of key → item).
    Returns: {added: [], removed: [], adjusted: []}
    """
    added = []
    removed = []
    adjusted = []

    for k, item in new_state.items():
        if k not in old_state:
            added.append(item)

    for k in old_state:
        if k not in new_state:
            removed.append(old_state[k])

    for k in old_state:
        if k in new_state:
            o = old_state[k]
            n = new_state[k]
            changes = []
            if o['qty'] != n['qty']:
                changes.append({'field': 'quantity', 'before': o['qty'], 'after': n['qty']})
            if abs(o['unitPrice'] - n['unitPrice']) > 0.00001:
                changes.append({'field': 'unitPrice', 'before': o['unitPrice'], 'after': n['unitPrice']})
            if changes:
                for ch in changes:
                    adjusted.append({
                        **{f: n[f] for f in key_fields},
                        'field': ch['field'],
                        'before': ch['before'],
                        'after': ch['after'],
                    })

    return {'added': added, 'removed': removed, 'adjusted': adjusted}


def get_v3_po_id_map(pg_conn):
    with pg_conn.cursor() as cur:
        cur.execute("SELECT id, po_num FROM purchase_orders WHERE deleted_at IS NULL")
        return {r[1]: r[0] for r in cur.fetchall()}


def get_v3_shipment_id_map(pg_conn):
    with pg_conn.cursor() as cur:
        cur.execute("SELECT id, logistic_num FROM shipments WHERE deleted_at IS NULL")
        return {r[1]: r[0] for r in cur.fetchall()}


def get_max_event_seq(pg_conn, table, id_col, entity_id):
    with pg_conn.cursor() as cur:
        cur.execute(f"SELECT COALESCE(MAX(event_seq), 0) FROM {table} WHERE {id_col} = %s", (entity_id,))
        return cur.fetchone()[0]


def has_update_items_events(pg_conn, table, id_col, entity_id):
    with pg_conn.cursor() as cur:
        cur.execute(
            f"SELECT COUNT(*) FROM {table} WHERE {id_col} = %s AND event_type = 'UPDATE_ITEMS'",
            (entity_id,)
        )
        return cur.fetchone()[0] > 0


def migrate_po_history(mysql_conn, pg_conn, dry_run=False):
    """ETL: V1 in_po → V3 purchase_order_events (UPDATE_ITEMS)"""
    print("\n═══ PO History Migration ═══")
    po_history = fetch_v1_po_history(mysql_conn)
    po_id_map = get_v3_po_id_map(pg_conn)

    total_events = 0
    skipped_pos = 0

    for po_num, seq_groups in sorted(po_history.items()):
        po_id = po_id_map.get(po_num)
        if po_id is None:
            print(f"  ⚠ {po_num}: not in V3, skip")
            skipped_pos += 1
            continue

        seqs = sorted(seq_groups.keys())
        if len(seqs) <= 1:
            continue  # Only L01, no updates

        # Skip if already migrated
        if has_update_items_events(pg_conn, 'purchase_order_events', 'po_id', po_id):
            print(f"  ⏭ {po_num}: already has UPDATE_ITEMS events, skip")
            continue

        max_seq = get_max_event_seq(pg_conn, 'purchase_order_events', 'po_id', po_id)

        # Build initial running state from L01
        running_state = {}
        for r in seq_groups[seqs[0]]:
            key = r['po_sku']
            running_state[key] = {
                'poNum': r['po_num'],
                'sku': key,
                'qty': int(r['po_quantity']),
                'unitPrice': float(r['po_price'] or 0),
            }

        # Group L02+ seqs by (update_date, by, note_prefix) to merge same-operation versions
        # Key insight: same operation = same date + operator + similar note
        update_seqs = seqs[1:]  # L02, L03, ...
        operations = OrderedDict()  # op_key → [seq_records...]
        for seq in update_seqs:
            records = seq_groups[seq]
            sample = records[0]
            # Use (update_date, by) as the operation key
            # note often varies slightly per SKU, use the prefix
            note = sample.get('note', '')
            op_key = (str(sample.get('update_date', '')), sample.get('by', ''), note)
            if op_key not in operations:
                operations[op_key] = []
            operations[op_key].extend(records)

        # Process each operation batch
        for op_key, batch_records in operations.items():
            update_date_str, operator, note = op_key

            # Save old state snapshot
            old_state = {k: dict(v) for k, v in running_state.items()}

            # Apply all records in this batch to running state
            for r in batch_records:
                key = r['po_sku']
                running_state[key] = {
                    'poNum': r['po_num'],
                    'sku': key,
                    'qty': int(r['po_quantity']),
                    'unitPrice': float(r['po_price'] or 0),
                }

            # Compute diff
            diff = compute_diff(old_state, running_state, ['poNum', 'sku'])
            if not diff['added'] and not diff['removed'] and not diff['adjusted']:
                continue

            max_seq += 1
            changes_json = json.dumps(diff, ensure_ascii=False)

            adj_count = len(diff['adjusted'])
            add_count = len(diff['added'])
            rem_count = len(diff['removed'])
            print(f"  ✓ {po_num} → UPDATE_ITEMS event_seq={max_seq} "
                  f"(adjusted={adj_count}, added={add_count}, removed={rem_count}) "
                  f"note=\"{note}\"")

            if not dry_run:
                with pg_conn.cursor() as cur:
                    try:
                        ts = datetime.strptime(update_date_str, '%Y-%m-%d') if update_date_str else datetime.now()
                    except ValueError:
                        ts = datetime.now()
                    cur.execute("""
                        INSERT INTO purchase_order_events
                        (po_id, po_num, event_type, event_seq, changes, note, operator, created_at)
                        VALUES (%s, %s, 'UPDATE_ITEMS', %s, %s::jsonb, %s, %s, %s)
                    """, (po_id, po_num, max_seq, changes_json, note, operator, ts))
                total_events += 1

    if not dry_run:
        pg_conn.commit()
    print(f"\n  Total PO UPDATE_ITEMS events: {total_events}, skipped POs: {skipped_pos}")


def migrate_shipment_history(mysql_conn, pg_conn, dry_run=False):
    """ETL: V1 in_send_list → V3 shipment_events (UPDATE_ITEMS)"""
    print("\n═══ Shipment History Migration ═══")
    ship_history = fetch_v1_shipment_history(mysql_conn)
    ship_id_map = get_v3_shipment_id_map(pg_conn)

    total_events = 0
    skipped = 0

    for logistic_num, seq_groups in sorted(ship_history.items()):
        ship_id = ship_id_map.get(logistic_num)
        if ship_id is None:
            print(f"  ⚠ {logistic_num}: not in V3, skip")
            skipped += 1
            continue

        seqs = sorted(seq_groups.keys())
        if len(seqs) <= 1:
            continue

        if has_update_items_events(pg_conn, 'shipment_events', 'shipment_id', ship_id):
            print(f"  ⏭ {logistic_num}: already has UPDATE_ITEMS events, skip")
            continue

        max_seq = get_max_event_seq(pg_conn, 'shipment_events', 'shipment_id', ship_id)

        # Build initial running state from L01
        running_state = {}
        for r in seq_groups[seqs[0]]:
            key = (r['po_num'], r['sku'])
            running_state[key] = {
                'poNum': r['po_num'],
                'sku': r['sku'],
                'qty': int(r['quantity']),
                'unitPrice': float(r['price'] or 0),
            }

        # Group update seqs by operation
        update_seqs = seqs[1:]
        operations = OrderedDict()
        for seq in update_seqs:
            records = seq_groups[seq]
            sample = records[0]
            note = sample.get('note', '')
            op_key = (str(sample.get('update_date', '')), sample.get('by', ''), note)
            if op_key not in operations:
                operations[op_key] = []
            operations[op_key].extend(records)

        for op_key, batch_records in operations.items():
            update_date_str, operator, note = op_key

            old_state = {k: dict(v) for k, v in running_state.items()}

            for r in batch_records:
                key = (r['po_num'], r['sku'])
                running_state[key] = {
                    'poNum': r['po_num'],
                    'sku': r['sku'],
                    'qty': int(r['quantity']),
                    'unitPrice': float(r['price'] or 0),
                }

            diff = compute_diff(old_state, running_state, ['poNum', 'sku'])
            if not diff['added'] and not diff['removed'] and not diff['adjusted']:
                continue

            max_seq += 1
            changes_json = json.dumps(diff, ensure_ascii=False)

            adj_count = len(diff['adjusted'])
            add_count = len(diff['added'])
            rem_count = len(diff['removed'])
            print(f"  ✓ {logistic_num} → UPDATE_ITEMS event_seq={max_seq} "
                  f"(adjusted={adj_count}, added={add_count}, removed={rem_count}) "
                  f"note=\"{note}\"")

            if not dry_run:
                with pg_conn.cursor() as cur:
                    try:
                        ts = datetime.strptime(update_date_str, '%Y-%m-%d') if update_date_str else datetime.now()
                    except ValueError:
                        ts = datetime.now()
                    cur.execute("""
                        INSERT INTO shipment_events
                        (shipment_id, logistic_num, event_type, event_seq, changes, note, operator, created_at)
                        VALUES (%s, %s, 'UPDATE_ITEMS', %s, %s::jsonb, %s, %s, %s)
                    """, (ship_id, logistic_num, max_seq, changes_json, note, operator, ts))
                total_events += 1

    if not dry_run:
        pg_conn.commit()
    print(f"\n  Total Shipment UPDATE_ITEMS events: {total_events}, skipped: {skipped}")


def main():
    parser = argparse.ArgumentParser(description='ETL V1 History → V3 Events')
    parser.add_argument('--dry-run', action='store_true', help='Print without writing')
    args = parser.parse_args()

    print(f"{'🔍 DRY RUN' if args.dry_run else '🚀 LIVE RUN'}")

    mysql_conn = pymysql.connect(**MYSQL_CONFIG)
    pg_conn = psycopg2.connect(**PG_CONFIG)

    try:
        migrate_po_history(mysql_conn, pg_conn, args.dry_run)
        migrate_shipment_history(mysql_conn, pg_conn, args.dry_run)
    finally:
        mysql_conn.close()
        pg_conn.close()

    print("\n✅ Done!")


if __name__ == '__main__':
    main()
