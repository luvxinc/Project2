#!/usr/bin/env python3
"""
V3 Report Generator — Sandbox Comparison (V2)
=============================================
Uses V1's EXACT cost-weight logic (profit_sku.py L30-118)
to compare with V3 Kotlin output.
"""

import os, sys, csv
import pandas as pd
import numpy as np
from collections import defaultdict
from pathlib import Path

DB_HOST = "localhost"; DB_PORT = 5432; DB_NAME = "mgmt_v2"
DB_USER = "aaron"; DB_PASS = "***REDACTED_PASSWORD***"
START_DATE = "2026-01-01"; END_DATE = "2026-01-31"

LOSS_RATES = {"CASE": 0.6, "REQUEST": 0.5, "RETURN": 0.3, "DISPUTE": 1.0}
SPECIAL_SOURCE_SKUS = {"NU1C8E51C", "NU1C8E51K"}
SPECIAL_TARGET_SKU = "NU1C8SKT7"

def get_conn():
    import psycopg2
    return psycopg2.connect(host=DB_HOST, port=DB_PORT, database=DB_NAME, user=DB_USER, password=DB_PASS)

def load_data():
    conn = get_conn()
    tx_sql = """
        SELECT order_date, seller, order_number, item_id, item_title, full_sku,
            quantity, action, buyer_username, sale_amount, refund_amount,
            shipping_fee, seller_tax, ebay_tax, fvf_fee_fixed, fvf_fee_variable,
            intl_fee, ad_fee, regulatory_fee, dispute_fee, label_cost, label_return,
            sku1, quantity1, sku2, quantity2, sku3, quantity3,
            sku4, quantity4, sku5, quantity5, sku6, quantity6,
            sku7, quantity7, sku8, quantity8, sku9, quantity9, sku10, quantity10
        FROM cleaned_transactions
        WHERE order_date >= %s::timestamp AND order_date <= %s::timestamp
        ORDER BY order_date
    """
    df = pd.read_sql(tx_sql, conn, params=[START_DATE, END_DATE])

    # V1 parity: FIFO first, COGS fallback (base.py L140-155)
    fifo_sql = """
        SELECT sku,
               CASE WHEN SUM(qty_remaining) > 0
                    THEN SUM(qty_remaining * COALESCE(landed_cost, unit_cost)) / SUM(qty_remaining)
                    ELSE 0 END as avg_cost
        FROM fifo_layers
        WHERE qty_remaining > 0
        GROUP BY sku
    """
    fifo_df = pd.read_sql(fifo_sql, conn)
    fifo_map = {}
    if not fifo_df.empty:
        fifo_map = dict(zip(fifo_df['sku'].str.strip().str.upper(), fifo_df['avg_cost'].astype(float)))

    cogs_df = pd.read_sql("SELECT sku, COALESCE(cogs, 0) as cogs FROM products WHERE sku IS NOT NULL", conn)
    cogs_map_raw = {}
    if not cogs_df.empty:
        cogs_map_raw = dict(zip(cogs_df['sku'].str.strip().str.upper(), cogs_df['cogs'].astype(float)))

    conn.close()

    # Merge: FIFO > 0 → use FIFO; else COGS
    all_skus = set(fifo_map.keys()) | set(cogs_map_raw.keys())
    cogs_map = {}
    fifo_count = cogs_count = 0
    for sku in all_skus:
        if sku in fifo_map and fifo_map[sku] > 0:
            cogs_map[sku] = fifo_map[sku]
            fifo_count += 1
        elif sku in cogs_map_raw:
            cogs_map[sku] = cogs_map_raw[sku]
            cogs_count += 1

    print(f"Loaded {len(df)} transactions, Cost sources: FIFO={fifo_count}, COGS={cogs_count}, Total={len(cogs_map)}")
    return df, cogs_map

def extract_slots(row):
    slots = []
    for i in range(1, 11):
        s = row.get(f'sku{i}')
        q = row.get(f'quantity{i}')
        if s is None or pd.isna(s): break
        s = str(s).strip().upper()
        if not s or s in ('NAN', 'NONE', '0', ''): break
        q = int(float(q)) if q and not pd.isna(q) else 0
        slots.append((s, q))
    return slots

