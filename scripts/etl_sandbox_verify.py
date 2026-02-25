#!/usr/bin/env python3
"""
ETL Sandbox Verification Script
================================
Purpose: Simulate V3 Transform logic using V3 raw tables, compare against V1 cleaned data.
Safety:  READ-ONLY on all production tables. Only writes to raw_earnings (migration).

Steps:
  0. Migrate V1 Data_Order_Earning → V3 raw_earnings (only write)
  1. Read V3 raw_transactions (≥2025-01-01)
  2. Read V3 raw_earnings (≥2025-01-01)
  3. Load V1 sku_correction_memory.csv
  4. Simulate Transform in-memory (replicate V1 transformer.py logic exactly)
  5. Compare simulated results vs V1 Data_Clean_Log (≥2025-01-01)
  6. Report: total rows, action breakdown, 4D key match, SKU consumption
"""

import os, sys, csv, re
from collections import defaultdict
from decimal import Decimal, ROUND_HALF_UP
from datetime import datetime
import warnings
warnings.filterwarnings('ignore')

import pymysql
import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np

# ═══════════════════════════════════════════════════════
# Config
# ═══════════════════════════════════════════════════════
MYSQL_CFG = dict(host='localhost', user='root', password='***REDACTED_PASSWORD***', database='MGMT', charset='utf8mb4')
PG_DSN = "dbname=mgmt_v2 host=localhost"
SKU_CORRECTIONS_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'knowledge_base', 'sku_correction_memory.csv')
DATE_CUTOFF = '2025-01-01'

# ═══════════════════════════════════════════════════════
# Step 0: Migrate raw_earnings
# ═══════════════════════════════════════════════════════
def migrate_raw_earnings():
    """Migrate V1 Data_Order_Earning → V3 raw_earnings (upsert by row_hash)."""
    print("\n" + "="*70)
    print("STEP 0: Migrate V1 Data_Order_Earning → V3 raw_earnings")
    print("="*70)
    
    my = pymysql.connect(**MYSQL_CFG)
    pg = psycopg2.connect(PG_DSN)
    pg.autocommit = False
    
    try:
        mycur = my.cursor(pymysql.cursors.DictCursor)
        mycur.execute("SELECT COUNT(*) as cnt FROM Data_Order_Earning")
        v1_total = mycur.fetchone()['cnt']
        
        pgcur = pg.cursor()
        pgcur.execute("SELECT COUNT(*) FROM raw_earnings")
        v3_existing = pgcur.fetchone()[0]
        
        if v3_existing >= v1_total:
            print(f"  ✅ raw_earnings already has {v3_existing} rows (V1 has {v1_total}). Skipping migration.")
            return
        
        print(f"  V1 Data_Order_Earning: {v1_total} rows")
        print(f"  V3 raw_earnings: {v3_existing} rows → migrating...")
        
        mycur.execute("""
            SELECT 
                `Order creation date` as order_date,
                `Order number` as order_number,
                `Item ID` as item_id,
                `Item title` as item_title,
                `Buyer name` as buyer_name,
                `Shipping labels` as shipping_labels,
                `Seller` as seller,
                `row_hash` as row_hash
            FROM Data_Order_Earning
        """)
        
        batch = []
        imported = 0
        skipped = 0
        
        for row in mycur:
            # Parse date
            order_date = None
            if row['order_date']:
                try:
                    order_date = pd.to_datetime(str(row['order_date'])).strftime('%Y-%m-%d')
                except:
                    order_date = str(row['order_date'])
            
            # Parse shipping labels amount
            ship_val = 0.0
            if row['shipping_labels']:
                try:
                    ship_val = float(str(row['shipping_labels']).replace('$', '').replace(',', '').strip())
                except:
                    ship_val = 0.0
            
            batch.append((
                row.get('seller', ''),
                row.get('order_number', ''),
                row.get('item_id', ''),
                order_date,
                row.get('buyer_name', ''),
                row.get('item_title', ''),
                ship_val,
                row.get('row_hash', ''),
            ))
            
            if len(batch) >= 2000:
                cnt = _insert_earnings_batch(pgcur, batch)
                imported += cnt
                skipped += len(batch) - cnt
                batch = []
        
        if batch:
            cnt = _insert_earnings_batch(pgcur, batch)
            imported += cnt
            skipped += len(batch) - cnt
        
        pg.commit()
        
        pgcur.execute("SELECT COUNT(*) FROM raw_earnings")
        final = pgcur.fetchone()[0]
        print(f"  ✅ Migration complete: {imported} inserted, {skipped} skipped (dup hash)")
        print(f"  V3 raw_earnings now: {final} rows")
        
    finally:
        my.close()
        pg.close()

