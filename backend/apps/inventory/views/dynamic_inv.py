# File Path: backend/apps/inventory/views/dynamic_inv.py
"""
动态库存管理 - 展示 SKU 实时库存状态
Features:
- 日期选择器 + 今天按钮
- 列表展示: SKU / 实际库存 / 理论库存 / 下订数 / 在途数 / 库存价值
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse
from django.views.decorators.http import require_GET
from django.utils.translation import gettext as _
from datetime import datetime, date
import math

from core.components.db.client import DBClient


def safe_int(val, default=0):
    """安全转换为整数，处理 NaN/None/非数值"""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f):
            return default
        return int(f)
    except (ValueError, TypeError):
        return default


def safe_float(val, default=0.0):
    """安全转换为浮点数，处理 NaN/None/非数值"""
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f):
            return default
        return f
    except (ValueError, TypeError):
        return default


@login_required(login_url='web_ui:login')
def dynamic_inv_page(request):
    """动态库存管理页面"""
    # 获取 Data_inventory 的日期列 (用于匹配用户选择的日期)
    inv_cols_df = DBClient.read_df("DESCRIBE Data_inventory")
    inv_date_cols = [r['Field'] for _idx, r in inv_cols_df.iterrows() if r['Field'] != 'SKU']
    
    return render(request, 'inventory/pages/dynamic_inv.html', {
        'inv_date_cols': inv_date_cols,
        'today': date.today().strftime('%Y-%m-%d')
    })


@login_required(login_url='web_ui:login')
@require_GET
def dynamic_inv_api(request):
    """
    API: 获取指定日期的动态库存数据
    GET /dashboard/inventory/dynamic_inv/api/?date=2024-12-31
    
    返回字段:
    - sku: SKU
    - actual_qty: 实际库存 (Data_inventory)
    - theory_qty: 理论库存 (FIFO层 qty_remaining)
    - order_qty: 下订数 (PO - 已发货)
    - transit_qty: 在途数 (已发货 - 已收货)
    - inv_value: 库存价值 (qty × landed_price)
    - order_value: 下订价值 (order_qty × landed_price)
    - transit_value: 在途价值 (transit_qty × landed_price)
    """
    target_date_str = request.GET.get('date', date.today().strftime('%Y-%m-%d'))
    
    try:
        target_date = datetime.strptime(target_date_str, '%Y-%m-%d').date()
    except ValueError:
        return JsonResponse({'error': _('Invalid date format')}, status=400)
    
    # 1. 获取所有 SKU 列表
    sku_df = DBClient.read_df("SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU")
    all_skus = sku_df['SKU'].tolist() if not sku_df.empty else []
    
    # 2. 获取 Data_inventory 的日期列，找到离 target_date 最近的上一个日期
    inv_cols_df = DBClient.read_df("DESCRIBE Data_inventory")
    inv_date_cols = sorted([r['Field'] for _idx, r in inv_cols_df.iterrows() if r['Field'] != 'SKU'])
    
    # 找到离 target_date 最近的上一个日期列
    matched_inv_col = None
    for col in inv_date_cols:
        try:
            col_date = datetime.strptime(col, '%Y-%m-%d').date()
            if col_date <= target_date:
                matched_inv_col = col
        except ValueError:
            continue
    
    # 3. 读取实际库存 (Data_inventory)
    actual_inv = {}
    if matched_inv_col:
        inv_df = DBClient.read_df(f"SELECT SKU, `{matched_inv_col}` as qty FROM Data_inventory")
        if not inv_df.empty:
            actual_inv = dict(zip(inv_df['SKU'], inv_df['qty']))
    
    # 4. 读取理论库存 (FIFO: in_dynamic_fifo_layers 截止到 target_date)
    theory_inv = {}
    fifo_sql = """
        SELECT sku, SUM(qty_remaining) as qty
        FROM in_dynamic_fifo_layers
        WHERE DATE(in_date) <= :target_date
        GROUP BY sku
    """
    fifo_df = DBClient.read_df(fifo_sql, {'target_date': target_date_str})
    if not fifo_df.empty:
        theory_inv = dict(zip(fifo_df['sku'], fifo_df['qty']))
    
    # 5. 读取库存价值 (使用 FIFO landed_price)
    inv_value = {}
    value_sql = """
        SELECT 
            f.sku, 
            SUM(f.qty_remaining * COALESCE(p.landed_price_usd, f.unit_cost)) as value
        FROM in_dynamic_fifo_layers f
        LEFT JOIN in_dynamic_landed_price p 
            ON f.sku = p.sku AND f.po_num = p.po_num
        WHERE DATE(f.in_date) <= :target_date
        GROUP BY f.sku
    """
    value_df = DBClient.read_df(value_sql, {'target_date': target_date_str})
    if not value_df.empty:
        inv_value = dict(zip(value_df['sku'], value_df['value']))
    
    # 5.1 计算平均成本 (加权平均: SUM(qty * cost) / SUM(qty))
    avg_cost = {}
    avg_cost_sql = """
        SELECT 
            f.sku,
            CASE 
                WHEN SUM(f.qty_remaining) > 0 
                THEN SUM(f.qty_remaining * COALESCE(p.landed_price_usd, f.unit_cost)) / SUM(f.qty_remaining)
                ELSE 0 
            END as avg_cost
        FROM in_dynamic_fifo_layers f
        LEFT JOIN in_dynamic_landed_price p 
            ON f.sku = p.sku AND f.po_num = p.po_num
        WHERE DATE(f.in_date) <= :target_date
        GROUP BY f.sku
    """
    avg_cost_df = DBClient.read_df(avg_cost_sql, {'target_date': target_date_str})
    if not avg_cost_df.empty:
        avg_cost = dict(zip(avg_cost_df['sku'], avg_cost_df['value'] if 'value' in avg_cost_df.columns else avg_cost_df['avg_cost']))
    
    # 5.2 计算当前成本 (FIFO: 最早的未消耗完的层的 unit_cost)
    current_cost = {}
    current_cost_sql = """
        SELECT 
            f.sku,
            COALESCE(p.landed_price_usd, f.unit_cost) as current_cost
        FROM in_dynamic_fifo_layers f
        LEFT JOIN in_dynamic_landed_price p 
            ON f.sku = p.sku AND f.po_num = p.po_num
        WHERE DATE(f.in_date) <= :target_date
          AND f.qty_remaining > 0
        ORDER BY f.sku, f.in_date ASC
    """
    current_cost_df = DBClient.read_df(current_cost_sql, {'target_date': target_date_str})
    if not current_cost_df.empty:
        # 取每个 SKU 的第一条（最早的）
        for _idx, row in current_cost_df.iterrows():
            sku = row['sku']
            if sku not in current_cost:
                current_cost[sku] = float(row['current_cost']) if row['current_cost'] else 0.0

    
    # 6. 计算下订数和在途数
    # PO 订单明细 - 包含 po_date 用于策略匹配
    po_sql = """
        SELECT po_num, po_sku, po_date, SUM(po_quantity) as qty, 
               AVG(po_price) as avg_price
        FROM in_po_final
        WHERE po_date <= :target_date
        GROUP BY po_num, po_sku, po_date
    """
    po_df = DBClient.read_df(po_sql, {'target_date': target_date_str})
    
    # 已发货明细
    sent_sql = """
        SELECT po_num, po_sku, SUM(sent_quantity) as qty
        FROM in_send_final
        WHERE sent_date <= :target_date
        GROUP BY po_num, po_sku
    """
    sent_df = DBClient.read_df(sent_sql, {'target_date': target_date_str})
    sent_map = {}
    if not sent_df.empty:
        for _idx, row in sent_df.iterrows():
            key = (row['po_num'], row['po_sku'])
            sent_map[key] = safe_int(row['qty'])
    
    # 已收货明细
    recv_sql = """
        SELECT po_num, po_sku, SUM(receive_quantity) as qty
        FROM in_receive_final
        WHERE receive_date <= :target_date
        GROUP BY po_num, po_sku
    """
    recv_df = DBClient.read_df(recv_sql, {'target_date': target_date_str})
    recv_map = {}
    if not recv_df.empty:
        for _idx, row in recv_df.iterrows():
            key = (row['po_num'], row['po_sku'])
            recv_map[key] = safe_int(row['qty'])
    
    # 7. 计算每个 SKU 的下订数、在途数、及其价值
    from apps.finance.utils.landed_price import calculate_landed_prices
    
    order_qty = {}    # SKU -> 下订数
    transit_qty = {}  # SKU -> 在途数
    order_value = {}  # SKU -> 下订价值
    transit_value = {}  # SKU -> 在途价值
    
    # 缓存已计算的 landed_price (po_num -> {sku: price})
    landed_price_cache = {}
    
    # [修复] 预加载所有 PO 的货币信息，用于正确转换 USD
    # 根据订单日期（po_date）匹配生效日期（date <= po_date）的最新策略
    po_currency_cache = {}  # po_num -> {'currency': 'RMB'/'USD', 'usd_rmb': 7.0}
    if not po_df.empty:
        # 获取每个订单的日期
        po_date_map = {}
        for _idx, r in po_df.iterrows():
            pn = r['po_num']
            po_dt = r['po_date']
            if pn not in po_date_map:
                po_date_map[pn] = str(po_dt) if po_dt else '9999-12-31'
        
        # 获取所有策略记录
        po_nums = list(po_date_map.keys())
        strategy_sql = """
            SELECT po_num, date, cur_currency, cur_usd_rmb, seq
            FROM in_po_strategy
            WHERE po_num IN :po_nums
            ORDER BY po_num, date DESC, seq DESC
        """
        strategy_df = DBClient.read_df(strategy_sql, {'po_nums': tuple(po_nums)})
        
        if not strategy_df.empty:
            # 对每个订单，找到 date <= po_date 的第一条记录
            for po_num, po_date in po_date_map.items():
                matched = strategy_df[
                    (strategy_df['po_num'] == po_num) & 
                    (strategy_df['date'].astype(str) <= po_date)
                ]
                if not matched.empty:
                    r = matched.iloc[0]  # 已按 date DESC, seq DESC 排序，取第一条
                    po_currency_cache[po_num] = {
                        'currency': r['cur_currency'] or 'USD',
                        'usd_rmb': float(r['cur_usd_rmb']) if r['cur_usd_rmb'] else 7.0
                    }
                else:
                    # 如果没有匹配的策略，取该订单的任意一条（兜底）
                    fallback = strategy_df[strategy_df['po_num'] == po_num]
                    if not fallback.empty:
                        r = fallback.iloc[0]
                        po_currency_cache[po_num] = {
                            'currency': r['cur_currency'] or 'USD',
                            'usd_rmb': float(r['cur_usd_rmb']) if r['cur_usd_rmb'] else 7.0
                        }
    
    if not po_df.empty:
        for _idx, row in po_df.iterrows():
            po_num = row['po_num']
            sku = row['po_sku']
            po_qty = safe_int(row['qty'])
            po_price = safe_float(row['avg_price'])
            
            key = (po_num, sku)
            sent_qty = sent_map.get(key, 0)
            recv_qty = recv_map.get(key, 0)
            
            # 下订数 = PO数量 - 已发货
            sku_order_qty = max(0, po_qty - sent_qty)
            # 在途数 = 已发货 - 已收货
            sku_transit_qty = max(0, sent_qty - recv_qty)
            
            # 累加到 SKU 级别
            order_qty[sku] = order_qty.get(sku, 0) + sku_order_qty
            transit_qty[sku] = transit_qty.get(sku, 0) + sku_transit_qty
            
            # 计算价值 (使用 landed_price)
            if sku_order_qty > 0 or sku_transit_qty > 0:
                # 获取或计算 landed_price
                if po_num not in landed_price_cache:
                    prices = calculate_landed_prices(po_num)
                    # 转换为 {sku: landed_price_usd}
                    sku_prices = {}
                    for (log_num, pn, s, base), data in prices.items():
                        sku_prices[s] = data['landed_price_usd']
                    landed_price_cache[po_num] = sku_prices
                
                # [修复] 回退到 po_price 时，需要根据货币正确转换为 USD
                cached_price = landed_price_cache.get(po_num, {}).get(sku)
                if cached_price is not None:
                    landed_price = cached_price
                else:
                    # 使用 po_price 作为回退，但需要货币转换
                    currency_info = po_currency_cache.get(po_num, {'currency': 'USD', 'usd_rmb': 7.0})
                    if currency_info['currency'] == 'USD':
                        landed_price = po_price
                    else:
                        # RMB -> USD
                        landed_price = po_price / currency_info['usd_rmb'] if currency_info['usd_rmb'] > 0 else po_price
                
                # 下订价值
                if sku_order_qty > 0:
                    order_value[sku] = order_value.get(sku, 0) + sku_order_qty * landed_price
                
                # 在途价值
                if sku_transit_qty > 0:
                    transit_value[sku] = transit_value.get(sku, 0) + sku_transit_qty * landed_price
    
    # 8. 组装结果
    result = []
    for sku in all_skus:
        result.append({
            'sku': sku,
            'avg_cost': round(safe_float(avg_cost.get(sku, 0)), 4),
            'current_cost': round(safe_float(current_cost.get(sku, 0)), 4),
            'actual_qty': safe_int(actual_inv.get(sku, 0)),
            'theory_qty': safe_int(theory_inv.get(sku, 0)),
            'order_qty': safe_int(order_qty.get(sku, 0)),
            'transit_qty': safe_int(transit_qty.get(sku, 0)),
            'inv_value': round(safe_float(inv_value.get(sku, 0)), 2),
            'order_value': round(safe_float(order_value.get(sku, 0)), 2),
            'transit_value': round(safe_float(transit_value.get(sku, 0)), 2)
        })
    
    return JsonResponse({
        'date': target_date_str,
        'matched_inv_col': matched_inv_col,
        'data': result
    })