FEE_COLS = [
    ('shipping_fee', 'shipping'), ('seller_tax', 'seller_tax'), ('ebay_tax', 'ebay_tax'),
    ('fvf_fee_fixed', 'fvf_fixed'), ('fvf_fee_variable', 'fvf_variable'),
    ('intl_fee', 'intl_fee'), ('ad_fee', 'ad_fee'), ('regulatory_fee', 'regulatory'),
    ('dispute_fee', 'dispute_fee'), ('label_cost', 'label_cost'), ('label_return', 'label_return'),
]

def run_sku_profit(df, cogs_map):
    """V1-exact: profit_sku.py L30-118 (cost-weight split)"""
    print("\n=== SKU Profit (V1 exact cost-weight) ===")
    metrics = defaultdict(lambda: defaultdict(float))

    for _, row in df.iterrows():
        qty_sets = int(float(row.get('quantity', 0)))
        action = str(row.get('action', '')).strip().upper()
        revenue = float(row.get('sale_amount', 0) or 0)
        refund = float(row.get('refund_amount', 0) or 0)

        slots = extract_slots(row)
        if not slots: continue

        # 1. Cost-weight calculation (V1 L42-78)
        sku_units = {}; sku_values = {}; total_cost = 0.0
        for sku, per_qty in slots:
            if per_qty <= 0: continue
            units = per_qty * qty_sets
            unit_cost = cogs_map.get(sku, 0.0)
            val = units * unit_cost
            sku_units[sku] = units
            sku_values[sku] = val
            total_cost += val

        if not sku_units: continue
        if total_cost == 0:
            total_units = sum(sku_units.values())
            for s, u in sku_units.items():
                sku_values[s] = u
            total_cost = total_units

        # 2. Weighted accumulation (V1 L81-118)
        for sku, units in sku_units.items():
            w = sku_values[sku] / total_cost if total_cost > 0 else 0.0
            m = metrics[sku]
            m['total_qty'] += units
            m['total_rev'] += revenue * w

            if action == 'CA':
                m['cancel_qty'] += units; m['cancel_rev'] += refund * w
            elif action == 'RE':
                m['return_qty'] += units; m['return_rev'] += refund * w
            elif action == 'CR':
                m['request_qty'] += units; m['request_rev'] += refund * w
            elif action == 'CC':
                m['claim_qty'] += units; m['claim_rev'] += refund * w
            elif action == 'PD':
                m['dispute_qty'] += units; m['dispute_rev'] += refund * w

            m['cog_value'] += -(cogs_map.get(sku, 0.0) * units)
            for col, fk in FEE_COLS:
                m[fk] += float(row.get(col, 0) or 0) * w

    return compute_net(metrics, "SKU")

def run_listing_profit(df, cogs_map):
    """V1-exact: profit_listing.py (weight=1, group by item_id)"""
    print("\n=== Listing Profit (V1 exact, weight=1) ===")
    metrics = defaultdict(lambda: defaultdict(float))

    for _, row in df.iterrows():
        qty_sets = int(float(row.get('quantity', 0)))
        action = str(row.get('action', '')).strip().upper()
        revenue = float(row.get('sale_amount', 0) or 0)
        refund = float(row.get('refund_amount', 0) or 0)
        key = str(row.get('item_id', '')).strip().upper()
        if not key or key == 'NAN': continue

        m = metrics[key]
        m['total_qty'] += qty_sets
        m['total_rev'] += revenue

        if action == 'CA':
            m['cancel_qty'] += qty_sets; m['cancel_rev'] += refund
        elif action == 'RE':
            m['return_qty'] += qty_sets; m['return_rev'] += refund
        elif action == 'CR':
            m['request_qty'] += qty_sets; m['request_rev'] += refund
        elif action == 'CC':
            m['claim_qty'] += qty_sets; m['claim_rev'] += refund
        elif action == 'PD':
            m['dispute_qty'] += qty_sets; m['dispute_rev'] += refund

        # COGS (V1: _calculate_row_cost + special SKU)
        slots = extract_slots(row)
        row_cost = 0.0
        for sku, per_qty in slots:
            unit_cost = cogs_map.get(sku, 0.0)
            row_cost += unit_cost * per_qty * qty_sets
            if sku in SPECIAL_SOURCE_SKUS:
                row_cost += cogs_map.get(SPECIAL_TARGET_SKU, 0.0) * 2 * qty_sets
        m['cog_value'] += -row_cost

        for col, fk in FEE_COLS:
            m[fk] += float(row.get(col, 0) or 0)

    return compute_net(metrics, "Listing")

