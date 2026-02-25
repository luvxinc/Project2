#!/usr/bin/env python3
"""
V3 Clean + FIFO 重建脚本 (2025-01-01+)
========================================
Phase 1: 清除旧数据 (FIFO sales + cleaned_transactions)
Phase 2: 重新生成 cleaned_transactions
Phase 3: 验证
Phase 4: 重写 FIFO sale/return/cancel
Phase 5: 最终验证
"""

import os, sys, csv, re
from collections import defaultdict
from datetime import datetime
import pymysql
import psycopg2
import psycopg2.extras
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings('ignore')

MYSQL_CFG = dict(host='localhost', user='root', password='***REDACTED_PASSWORD***', database='MGMT', charset='utf8mb4')
PG_DSN = "dbname=mgmt_v2 host=localhost"
SKU_CORRECTIONS_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'knowledge_base', 'sku_correction_memory.csv')
DATE_CUTOFF = '2025-01-01'

def safe_float(val):
    if val is None: return 0.0
    s = str(val).replace('$', '').replace(',', '').strip()
    try: return float(s)
    except: return 0.0

def normalize_date(val):
    if not val or str(val).strip() == '': return None
    try: return pd.to_datetime(str(val).strip()).strftime('%Y-%m-%d')
    except: return str(val).strip()

# ═══════════════════════════════════════════════════════
# PHASE 1: 清除旧数据
# ═══════════════════════════════════════════════════════
def phase1_clear(pg):
    print("\n" + "=" * 70)
    print("PHASE 1: 清除旧数据")
    print("=" * 70)
    
    cur = pg.cursor()
    
    # 1a. Delete allocations linked to sale/return/cancel
    cur.execute("""
        DELETE FROM fifo_allocations
        WHERE out_tran_id IN (
            SELECT id FROM fifo_transactions
            WHERE tran_type IN ('sale', 'return', 'cancel')
        )
    """)
    alloc_deleted = cur.rowcount
    print("  ① Deleted fifo_allocations: %d rows" % alloc_deleted)
    
    # 1b. Delete sale/return/cancel transactions
    cur.execute("""
        DELETE FROM fifo_transactions
        WHERE tran_type IN ('sale', 'return', 'cancel')
    """)
    tran_deleted = cur.rowcount
    print("  ② Deleted fifo_transactions (sale/return/cancel): %d rows" % tran_deleted)
    
    # 1c. Recalculate qty_remaining = qty_in (all allocations removed)
    cur.execute("""
        UPDATE fifo_layers SET qty_remaining = qty_in, closed_at = NULL
    """)
    layers_updated = cur.rowcount
    print("  ③ Reset fifo_layers.qty_remaining = qty_in: %d layers" % layers_updated)
    
    # 1d. Delete cleaned_transactions >= 2025-01-01
    cur.execute("DELETE FROM cleaned_transactions WHERE order_date >= %s", (DATE_CUTOFF,))
    clean_deleted = cur.rowcount
    print("  ④ Deleted cleaned_transactions (≥2025-01-01): %d rows" % clean_deleted)
    
    # Verify
    cur.execute("SELECT COUNT(*) FROM fifo_allocations")
    print("\n  Verify: fifo_allocations remaining: %d" % cur.fetchone()[0])
    cur.execute("SELECT COUNT(*) FROM fifo_transactions WHERE tran_type IN ('sale','return','cancel')")
    print("  Verify: sale/return/cancel tran remaining: %d" % cur.fetchone()[0])
    cur.execute("SELECT SUM(qty_remaining), SUM(qty_in) FROM fifo_layers")
    r = cur.fetchone()
    print("  Verify: qty_remaining=%d == qty_in=%d: %s" % (r[0], r[1], '✅' if r[0]==r[1] else '❌'))
    
    return alloc_deleted, tran_deleted, clean_deleted