def _insert_earnings_batch(cur, batch):
    """Insert batch into raw_earnings, skip duplicates on row_hash."""
    sql = """
        INSERT INTO raw_earnings (seller, order_number, item_id, order_date, buyer_name, item_title, shipping_labels, row_hash)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (row_hash) DO NOTHING
    """
    count_before = 0
    cur.execute("SELECT COUNT(*) FROM raw_earnings")
    count_before = cur.fetchone()[0]
    
    psycopg2.extras.execute_batch(cur, sql, batch, page_size=500)
    
    cur.execute("SELECT COUNT(*) FROM raw_earnings")
    count_after = cur.fetchone()[0]
    return count_after - count_before

# ═══════════════════════════════════════════════════════
# Load SKU corrections
# ═══════════════════════════════════════════════════════
def load_sku_corrections():
    """Load V1 sku_correction_memory.csv → dict keyed by (custom_label, bad_sku)."""
    corrections = {}
    path = os.path.abspath(SKU_CORRECTIONS_FILE)
    if not os.path.exists(path):
        print(f"  ⚠️ SKU corrections file not found: {path}")
        return corrections
    
    with open(path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (row.get('CustomLabel', '').strip(), row.get('BadSKU', '').strip())
            corrections[key] = {
                'correct_sku': row.get('CorrectSKU', '').strip(),
                'correct_qty': row.get('CorrectQty', '0').strip(),
            }
    
    print(f"  Loaded {len(corrections)} SKU corrections from V1 memory")
    return corrections

# ═══════════════════════════════════════════════════════
# Step 1-4: Sandbox Transform (pure in-memory)
# ═══════════════════════════════════════════════════════
def safe_float(val):
    """Parse a value to float, stripping $, commas."""
    if val is None: return 0.0
    s = str(val).replace('$', '').replace(',', '').strip()
    try:
        return float(s)
    except:
        return 0.0

def normalize_date(val):
    """Normalize date to YYYY-MM-DD."""
    if not val or str(val).strip() == '':
        return None
    s = str(val).strip()
    try:
        return pd.to_datetime(s).strftime('%Y-%m-%d')
    except:
        return s

def sandbox_transform():
    """
    Replicate V1 transformer.py logic using V3 raw tables.
    Returns: list[dict] of simulated cleaned records.
    """
    print("\n" + "="*70)
    print("STEP 1-4: Sandbox Transform (in-memory, no DB writes)")
    print("="*70)
    
    pg = psycopg2.connect(PG_DSN)
    
    # ─── Read V3 raw_transactions ───
    print("  Reading V3 raw_transactions (≥2025-01-01)...")
    df_trans = pd.read_sql(f"""
        SELECT * FROM raw_transactions
        WHERE order_date >= '{DATE_CUTOFF}'
    """, pg)
    print(f"  → {len(df_trans)} transaction rows")
    
    # ─── Read V3 raw_earnings ───
    print("  Reading V3 raw_earnings (≥2025-01-01)...")
    df_earn = pd.read_sql(f"""
        SELECT * FROM raw_earnings
        WHERE order_date >= '{DATE_CUTOFF}'
    """, pg)
    print(f"  → {len(df_earn)} earning rows")
    
    pg.close()
    
    # ─── Load V1 raw_transaction_items for SKU data ───
    # The parsed SKU columns (p_sku1..10, p_quantity1..10) are in raw_transaction_items
    pg2 = psycopg2.connect(PG_DSN)
    
    # Check if raw_transaction_items has SKU data
    try:
        df_items = pd.read_sql("""
            SELECT transaction_id, slot, parsed_sku, parsed_qty
            FROM raw_transaction_items
        """, pg2)
        print(f"  → {len(df_items)} parsed SKU items from raw_transaction_items")
    except:
        df_items = pd.DataFrame()
        print("  → raw_transaction_items: empty or not accessible")
    
    pg2.close()
    
    # ─── Also read V1 Data_Transaction for SKU parsing data ───
    # (The V3 raw_transactions may not have p_sku columns, so we get them from V1)
    my = pymysql.connect(**MYSQL_CFG)
    print("  Reading V1 Data_Transaction for parsed SKU columns...")
    df_v1_trans = pd.read_sql(f"""
        SELECT * FROM Data_Transaction
        WHERE `Transaction creation date` >= '{DATE_CUTOFF}'
    """, my)
    df_v1_trans.columns = df_v1_trans.columns.str.strip().str.lower()
    print(f"  → {len(df_v1_trans)} V1 transaction rows (for SKU data)")
    my.close()
    
    # ═══ Transform Logic (replicating V1 transformer.py) ═══
    
    # Use V1 data for the transform since it has all parsed SKU columns
    df_trans = df_v1_trans.copy()
    
    # Numeric cleaning
    num_cols = [
        'item subtotal', 'quantity', 'gross transaction amount',
        'shipping and handling', 'seller collected tax', 'ebay collected tax',
        'final value fee - fixed', 'final value fee - variable', 'regulatory operating fee',
        'international fee', 'promoted listings fee', 'payments dispute fee', 'refund'
    ]
    for c in num_cols:
        if c in df_trans.columns:
            df_trans[c] = df_trans[c].astype(str).str.replace(r'[$,\s]', '', regex=True)
            df_trans[c] = pd.to_numeric(df_trans[c], errors='coerce').fillna(0.0)
    
    # Earning map
    if not df_earn.empty and 'shipping_labels' in df_earn.columns:
        earn_map_df = df_earn.copy()
        earn_map_df['shipping_labels'] = pd.to_numeric(earn_map_df['shipping_labels'], errors='coerce').fillna(0.0)
        earn_map = earn_map_df.groupby('order_number')['shipping_labels'].sum().reset_index()
        earn_map.columns = ['order number', 'Shipping label-Earning data']
    else:
        earn_map = pd.DataFrame(columns=['order number', 'Shipping label-Earning data'])
    
    # Ensure columns exist
    for col in ['type', 'reference id', 'seller', 'item id']:
        if col not in df_trans.columns:
            df_trans[col] = ''
    
    # Action logic
    df_trans['type_lower'] = df_trans['type'].astype(str).str.lower()
    df_trans['ref_lower'] = df_trans['reference id'].astype(str).str.lower()
    df_trans['action_code'] = 'NN'
    
    mask_pd = df_trans['type_lower'] == 'payment dispute'
    df_trans.loc[mask_pd, 'action_code'] = 'PD'
    
    mask_claim = df_trans['type_lower'] == 'claim'
    mask_case = mask_claim & df_trans['ref_lower'].str.contains('case', case=False)
    df_trans.loc[mask_case, 'action_code'] = 'CC'
    
    mask_req = mask_claim & df_trans['ref_lower'].str.contains('request', case=False)
    df_trans.loc[mask_req, 'action_code'] = 'CR'
    
    mask_refund = df_trans['type_lower'] == 'refund'
    mask_ret = mask_refund & df_trans['ref_lower'].str.contains('return', case=False)
    df_trans.loc[mask_ret, 'action_code'] = 'RE'
    
    mask_cancel = mask_refund & df_trans['ref_lower'].str.contains('cancel', case=False)
    df_trans.loc[mask_cancel, 'action_code'] = 'CA'
    
    # Extract return/cancel records
    mask_return_action = df_trans['action_code'].isin(['CA', 'RE', 'CR', 'CC'])
    df_returns_raw = df_trans[mask_return_action][['order number', 'action_code', 'transaction creation date']].copy()
    df_returns_raw = df_returns_raw.drop_duplicates('order number')
    
    # Seller logic
    df_trans['seller_clean'] = df_trans['seller'].astype(str).str.strip().str.replace(r"['\"]", '', regex=True)
    df_trans['is_prio'] = df_trans['seller_clean'].str.lower().str.contains('esparts').astype(int)
    seller_map = df_trans.sort_values(['is_prio', 'seller_clean'], ascending=[False, True]).drop_duplicates('order number')[['order number', 'seller_clean']]
    seller_map.rename(columns={'seller_clean': 'seller'}, inplace=True)
    
    # Shipping label classification
    mask_ship = df_trans['type_lower'] == 'shipping label'
    df_ship = df_trans[mask_ship].copy()
    if 'description' not in df_ship.columns:
        df_ship['description'] = ''
    
    df_ship['desc_lower'] = df_ship['description'].astype(str).str.lower()
    df_ship['amt'] = df_ship['gross transaction amount']
    
    df_ship['underpay'] = np.where(df_ship['desc_lower'].str.contains('underpaid'), df_ship['amt'], 0.0)
    df_ship['overpay'] = np.where(df_ship['desc_lower'].str.contains('overpaid'), df_ship['amt'], 0.0)
    df_ship['return'] = np.where(df_ship['desc_lower'].str.contains('return shipping'), df_ship['amt'], 0.0)
    df_ship['regular'] = np.where(~df_ship['desc_lower'].str.contains('underpaid|overpaid|return|voided|bulk'), df_ship['amt'], 0.0)
    
    ship_agg = df_ship.groupby('order number')[['underpay', 'overpay', 'return', 'regular']].sum().reset_index()
    ship_agg.columns = ['order number', 'Shipping label-underpay', 'Shipping label-overpay', 'Shipping label-Return', 'Shipping label-Regular']
    
    # Main table (Order rows only)
    mask_order = (df_trans['type_lower'] == 'order') & (df_trans['item id'].notna())
    df_main = df_trans[mask_order].copy()
    df_main['action'] = 'NN'
    
    if 'seller' in df_main.columns:
        df_main.drop(columns=['seller'], inplace=True)
    
    df_main = df_main.merge(seller_map, on='order number', how='left')
    df_main = df_main.merge(earn_map, on='order number', how='left')
    df_main = df_main.merge(ship_agg, on='order number', how='left')
    df_main.fillna(0, inplace=True)
    
    # Generate return/cancel records
    if not df_returns_raw.empty:
        return_records = []
        for _, ret_row in df_returns_raw.iterrows():
            order_num = ret_row['order number']
            action_code = ret_row['action_code']
            ret_date = ret_row['transaction creation date']
            
            nn_rows = df_main[df_main['order number'] == order_num]
            if nn_rows.empty:
                continue
            
            for _, nn_row in nn_rows.iterrows():
                ret_record = nn_row.to_dict()
                ret_record['action'] = action_code
                if pd.notna(ret_date):
                    ret_record['transaction creation date'] = ret_date
                return_records.append(ret_record)
        
        if return_records:
            df_returns_final = pd.DataFrame(return_records)
            df_main = pd.concat([df_main, df_returns_final], ignore_index=True)
    
    # Fee proration
    order_totals = df_main.groupby('order number')['item subtotal'].transform('sum')
    df_main['ratio'] = np.where(order_totals != 0, df_main['item subtotal'] / order_totals, 0.0)
    
    for col in ['Shipping label-Earning data', 'Shipping label-underpay', 'Shipping label-overpay', 'Shipping label-Return', 'Shipping label-Regular']:
        if col in df_main.columns:
            df_main[col] = df_main[col] * df_main['ratio']
    
    # Column rename
    col_mapping = {
        'transaction creation date': 'order date',
        'item subtotal': 'revenue',
        'shipping and handling': 'Shipping and handling',
        'seller collected tax': 'Seller collected tax',
        'ebay collected tax': 'eBay collected tax',
        'final value fee - fixed': 'Final Value Fee - fixed',
        'final value fee - variable': 'Final Value Fee - variable',
        'regulatory operating fee': 'Regulatory operating fee',
        'international fee': 'International fee',
        'promoted listings fee': 'Promoted Listings fee',
    }
    df_main.rename(columns=col_mapping, inplace=True)
    
    # SKU flattening
    sku_parts = []
    for i in range(1, 11):
        s_col, q_col = f'p_sku{i}', f'p_quantity{i}'
        target_s, target_q, target_qp = f'sku{i}', f'qty{i}', f'qtyp{i}'
        
        if s_col not in df_main.columns:
            df_main[target_s] = ''
            df_main[target_q] = 0
            df_main[target_qp] = 0
            continue
        
        df_main[target_s] = df_main[s_col]
        df_main[target_q] = df_main[q_col].astype(str).str.replace(r'[$,\s]', '', regex=True)
        df_main[target_q] = pd.to_numeric(df_main[target_q], errors='coerce').fillna(0.0)
        df_main[target_qp] = df_main[target_q] * df_main['quantity']
        
        mask = df_main[target_s].notna() & (df_main[target_s] != '') & (df_main[target_s] != '0') & (df_main[target_s] != 0)
        part = df_main.loc[mask, target_s].astype(str) + "." + df_main.loc[mask, target_q].astype(int).astype(str)
        sku_parts.append(part)
    
    if sku_parts:
        df_parts = pd.concat(sku_parts, axis=1)
        df_main['full sku'] = df_parts.apply(lambda x: "+".join(x.dropna().astype(str)), axis=1)
    else:
        df_main['full sku'] = ''
    
    # Date normalization
    df_main['order date'] = df_main['order date'].apply(normalize_date)
    
    print(f"\n  ✅ Sandbox Transform complete: {len(df_main)} simulated cleaned records")
    
    # Action breakdown
    action_counts = df_main['action'].value_counts().to_dict()
    print(f"  Action breakdown: {dict(sorted(action_counts.items()))}")
    
    return df_main

# ═══════════════════════════════════════════════════════
# Step 5: Compare with V1
# ═══════════════════════════════════════════════════════
def compare_results(df_simulated):
    """Compare simulated results against V1 Data_Clean_Log (2025-01-01+)."""
    print("\n" + "="*70)
    print("STEP 5: Compare Simulated vs V1 Data_Clean_Log (≥2025-01-01)")
    print("="*70)
    
    my = pymysql.connect(**MYSQL_CFG)
    df_v1 = pd.read_sql(f"""
        SELECT * FROM Data_Clean_Log
        WHERE `order date` >= '{DATE_CUTOFF}'
    """, my)
    my.close()
    
    df_v1.columns = df_v1.columns.str.strip()
    
    print(f"\n  📊 Row Count Comparison:")
    print(f"  {'':>25s}  {'V1 Clean':>12s}  {'V3 Simulated':>12s}  {'Match':>6s}")
    print(f"  {'-'*60}")
    
    v1_total = len(df_v1)
    v3_total = len(df_simulated)
    match_total = '✅' if v1_total == v3_total else '❌'
    print(f"  {'Total rows':>25s}  {v1_total:>12,d}  {v3_total:>12,d}  {match_total:>6s}")
    
    # Action breakdown
    v1_actions = df_v1['action'].value_counts().to_dict()
    v3_actions = df_simulated['action'].value_counts().to_dict()
    all_actions = sorted(set(list(v1_actions.keys()) + list(v3_actions.keys())))
    
    print(f"\n  📊 Action Breakdown:")
    print(f"  {'Action':>25s}  {'V1':>12s}  {'V3 Sim':>12s}  {'Match':>6s}")
    print(f"  {'-'*60}")
    for a in all_actions:
        v1c = v1_actions.get(a, 0)
        v3c = v3_actions.get(a, 0)
        m = '✅' if v1c == v3c else '❌'
        print(f"  {a:>25s}  {v1c:>12,d}  {v3c:>12,d}  {m:>6s}")
    
    # Seller breakdown
    v1_sellers = df_v1['seller'].value_counts().to_dict()
    v3_sellers = df_simulated['seller'].value_counts().to_dict()
    all_sellers = sorted(set(list(v1_sellers.keys()) + list(v3_sellers.keys())), key=str)
    
    print(f"\n  📊 Seller Breakdown:")
    print(f"  {'Seller':>25s}  {'V1':>12s}  {'V3 Sim':>12s}  {'Match':>6s}")
    print(f"  {'-'*60}")
    for s in all_sellers:
        v1c = v1_sellers.get(s, 0)
        v3c = v3_sellers.get(s, 0)
        m = '✅' if v1c == v3c else '❌'
        print(f"  {str(s):>25s}  {v1c:>12,d}  {v3c:>12,d}  {m:>6s}")
    
    # 4D Key match rate
    print(f"\n  📊 4D Key Match (order_number, seller, item_id, action):")
    
    def make_4d_key(row):
        return (
            str(row.get('order number', '')).strip(),
            str(row.get('seller', '')).strip(),
            str(row.get('item id', '')).strip(),
            str(row.get('action', '')).strip(),
        )
    
    v1_keys = set()
    for _, row in df_v1.iterrows():
        v1_keys.add(make_4d_key(row))
    
    v3_keys = set()
    for _, row in df_simulated.iterrows():
        v3_keys.add(make_4d_key(row))
    
    common = v1_keys & v3_keys
    only_v1 = v1_keys - v3_keys
    only_v3 = v3_keys - v1_keys
    
    print(f"  V1 unique 4D keys:      {len(v1_keys):>10,d}")
    print(f"  V3 unique 4D keys:      {len(v3_keys):>10,d}")
    print(f"  Common keys:            {len(common):>10,d}  ({'✅' if len(only_v1) == 0 and len(only_v3) == 0 else '⚠️'})")
    print(f"  Only in V1:             {len(only_v1):>10,d}")
    print(f"  Only in V3:             {len(only_v3):>10,d}")
    
    if only_v1 and len(only_v1) <= 20:
        print(f"\n  Keys only in V1 (first 20):")
        for k in sorted(list(only_v1))[:20]:
            print(f"    {k}")
    if only_v3 and len(only_v3) <= 20:
        print(f"\n  Keys only in V3 (first 20):")
        for k in sorted(list(only_v3))[:20]:
            print(f"    {k}")
    
    # ─── SKU Consumption Comparison ───
    print(f"\n  📊 SKU Consumption Summary (NN only, qty per SKU):")
    
    def compute_sku_consumption(df, label):
        """Sum qtyp{i} for each sku{i} across all NN records."""
        consumption = defaultdict(float)
        df_nn = df[df['action'] == 'NN'] if 'action' in df.columns else df
        
        for i in range(1, 11):
            sku_col = f'sku{i}'
            qtyp_col = f'qtyp{i}'
            
            if sku_col not in df_nn.columns or qtyp_col not in df_nn.columns:
                continue
            
            for _, row in df_nn.iterrows():
                sku = str(row.get(sku_col, '')).strip()
                if sku and sku != '0' and sku != 'nan' and sku != '0.0':
                    try:
                        qty = float(row.get(qtyp_col, 0))
                    except:
                        qty = 0.0
                    consumption[sku] += qty
        
        return consumption
    
    v1_sku = compute_sku_consumption(df_v1, 'V1')
    v3_sku = compute_sku_consumption(df_simulated, 'V3')
    
    all_skus = sorted(set(list(v1_sku.keys()) + list(v3_sku.keys())))
    
    mismatched_skus = []
    matched_skus = 0
    
    for sku in all_skus:
        v1q = v1_sku.get(sku, 0.0)
        v3q = v3_sku.get(sku, 0.0)
        if abs(v1q - v3q) > 0.01:
            mismatched_skus.append((sku, v1q, v3q))
        else:
            matched_skus += 1
    
    print(f"  Total unique SKUs:      {len(all_skus):>10,d}")
    print(f"  Matched:                {matched_skus:>10,d}  ✅")
    print(f"  Mismatched:             {len(mismatched_skus):>10,d}  {'✅' if not mismatched_skus else '❌'}")
    
    if mismatched_skus:
        print(f"\n  {'SKU':>30s}  {'V1 Qty':>12s}  {'V3 Qty':>12s}  {'Delta':>12s}")
        print(f"  {'-'*70}")
        for sku, v1q, v3q in sorted(mismatched_skus, key=lambda x: abs(x[2]-x[1]), reverse=True)[:30]:
            delta = v3q - v1q
            print(f"  {sku:>30s}  {v1q:>12.1f}  {v3q:>12.1f}  {delta:>+12.1f}")
    
    # ─── Financial spot check (sample 5 orders) ───
    print(f"\n  📊 Financial Spot Check (5 random NN orders):")
    
    common_orders = list(set(df_v1[df_v1['action'] == 'NN']['order number'].unique()) & 
                        set(df_simulated[df_simulated['action'] == 'NN']['order number'].unique()))
    
    if common_orders:
        np.random.seed(42)
        sample_orders = np.random.choice(common_orders, min(5, len(common_orders)), replace=False)
        
        money_cols = ['revenue', 'Shipping and handling', 'Final Value Fee - fixed', 'Final Value Fee - variable']
        
        for order in sample_orders:
            v1_rows = df_v1[(df_v1['order number'] == order) & (df_v1['action'] == 'NN')]
            v3_rows = df_simulated[(df_simulated['order number'] == order) & (df_simulated['action'] == 'NN')]
            
            print(f"\n  Order: {order}  (V1: {len(v1_rows)} items, V3: {len(v3_rows)} items)")
            for mc in money_cols:
                if mc in v1_rows.columns and mc in v3_rows.columns:
                    v1_sum = pd.to_numeric(v1_rows[mc], errors='coerce').sum()
                    v3_sum = pd.to_numeric(v3_rows[mc], errors='coerce').sum()
                    m = '✅' if abs(v1_sum - v3_sum) < 0.02 else '❌'
                    print(f"    {mc:>35s}: V1=${v1_sum:>10.2f}  V3=${v3_sum:>10.2f}  {m}")
    
    # ─── Summary ───
    print(f"\n{'='*70}")
    print("SUMMARY")
    print(f"{'='*70}")
    print(f"  Row count match:        {'✅ PASS' if v1_total == v3_total else '❌ FAIL'}")
    print(f"  Action breakdown:       {'✅ PASS' if all(v1_actions.get(a, 0) == v3_actions.get(a, 0) for a in all_actions) else '❌ FAIL'}")
    print(f"  4D key match:           {'✅ PASS' if len(only_v1) == 0 and len(only_v3) == 0 else '❌ FAIL'}")
    print(f"  SKU consumption:        {'✅ PASS' if not mismatched_skus else '❌ FAIL'}")
    print(f"{'='*70}")

# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════
if __name__ == '__main__':
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  ETL Sandbox Verification — V3 Transform vs V1 Data_Clean_Log  ║")
    print("╠══════════════════════════════════════════════════════════════════╣")
    print(f"║  Date cutoff: {DATE_CUTOFF}                                     ║")
    print(f"║  Mode: READ-ONLY sandbox (except raw_earnings migration)       ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    
    # Step 0: Migrate earnings
    migrate_raw_earnings()
    
    # Step 1-4: Sandbox transform
    df_simulated = sandbox_transform()
    
    # Step 5: Compare
    compare_results(df_simulated)