def run_combo_profit(df, cogs_map):
    """V1-exact: profit_combo.py (weight=1, group by full_sku)"""
    print("\n=== Combo Profit (V1 exact, weight=1) ===")
    metrics = defaultdict(lambda: defaultdict(float))

    for _, row in df.iterrows():
        qty_sets = int(float(row.get('quantity', 0)))
        action = str(row.get('action', '')).strip().upper()
        revenue = float(row.get('sale_amount', 0) or 0)
        refund = float(row.get('refund_amount', 0) or 0)
        key = str(row.get('full_sku', '')).strip()
        if not key or key == 'nan' or key == 'None': continue

        m = metrics[key]
        m['total_qty'] += qty_sets
        m['total_rev'] += revenue

        if action == 'CA':
            m['cancel_qty'] += qty_sets; m['cancel_rev'] += refund
        elif action == 'RE':
            m['return_qty'] += qty_sets; m['return_rev'] += refund
        elif action == 'CR':
            m['request_qty'] += qty_sets; m['request_rev'] += refund
        elif action == 'CC':
            m['claim_qty'] += qty_sets; m['claim_rev'] += refund
        elif action == 'PD':
            m['dispute_qty'] += qty_sets; m['dispute_rev'] += refund

        slots = extract_slots(row)
        row_cost = 0.0
        for sku, per_qty in slots:
            unit_cost = cogs_map.get(sku, 0.0)
            row_cost += unit_cost * per_qty * qty_sets
            if sku in SPECIAL_SOURCE_SKUS:
                row_cost += cogs_map.get(SPECIAL_TARGET_SKU, 0.0) * 2 * qty_sets
        m['cog_value'] += -row_cost

        for col, fk in FEE_COLS:
            m[fk] += float(row.get(col, 0) or 0)

    return compute_net(metrics, "Combo")

def compute_net(metrics, label):
    R = LOSS_RATES
    results = {}
    for key, m in metrics.items():
        net_qty = (m['total_qty'] - m['cancel_qty']
                   - m['return_qty'] * R['RETURN']
                   - m['request_qty'] * R['REQUEST']
                   - m['claim_qty'] * R['CASE']
                   - m['dispute_qty'] * R['DISPUTE'])
        net_rev = (m['total_rev'] + m['cancel_rev'] + m['return_rev']
                   + m['request_rev'] + m['claim_rev'] + m['dispute_rev'])
        net_platform = m.get('fvf_fixed', 0) + m.get('fvf_variable', 0) + m.get('regulatory', 0) + m.get('intl_fee', 0)
        profit = (net_rev + m['cog_value'] + m.get('shipping', 0)
                  + net_platform + m.get('dispute_fee', 0)
                  + m.get('ad_fee', 0) + m.get('label_cost', 0) + m.get('label_return', 0))
        results[key] = {
            'net_qty': round(net_qty, 2),
            'net_rev': round(net_rev, 2),
            'profit': round(profit, 2),
            'total_qty': m['total_qty'],
            'total_rev': round(m['total_rev'], 2),
            'cog_value': round(m['cog_value'], 2),
        }

    total_rev = sum(r['total_rev'] for r in results.values())
    total_profit = sum(r['profit'] for r in results.values())
    print(f"  {len(results)} keys, Rev=${total_rev:,.2f}, Profit=${total_profit:,.2f}")
    return results