# ═══════════════════════════════════════════════════════
# PHASE 2: 重新生成 cleaned_transactions
# ═══════════════════════════════════════════════════════
def phase2_generate_clean(pg):
    print("\n" + "=" * 70)
    print("PHASE 2: 重新生成 cleaned_transactions")
    print("=" * 70)
    
    # Read V3 raw_transactions
    print("  Reading V3 raw_transactions (≥2025-01-01)...")
    df_raw = pd.read_sql("SELECT * FROM raw_transactions WHERE order_date >= '%s'" % DATE_CUTOFF, pg)
    print("  → %d raw transaction rows" % len(df_raw))
    
    # Read V3 raw_earnings
    print("  Reading V3 raw_earnings (≥2025-01-01)...")
    df_earn = pd.read_sql("SELECT * FROM raw_earnings WHERE order_date >= '%s'" % DATE_CUTOFF, pg)
    print("  → %d raw earning rows" % len(df_earn))
    
    # We need V1 parsed SKU columns — read from V1 Data_Transaction
    my = pymysql.connect(**MYSQL_CFG)
    print("  Reading V1 Data_Transaction for parsed SKU columns...")
    df_v1 = pd.read_sql("SELECT * FROM Data_Transaction WHERE `Transaction creation date` >= '%s'" % DATE_CUTOFF, my)
    df_v1.columns = df_v1.columns.str.strip().str.lower()
    print("  → %d V1 rows" % len(df_v1))
    my.close()
    
    df_trans = df_v1.copy()
    
    # ─── Numeric cleaning ───
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
    
    # ─── Earning map ───
    if not df_earn.empty and 'shipping_labels' in df_earn.columns:
        earn_df = df_earn.copy()
        earn_df['shipping_labels'] = pd.to_numeric(earn_df['shipping_labels'], errors='coerce').fillna(0.0)
        earn_map = earn_df.groupby('order_number')['shipping_labels'].sum().reset_index()
        earn_map.columns = ['order number', 'Shipping label-Earning data']
    else:
        earn_map = pd.DataFrame(columns=['order number', 'Shipping label-Earning data'])
    
    # ─── Action logic ───
    for col in ['type', 'reference id', 'seller', 'item id']:
        if col not in df_trans.columns: df_trans[col] = ''
    
    df_trans['type_lower'] = df_trans['type'].astype(str).str.lower()
    df_trans['ref_lower'] = df_trans['reference id'].astype(str).str.lower()
    df_trans['action_code'] = 'NN'
    
    df_trans.loc[df_trans['type_lower'] == 'payment dispute', 'action_code'] = 'PD'
    mask_claim = df_trans['type_lower'] == 'claim'
    df_trans.loc[mask_claim & df_trans['ref_lower'].str.contains('case', case=False), 'action_code'] = 'CC'
    df_trans.loc[mask_claim & df_trans['ref_lower'].str.contains('request', case=False), 'action_code'] = 'CR'
    mask_refund = df_trans['type_lower'] == 'refund'
    df_trans.loc[mask_refund & df_trans['ref_lower'].str.contains('return', case=False), 'action_code'] = 'RE'
    df_trans.loc[mask_refund & df_trans['ref_lower'].str.contains('cancel', case=False), 'action_code'] = 'CA'
    
    mask_return_action = df_trans['action_code'].isin(['CA', 'RE', 'CR', 'CC', 'PD'])
    df_returns_raw = df_trans[mask_return_action][['order number', 'action_code', 'transaction creation date']].copy()
    df_returns_raw = df_returns_raw.drop_duplicates('order number')
    
    # ─── Seller logic ───
    df_trans['seller_clean'] = df_trans['seller'].astype(str).str.strip().str.replace(r"['\"]", '', regex=True)
    df_trans['is_prio'] = df_trans['seller_clean'].str.lower().str.contains('esparts').astype(int)
    seller_map = df_trans.sort_values(['is_prio', 'seller_clean'], ascending=[False, True]).drop_duplicates('order number')[['order number', 'seller_clean']]
    seller_map.rename(columns={'seller_clean': 'seller'}, inplace=True)
    
    # ─── Shipping label classification ───
    mask_ship = df_trans['type_lower'] == 'shipping label'
    df_ship = df_trans[mask_ship].copy()
    if 'description' not in df_ship.columns: df_ship['description'] = ''
    df_ship['desc_lower'] = df_ship['description'].astype(str).str.lower()
    df_ship['amt'] = df_ship['gross transaction amount']
    df_ship['underpay'] = np.where(df_ship['desc_lower'].str.contains('underpaid'), df_ship['amt'], 0.0)
    df_ship['overpay'] = np.where(df_ship['desc_lower'].str.contains('overpaid'), df_ship['amt'], 0.0)
    df_ship['return'] = np.where(df_ship['desc_lower'].str.contains('return shipping'), df_ship['amt'], 0.0)
    df_ship['regular'] = np.where(~df_ship['desc_lower'].str.contains('underpaid|overpaid|return|voided|bulk'), df_ship['amt'], 0.0)
    ship_agg = df_ship.groupby('order number')[['underpay', 'overpay', 'return', 'regular']].sum().reset_index()
    ship_agg.columns = ['order number', 'Shipping label-underpay', 'Shipping label-overpay', 'Shipping label-Return', 'Shipping label-Regular']
    
    # ─── Main table (Order rows only) ───
    mask_order = (df_trans['type_lower'] == 'order') & (df_trans['item id'].notna())
    df_main = df_trans[mask_order].copy()
    df_main['action'] = 'NN'
    if 'seller' in df_main.columns: df_main.drop(columns=['seller'], inplace=True)
    df_main = df_main.merge(seller_map, on='order number', how='left')
    df_main = df_main.merge(earn_map, on='order number', how='left')
    df_main = df_main.merge(ship_agg, on='order number', how='left')
    df_main.fillna(0, inplace=True)
    
    # ─── Generate return/cancel records ───
    if not df_returns_raw.empty:
        return_records = []
        for _, ret_row in df_returns_raw.iterrows():
            nn_rows = df_main[df_main['order number'] == ret_row['order number']]
            for _, nn_row in nn_rows.iterrows():
                ret_record = nn_row.to_dict()
                ret_record['action'] = ret_row['action_code']
                if pd.notna(ret_row['transaction creation date']):
                    ret_record['transaction creation date'] = ret_row['transaction creation date']
                return_records.append(ret_record)
        if return_records:
            df_main = pd.concat([df_main, pd.DataFrame(return_records)], ignore_index=True)
    
    # ─── Fee proration ───
    order_totals = df_main.groupby('order number')['item subtotal'].transform('sum')
    df_main['ratio'] = np.where(order_totals != 0, df_main['item subtotal'] / order_totals, 0.0)
    for col in ['Shipping label-Earning data', 'Shipping label-underpay', 'Shipping label-overpay', 'Shipping label-Return', 'Shipping label-Regular']:
        if col in df_main.columns:
            df_main[col] = df_main[col] * df_main['ratio']
    
    # ─── Column rename ───
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
    
    # ─── SKU flattening ───
    for i in range(1, 11):
        s_col, q_col = 'p_sku%d' % i, 'p_quantity%d' % i
        t_s, t_q, t_qp = 'sku%d' % i, 'qty%d' % i, 'qtyp%d' % i
        if s_col not in df_main.columns:
            df_main[t_s] = ''
            df_main[t_q] = 0
            df_main[t_qp] = 0
            continue
        df_main[t_s] = df_main[s_col]
        df_main[t_q] = pd.to_numeric(df_main[q_col].astype(str).str.replace(r'[$,\s]', '', regex=True), errors='coerce').fillna(0.0)
        df_main[t_qp] = df_main[t_q] * df_main['quantity']
    
    df_main['order date'] = df_main['order date'].apply(normalize_date)
    
    print("\n  ✅ Generated %d cleaned records" % len(df_main))
    action_counts = df_main['action'].value_counts().to_dict()
    print("  Actions: %s" % dict(sorted(action_counts.items())))
    
    return df_main

# ═══════════════════════════════════════════════════════
# PHASE 3: 验证 (写入前)
# ═══════════════════════════════════════════════════════
def phase3_validate(df_new):
    print("\n" + "=" * 70)
    print("PHASE 3: 验证 (写入前)")
    print("=" * 70)
    
    my = pymysql.connect(**MYSQL_CFG)
    df_v1 = pd.read_sql("SELECT * FROM Data_Clean_Log WHERE `order date` >= '%s'" % DATE_CUTOFF, my)
    df_v1.columns = df_v1.columns.str.strip()
    my.close()
    
    v1_total = len(df_v1)
    v3_total = len(df_new)
    v1_actions = df_v1['action'].value_counts().to_dict()
    v3_actions = df_new['action'].value_counts().to_dict()
    
    print("\n  %-25s %12s %12s %6s" % ('', 'V1 Clean', 'V3 New', 'Delta'))
    print("  " + "-" * 60)
    print("  %-25s %12d %12d %+6d" % ('Total rows', v1_total, v3_total, v3_total - v1_total))
    
    all_actions = sorted(set(list(v1_actions.keys()) + list(v3_actions.keys())))
    for a in all_actions:
        v1c, v3c = v1_actions.get(a, 0), v3_actions.get(a, 0)
        mark = '✅' if v1c == v3c else '⚠️+%d' % (v3c - v1c)
        print("  %-25s %12d %12d %6s" % ('Action=%s' % a, v1c, v3c, mark))
    
    # SKU consumption check
    def sku_consumption(df):
        c = defaultdict(float)
        df_nn = df[df['action'] == 'NN']
        for i in range(1, 11):
            sc, qc = 'sku%d' % i, 'qtyp%d' % i
            if sc not in df_nn.columns or qc not in df_nn.columns: continue
            for _, row in df_nn.iterrows():
                sku = str(row.get(sc, '')).strip()
                if sku and sku != '0' and sku != 'nan':
                    try: c[sku] += float(row.get(qc, 0))
                    except: pass
        return c
    
    v1_sku = sku_consumption(df_v1)
    v3_sku = sku_consumption(df_new)
    all_skus = sorted(set(list(v1_sku.keys()) + list(v3_sku.keys())))
    sku_match = sum(1 for s in all_skus if abs(v1_sku.get(s, 0) - v3_sku.get(s, 0)) < 0.01)
    
    print("\n  SKU consumption: %d/%d matched  %s" % (sku_match, len(all_skus), '✅' if sku_match == len(all_skus) else '❌'))
    
    # Expected: V3 has ~70 more RE/CR/CC than V1 (V1's cross-month bug)
    nn_match = v1_actions.get('NN', 0) == v3_actions.get('NN', 0)
    ca_match = v1_actions.get('CA', 0) == v3_actions.get('CA', 0)
    print("\n  NN match: %s  CA match: %s" % ('✅' if nn_match else '❌', '✅' if ca_match else '❌'))
    print("  Extra RE/CR/CC/PD (V1 cross-month bug fix): %+d" % (v3_total - v1_total))
    
    passed = nn_match and ca_match and sku_match == len(all_skus)
    print("\n  VALIDATION: %s" % ('✅ PASSED' if passed else '❌ FAILED'))
    return passed