def parse_v3_csv(filepath, key_col_idx=0, rev_col_name='总销售额', profit_col_name='盈亏'):
    """Parse V3 multi-table CSV, extract B1 table values."""
    with open(filepath, 'r', encoding='utf-8-sig') as f:
        lines = f.readlines()

    # Find B1 section
    b1_start = None
    for i, line in enumerate(lines):
        if '=== B1' in line or 'B1_' in line:
            b1_start = i + 1
            break
    if b1_start is None:
        return {}

    # Read headers
    headers = lines[b1_start].strip().split(',')
    rev_col = profit_col = None
    for ci, h in enumerate(headers):
        if rev_col_name in h: rev_col = ci
        if profit_col_name in h: profit_col = ci

    data = {}
    for line in lines[b1_start + 1:]:
        line = line.strip()
        if not line or line.startswith('==='): break
        parts = line.split(',')
        if len(parts) < 2: break
        key = parts[key_col_idx].strip()
        if not key: break
        try:
            data[key] = {
                'total_rev': float(parts[rev_col]) if rev_col and rev_col < len(parts) else 0,
                'profit': float(parts[profit_col]) if profit_col and profit_col < len(parts) else 0,
            }
        except:
            pass
    return data


def compare(label, sandbox, v3_data, max_show=15):
    """Compare sandbox vs V3 output."""
    print(f"\n{'='*60}")
    print(f"  {label}: V1-Python vs V3-Kotlin")
    print(f"{'='*60}")

    if not v3_data:
        print("  ⚠️ V3 data not loaded")
        return

    all_keys = sorted(set(list(sandbox.keys()) + list(v3_data.keys())))
    match = mismatch = missing_v3 = missing_sb = 0
    diffs = []

    for key in all_keys:
        sb = sandbox.get(key)
        v3 = v3_data.get(key)
        if not sb:
            missing_sb += 1; continue
        if not v3:
            missing_v3 += 1; continue

        rev_diff = abs(sb['total_rev'] - v3['total_rev'])
        profit_diff = abs(sb['profit'] - v3['profit'])

        if rev_diff < 0.02 and profit_diff < 0.02:
            match += 1
        else:
            mismatch += 1
            if len(diffs) < max_show:
                diffs.append(f"  ❌ {key}: Rev SB={sb['total_rev']:.2f} V3={v3['total_rev']:.2f} (Δ{rev_diff:.2f})"
                             f" | Profit SB={sb['profit']:.2f} V3={v3['profit']:.2f} (Δ{profit_diff:.2f})")

    print(f"  ✅ Match: {match}")
    print(f"  ❌ Mismatch: {mismatch}")
    print(f"  ⚠️ Missing in V3: {missing_v3}")
    print(f"  ⚠️ Missing in Sandbox: {missing_sb}")
    print(f"  Total keys: {len(all_keys)}")
    if diffs:
        print(f"\n  Top {len(diffs)} mismatches:")
        for d in diffs:
            print(d)


def main():
    print("="*60)
    print("V3 Sandbox Comparison V2 — V1 Exact Logic")
    print(f"Range: {START_DATE} → {END_DATE}")
    print("="*60)

    df, cogs_map = load_data()
    if df.empty:
        print("❌ No data"); return

    sku_p = run_sku_profit(df, cogs_map)
    lst_p = run_listing_profit(df, cogs_map)
    cmb_p = run_combo_profit(df, cogs_map)

    # Find V3 output
    v3_base = Path("./mgmt-v3/output")
    v3_dir = None
    if v3_base.exists():
        for sub in v3_base.iterdir():
            if sub.is_dir() and list(sub.glob("Profit_Analysis_SKU*.csv")):
                v3_dir = sub
                break

    if not v3_dir:
        print("\n⚠️ No V3 output found. Run V3 generator first.")
        return

    print(f"\n📁 V3 output: {v3_dir}")

    # Parse & Compare
    for csv_file in sorted(v3_dir.glob("*.csv")):
        name = csv_file.name.lower()
        if 'sku' in name and 'profit' in name and 'sold' not in name:
            v3_data = parse_v3_csv(str(csv_file))
            compare("SKU Profit", sku_p, v3_data)
        elif 'listing' in name and 'profit' in name:
            v3_data = parse_v3_csv(str(csv_file))
            compare("Listing Profit", lst_p, v3_data)
        elif 'combo' in name and 'profit' in name:
            v3_data = parse_v3_csv(str(csv_file))
            compare("Combo Profit", cmb_p, v3_data)

    print("\n✅ Done.")

if __name__ == '__main__':
    main()