# ═══════════════════════════════════════════════════════
# Insert cleaned_transactions into V3
# ═══════════════════════════════════════════════════════
def insert_cleaned_transactions(pg, df):
    print("\n  Inserting %d cleaned_transactions..." % len(df))
    cur = pg.cursor()
    
    # Direct column mapping: DataFrame source → DB column
    col_map = {
        'order date': 'order_date',
        'seller': 'seller',
        'order number': 'order_number',
        'item id': 'item_id',
        'item title': 'item_title',
        'quantity': 'quantity',
        'action': 'action',
        # Financial
        'revenue': 'sale_amount',
        'Shipping and handling': 'shipping_fee',
        'Seller collected tax': 'seller_tax',
        'eBay collected tax': 'ebay_tax',
        'Final Value Fee - fixed': 'fvf_fee_fixed',
        'Final Value Fee - variable': 'fvf_fee_variable',
        'Regulatory operating fee': 'regulatory_fee',
        'International fee': 'intl_fee',
        'Promoted Listings fee': 'promo_fee',
        # Shipping labels
        'Shipping label-Earning data': 'label_cost',
        'Shipping label-Regular': 'label_regular',
        'Shipping label-underpay': 'label_underpay',
        'Shipping label-overpay': 'label_overpay',
        'Shipping label-Return': 'label_return',
        # Custom label / full SKU
        'custom label': 'full_sku',
        'buyer username': 'buyer_username',
    }
    
    # SKU columns: sku1-10, quantity1-10, qtyp1-10
    for i in range(1, 11):
        col_map['sku%d' % i] = 'sku%d' % i
        col_map['qty%d' % i] = 'quantity%d' % i
        col_map['qtyp%d' % i] = 'qtyp%d' % i
    
    # Filter to only columns that actually exist in both source and DB
    valid_cols = {k: v for k, v in col_map.items() if k in df.columns}
    
    # Financial numeric columns
    numeric_cols = {'sale_amount', 'shipping_fee', 'seller_tax', 'ebay_tax',
                    'fvf_fee_fixed', 'fvf_fee_variable', 'regulatory_fee', 'intl_fee',
                    'promo_fee', 'dispute_fee', 'refund_amount',
                    'label_cost', 'label_regular', 'label_underpay', 'label_overpay', 'label_return',
                    'fvf_fee', 'tax_amount', 'net_amount', 'ad_fee', 'other_fee'}
    int_cols = {'quantity'} | {'quantity%d' % i for i in range(1, 11)} | {'qtyp%d' % i for i in range(1, 11)}
    
    insert_cols = list(valid_cols.values())
    placeholders = ', '.join(['%s'] * len(insert_cols))
    sql = "INSERT INTO cleaned_transactions (%s) VALUES (%s)" % (', '.join(insert_cols), placeholders)
    
    batch = []
    inserted = 0
    for _, row in df.iterrows():
        values = []
        for src, dst in valid_cols.items():
            val = row.get(src)
            if pd.isna(val): val = None
            
            if dst == 'order_date' and val:
                val = normalize_date(val)
            elif dst in int_cols:
                try: val = int(float(val)) if val else 0
                except: val = 0
            elif dst in numeric_cols:
                try: val = round(float(val), 2) if val else 0.0
                except: val = 0.0
            elif dst == 'action':
                val = str(val).strip() if val else 'NN'
            elif val is not None:
                val = str(val).strip()
                if val in ('nan', 'None', ''): val = None
            
            values.append(val)
        batch.append(tuple(values))
        
        if len(batch) >= 2000:
            psycopg2.extras.execute_batch(cur, sql, batch, page_size=500)
            inserted += len(batch)
            batch = []
    
    if batch:
        psycopg2.extras.execute_batch(cur, sql, batch, page_size=500)
        inserted += len(batch)
    
    print("  ✅ Inserted %d cleaned_transactions" % inserted)
    return inserted

# ═══════════════════════════════════════════════════════
# PHASE 4: FIFO 重写
# ═══════════════════════════════════════════════════════
def phase4_rewrite_fifo(pg, df_clean):
    print("\n" + "=" * 70)
    print("PHASE 4: FIFO 重写 (sale/return/cancel)")
    print("=" * 70)
    
    cur = pg.cursor()
    
    # Process NN records (sales out)
    df_nn = df_clean[df_clean['action'] == 'NN'].copy()
    df_nn = df_nn.sort_values('order date')
    
    # Process return/cancel records
    df_ret = df_clean[df_clean['action'].isin(['RE', 'CA', 'CR', 'CC', 'PD'])].copy()
    df_ret = df_ret.sort_values('order date')
    
    print("  NN (sale) records: %d" % len(df_nn))
    print("  Return/Cancel records: %d" % len(df_ret))
    
    # Load current layers (all qty_remaining = qty_in after Phase 1 reset)
    cur.execute("""
        SELECT id, sku, qty_in, qty_remaining, unit_cost, in_date
        FROM fifo_layers
        ORDER BY sku, in_date
    """)
    layers_raw = cur.fetchall()
    
    # Build layer structure: {sku: [list of layers sorted by in_date]}
    layers_by_sku = defaultdict(list)
    for r in layers_raw:
        layers_by_sku[r[1]].append({
            'id': r[0], 'sku': r[1], 'qty_in': r[2], 'qty_remaining': r[3],
            'unit_cost': float(r[4]), 'in_date': r[5]
        })
    
    # ─── Process Sales (NN) ───
    print("\n  Processing sales (FIFO out)...")
    sale_tran_count = 0
    alloc_count = 0
    errors = []
    
    for _, row in df_nn.iterrows():
        order_date = normalize_date(row.get('order date'))
        order_num = str(row.get('order number', '')).strip()
        seller = str(row.get('seller', '')).strip()
        item_id = str(row.get('item id', '')).strip()
        
        # Parse SKUs from this row
        for i in range(1, 11):
            sku = str(row.get('sku%d' % i, '')).strip()
            qtyp = row.get('qtyp%d' % i, 0)
            try: qtyp = int(float(qtyp))
            except: qtyp = 0
            
            if not sku or sku in ('0', 'nan', '0.0', '') or qtyp <= 0:
                continue
            
            # Create FIFO transaction
            ref_key = "SALES:%s:%s:%s:NN" % (seller, order_num, item_id)
            cur.execute("""
                INSERT INTO fifo_transactions (transaction_date, sku, quantity, action, tran_type, ref_key, unit_price)
                VALUES (%s, %s, %s, 'out', 'sale', %s, 0)
                RETURNING id
            """, (order_date, sku, qtyp, ref_key))
            tran_id = cur.fetchone()[0]
            sale_tran_count += 1
            
            # FIFO allocation: consume oldest layers
            remaining = qtyp
            sku_layers = layers_by_sku.get(sku, [])
            
            for layer in sku_layers:
                if remaining <= 0: break
                if layer['qty_remaining'] <= 0: continue
                
                consume = min(remaining, layer['qty_remaining'])
                cost_alloc = consume * layer['unit_cost']
                
                cur.execute("""
                    INSERT INTO fifo_allocations (out_tran_id, layer_id, sku, out_date, qty_alloc, unit_cost, cost_alloc)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (tran_id, layer['id'], sku, order_date, consume, layer['unit_cost'], cost_alloc))
                alloc_count += 1
                
                layer['qty_remaining'] -= consume
                remaining -= consume
            
            if remaining > 0:
                errors.append("SKU %s: need %d more units (order %s)" % (sku, remaining, order_num))
    
    # Update unit_price on sale transactions to weighted average
    cur.execute("""
        UPDATE fifo_transactions ft
        SET unit_price = COALESCE((
            SELECT SUM(a.cost_alloc) / NULLIF(SUM(a.qty_alloc), 0)
            FROM fifo_allocations a WHERE a.out_tran_id = ft.id
        ), 0)
        WHERE ft.tran_type = 'sale'
    """)
    
    print("  ✅ Sales: %d transactions, %d allocations" % (sale_tran_count, alloc_count))
    if errors:
        print("  ⚠️ %d shortage errors (first 5):" % len(errors))
        for e in errors[:5]: print("    %s" % e)
    
    # ─── Process Returns/Cancels ───
    print("\n  Processing returns/cancels (FIFO in)...")
    ret_tran_count = 0
    
    action_to_type = {'RE': 'return', 'CA': 'cancel', 'CR': 'cancel', 'CC': 'cancel', 'PD': 'cancel'}
    
    for _, row in df_ret.iterrows():
        order_date = normalize_date(row.get('order date'))
        order_num = str(row.get('order number', '')).strip()
        seller = str(row.get('seller', '')).strip()
        item_id = str(row.get('item id', '')).strip()
        action = str(row.get('action', '')).strip()
        
        for i in range(1, 11):
            sku = str(row.get('sku%d' % i, '')).strip()
            qtyp = row.get('qtyp%d' % i, 0)
            try: qtyp = int(float(qtyp))
            except: qtyp = 0
            
            if not sku or sku in ('0', 'nan', '0.0', '') or qtyp <= 0:
                continue
            
            tran_type = action_to_type.get(action, 'cancel')
            ref_key = "SALES:%s:%s:%s:%s" % (seller, order_num, item_id, action)
            
            cur.execute("""
                INSERT INTO fifo_transactions (transaction_date, sku, quantity, action, tran_type, ref_key, unit_price)
                VALUES (%s, %s, %s, 'in', %s, %s, 0)
                RETURNING id
            """, (order_date, sku, qtyp, tran_type, ref_key))
            ret_tran_count += 1
            
            # Return stock to the most recently consumed layer for this SKU
            sku_layers = layers_by_sku.get(sku, [])
            remaining = qtyp
            for layer in reversed(sku_layers):
                if remaining <= 0: break
                can_return = layer['qty_in'] - layer['qty_remaining']
                if can_return <= 0: continue
                
                ret_qty = min(remaining, can_return)
                layer['qty_remaining'] += ret_qty
                remaining -= ret_qty
            
            # If still remaining (all layers full), add to oldest available
            if remaining > 0 and sku_layers:
                sku_layers[0]['qty_remaining'] += remaining
    
    print("  ✅ Returns/Cancels: %d transactions" % ret_tran_count)
    
    # ─── Update fifo_layers.qty_remaining ───
    print("\n  Updating fifo_layers.qty_remaining...")
    for sku, lyrs in layers_by_sku.items():
        for l in lyrs:
            cur.execute("UPDATE fifo_layers SET qty_remaining = %s WHERE id = %s", (l['qty_remaining'], l['id']))
            if l['qty_remaining'] <= 0:
                cur.execute("UPDATE fifo_layers SET closed_at = NOW() WHERE id = %s AND closed_at IS NULL", (l['id'],))
    
    print("  ✅ Updated %d layers" % len(layers_raw))
    
    return sale_tran_count, alloc_count, ret_tran_count, errors

# ═══════════════════════════════════════════════════════
# PHASE 5: 最终验证
# ═══════════════════════════════════════════════════════
def phase5_final_verify(pg):
    print("\n" + "=" * 70)
    print("PHASE 5: 最终验证")
    print("=" * 70)
    
    cur = pg.cursor()
    
    # 1. Row counts
    cur.execute("SELECT COUNT(*) FROM cleaned_transactions WHERE order_date >= %s", (DATE_CUTOFF,))
    clean_count = cur.fetchone()[0]
    
    cur.execute("SELECT tran_type, action, COUNT(*) FROM fifo_transactions WHERE tran_type IN ('sale','return','cancel') GROUP BY tran_type, action ORDER BY tran_type")
    print("\n  fifo_transactions:")
    for r in cur.fetchall():
        print("    %-12s %-5s %6d" % (r[0], r[1], r[2]))
    
    cur.execute("SELECT COUNT(*) FROM fifo_allocations")
    alloc_total = cur.fetchone()[0]
    print("\n  fifo_allocations: %d" % alloc_total)
    
    # 2. SKU balance
    cur.execute("""
        SELECT l.sku,
               SUM(l.qty_in) as total_in,
               SUM(l.qty_remaining) as total_remaining
        FROM fifo_layers l GROUP BY l.sku
    """)
    layer_sums = {r[0]: {'in': int(r[1]), 'rem': int(r[2])} for r in cur.fetchall()}
    
    cur.execute("SELECT sku, SUM(qty_alloc) FROM fifo_allocations GROUP BY sku")
    alloc_sums = {r[0]: int(r[1]) for r in cur.fetchall()}
    
    cur.execute("SELECT sku, SUM(quantity) FROM fifo_transactions WHERE tran_type IN ('return','cancel') GROUP BY sku")
    ret_sums = {r[0]: int(r[1]) for r in cur.fetchall()}
    
    balanced = 0
    unbalanced = []
    for sku in sorted(layer_sums.keys()):
        total_in = layer_sums[sku]['in']
        total_rem = layer_sums[sku]['rem']
        sold = alloc_sums.get(sku, 0)
        returned = ret_sums.get(sku, 0)
        expected = total_in - sold + returned
        if expected == total_rem:
            balanced += 1
        else:
            unbalanced.append((sku, total_in, sold, returned, total_rem, expected))
    
    print("\n  SKU balance: %d/%d balanced  %s" % (balanced, len(layer_sums), '✅' if not unbalanced else '❌'))
    if unbalanced:
        for u in unbalanced[:5]:
            print("    %-20s in=%d sold=%d ret=%d rem=%d expected=%d" % u)
    
    # 3. Price check
    cur.execute("""
        SELECT COUNT(*) FROM fifo_allocations a
        JOIN fifo_layers l ON a.layer_id = l.id
        WHERE a.unit_cost != l.unit_cost
    """)
    price_mismatch = cur.fetchone()[0]
    print("\n  Price mismatch (alloc vs layer): %d  %s" % (price_mismatch, '✅' if price_mismatch == 0 else '❌'))
    
    # 4. Arithmetic check
    cur.execute("""
        SELECT COUNT(*) FROM fifo_allocations
        WHERE ABS(cost_alloc - unit_cost * qty_alloc) >= 0.01
    """)
    arith_err = cur.fetchone()[0]
    print("  Arithmetic errors: %d  %s" % (arith_err, '✅' if arith_err == 0 else '❌'))
    
    all_pass = not unbalanced and price_mismatch == 0 and arith_err == 0
    print("\n  FINAL: %s" % ('✅ ALL CHECKS PASSED' if all_pass else '❌ SOME CHECKS FAILED'))
    return all_pass

# ═══════════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════════
if __name__ == '__main__':
    print("╔══════════════════════════════════════════════════════════════════╗")
    print("║  V3 Clean + FIFO 重建 (2025-01-01+)                           ║")
    print("║  ⚠️ PRODUCTION DATA MODIFICATION                               ║")
    print("╚══════════════════════════════════════════════════════════════════╝")
    
    pg = psycopg2.connect(PG_DSN)
    pg.autocommit = False
    
    try:
        # Phase 1
        phase1_clear(pg)
        
        # Phase 2
        df_clean = phase2_generate_clean(pg)
        
        # Phase 3
        passed = phase3_validate(df_clean)
        if not passed:
            print("\n❌ VALIDATION FAILED — ROLLING BACK")
            pg.rollback()
            sys.exit(1)
        
        # Insert cleaned_transactions
        insert_cleaned_transactions(pg, df_clean)
        
        # Phase 4
        sale_cnt, alloc_cnt, ret_cnt, errors = phase4_rewrite_fifo(pg, df_clean)
        
        # Phase 5
        all_pass = phase5_final_verify(pg)
        
        if all_pass:
            print("\n✅ ALL PHASES PASSED — COMMITTING")
            pg.commit()
            print("✅ COMMITTED SUCCESSFULLY")
        else:
            print("\n❌ FINAL VERIFICATION FAILED — ROLLING BACK")
            pg.rollback()
            sys.exit(1)
        
    except Exception as e:
        print("\n❌ ERROR: %s" % e)
        import traceback
        traceback.print_exc()
        pg.rollback()
        print("ROLLED BACK")
        sys.exit(1)
    finally:
        pg.close()
