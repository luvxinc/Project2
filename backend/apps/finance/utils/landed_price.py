"""
FIFO 入库单价 (Landed Price) 计算模块

职责：
1. 计算订单下所有 SKU 的 landed_price_usd
2. 创建 in_dynamic_landed_price 记录
3. 付款变动时更新价格表

复用 flow_detail_api 的计算逻辑，确保一致性

[Created 2026-01-10]
"""
import logging
from decimal import Decimal
from typing import Dict, Tuple, Optional, List

from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


def calculate_landed_prices(po_num: str) -> Dict[Tuple[str, str, str, float], dict]:
    """
    计算订单下所有 SKU 的 landed_price
    
    复用 flow_detail_api 的计算逻辑
    
    参数:
        po_num: 订单号
        
    返回:
        dict: { 
            (logistic_num, po_num, sku, base_price): {
                'landed_price_usd': float,
                'qty': int,
                'base_price_usd': float,
                'payment_ratio': float,
                'fee_apportioned_usd': float,
            }, 
            ... 
        }
    """
    # ========== Step 1: 获取订单基础信息 ==========
    strategy_sql = """
    SELECT cur_currency, cur_usd_rmb
    FROM in_po_strategy
    WHERE po_num = :po_num
    ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
    LIMIT 1
    """
    strategy_df = DBClient.read_df(strategy_sql, {'po_num': po_num})
    
    if strategy_df.empty:
        return {}
    
    order_currency = strategy_df.iloc[0]['cur_currency'] or 'USD'
    order_usd_rmb = float(strategy_df.iloc[0]['cur_usd_rmb']) if strategy_df.iloc[0]['cur_usd_rmb'] else 7.0
    
    # ========== Step 2: 获取订单总金额 ==========
    raw_total_sql = """
    SELECT SUM(po_price * po_quantity) as raw_total
    FROM in_po_final
    WHERE po_num = :po_num
    """
    raw_df = DBClient.read_df(raw_total_sql, {'po_num': po_num})
    raw_total = float(raw_df.iloc[0]['raw_total']) if not raw_df.empty and raw_df.iloc[0]['raw_total'] else 0.0
    
    # ========== Step 3: 获取实际支付信息 ==========
    # 定金已付 (使用正确的字段名: dep_paid, dep_cur, dep_paid_cur)
    dep_sql = """
    SELECT SUM(dep_paid + dep_prepay_amount) as total, dep_cur, dep_paid_cur, MAX(dep_override) as dep_override
    FROM in_pmt_deposit_final
    WHERE po_num = :po_num
    GROUP BY dep_cur, dep_paid_cur
    """
    dep_df = DBClient.read_df(dep_sql, {'po_num': po_num})
    dep_paid_usd = 0.0
    dep_override = 0
    for _, row in dep_df.iterrows():
        dep_cur = row['dep_cur'] or 'RMB'
        dep_rate = float(row['dep_paid_cur']) if row['dep_paid_cur'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if dep_cur == 'USD':
            dep_paid_usd += total
        else:
            dep_paid_usd += total / dep_rate if dep_rate > 0 else 0.0
        if row['dep_override']:
            dep_override = max(dep_override, int(row['dep_override']))
    
    # 货款已付
    pmt_sql = """
    SELECT SUM(pmt_cash_amount + pmt_prepay_amount) as total, pmt_currency, pmt_fe_rate, MAX(pmt_override) as pmt_override
    FROM in_pmt_po_final
    WHERE po_num = :po_num
    GROUP BY pmt_currency, pmt_fe_rate
    """
    pmt_df = DBClient.read_df(pmt_sql, {'po_num': po_num})
    pmt_paid_usd = 0.0
    pmt_override = 0
    for _, row in pmt_df.iterrows():
        pmt_cur = row['pmt_currency'] or 'RMB'
        pmt_rate = float(row['pmt_fe_rate']) if row['pmt_fe_rate'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if pmt_cur == 'USD':
            pmt_paid_usd += total
        else:
            pmt_paid_usd += total / pmt_rate if pmt_rate > 0 else 0.0
        if row['pmt_override']:
            pmt_override = max(pmt_override, int(row['pmt_override']))
    
    actual_paid_usd = dep_paid_usd + pmt_paid_usd
    
    # 总金额转USD
    if order_currency == 'USD':
        total_usd = raw_total
    else:
        total_usd = raw_total / order_usd_rmb if order_usd_rmb > 0 else 0.0
    
    # 货款剩余 (判断是否付清)
    # 若 pmt_override = 1，视为付清
    if pmt_override == 1:
        is_fully_paid = True
    else:
        balance_remaining_usd = total_usd - actual_paid_usd
        is_fully_paid = balance_remaining_usd <= 0.01
    
    # 支付比例 (未付清时使用 1.0，即实际单价 = 理论单价)
    if is_fully_paid:
        payment_ratio = actual_paid_usd / total_usd if total_usd > 0 else 1.0
    else:
        payment_ratio = 1.0
    
    # ========== Step 4: 获取额外费用（定金+货款）==========
    dep_extra_sql = """
    SELECT SUM(extra_amount) as total, extra_cur, dep_paid_cur
    FROM in_pmt_deposit_final
    WHERE po_num = :po_num
    GROUP BY extra_cur, dep_paid_cur
    """
    dep_extra_df = DBClient.read_df(dep_extra_sql, {'po_num': po_num})
    dep_extra_usd = 0.0
    for _, row in dep_extra_df.iterrows():
        extra_cur = row['extra_cur'] or 'RMB'
        dep_rate = float(row['dep_paid_cur']) if row['dep_paid_cur'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if extra_cur == 'USD':
            dep_extra_usd += total
        else:
            dep_extra_usd += total / dep_rate if dep_rate > 0 else 0.0
    
    pmt_extra_sql = """
    SELECT SUM(extra_amount) as total, pmt_currency, pmt_fe_rate
    FROM in_pmt_po_final
    WHERE po_num = :po_num
    GROUP BY pmt_currency, pmt_fe_rate
    """
    pmt_extra_df = DBClient.read_df(pmt_extra_sql, {'po_num': po_num})
    pmt_extra_usd = 0.0
    for _, row in pmt_extra_df.iterrows():
        pmt_cur = row['pmt_currency'] or 'RMB'
        pmt_rate = float(row['pmt_fe_rate']) if row['pmt_fe_rate'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if pmt_cur == 'USD':
            pmt_extra_usd += total
        else:
            pmt_extra_usd += total / pmt_rate if pmt_rate > 0 else 0.0
    
    order_extra_usd = dep_extra_usd + pmt_extra_usd
    
    # ========== Step 5: 获取该订单所有发货记录 ==========
    send_sql = """
    SELECT sent_logistic_num, po_sku, po_price, SUM(sent_quantity) as qty
    FROM in_send_final
    WHERE po_num = :po_num
    GROUP BY sent_logistic_num, po_sku, po_price
    """
    send_df = DBClient.read_df(send_sql, {'po_num': po_num})
    
    if send_df.empty:
        # 尚未发货，返回空
        return {}
    
    # ========== Step 6: 合并 delay 单到母单 ==========
    def get_parent_logistic(logistic_num):
        """从 L12345_delay_V01 或 L12345_V01 提取 L12345"""
        if '_delay_' in logistic_num or '_V' in logistic_num:
            parts = logistic_num.split('_')
            return parts[0]
        return logistic_num
    
    # 统计母单数量
    all_logistics = send_df['sent_logistic_num'].unique().tolist()
    parent_logistics_set = set()
    for log_num in all_logistics:
        parent_logistics_set.add(get_parent_logistic(log_num))
    logistics_count = len(parent_logistics_set)
    
    # 按母单分组SKU数据
    parent_sku_data = {}  # { parent_logistic: { (sku, price): qty } }
    for _, row in send_df.iterrows():
        logistic_num = row['sent_logistic_num']
        parent = get_parent_logistic(logistic_num)
        sku = row['po_sku']
        price = float(row['po_price']) if row['po_price'] else 0.0
        qty = int(row['qty']) if row['qty'] else 0
        
        if parent not in parent_sku_data:
            parent_sku_data[parent] = {}
        key = (sku, price)
        if key not in parent_sku_data[parent]:
            parent_sku_data[parent][key] = 0
        parent_sku_data[parent][key] += qty
    
    # ========== Step 7: 获取 SKU 重量 ==========
    sku_weight_sql = "SELECT SKU, Weight FROM Data_COGS"
    sku_weight_df = DBClient.read_df(sku_weight_sql)
    sku_weight_map = {}
    for _, row in sku_weight_df.iterrows():
        sku = str(row['SKU']).strip().upper() if row['SKU'] else ''
        weight_g = float(row['Weight']) if row['Weight'] else 0.0
        sku_weight_map[sku] = weight_g / 1000.0  # 转为 kg
    
    # ========== Step 8: 获取每个母单的物流信息 ==========
    parent_logistics_list = list(parent_logistics_set)
    logistics_info = {}
    
    for parent in parent_logistics_list:
        related_logistics = [log for log in all_logistics if get_parent_logistic(log) == parent]
        
        # 物流费用（只从母单获取）
        log_sql = """
        SELECT total_price, usd_rmb
        FROM in_send
        WHERE logistic_num = :logistic_num
        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        LIMIT 1
        """
        log_df = DBClient.read_df(log_sql, {'logistic_num': parent})
        
        total_price_rmb = 0.0
        send_usd_rmb = 7.0
        if not log_df.empty:
            total_price_rmb = float(log_df.iloc[0]['total_price']) if log_df.iloc[0]['total_price'] else 0.0
            send_usd_rmb = float(log_df.iloc[0]['usd_rmb']) if log_df.iloc[0]['usd_rmb'] else 7.0
        
        # 付款信息
        pmt_log_sql = """
        SELECT logistic_paid, usd_rmb, extra_paid, extra_currency
        FROM in_pmt_logistic_final
        WHERE logistic_num = :logistic_num
        """
        pmt_log_df = DBClient.read_df(pmt_log_sql, {'logistic_num': parent})
        
        is_paid = False
        pmt_usd_rmb = send_usd_rmb
        log_extra_usd = 0.0
        
        if not pmt_log_df.empty:
            row = pmt_log_df.iloc[0]
            paid = float(row['logistic_paid']) if row['logistic_paid'] else 0.0
            is_paid = paid > 0
            if is_paid:
                pmt_usd_rmb = float(row['usd_rmb']) if row['usd_rmb'] else send_usd_rmb
            
            extra_paid = float(row['extra_paid']) if row['extra_paid'] else 0.0
            extra_cur = row['extra_currency'] or 'RMB'
            if extra_cur == 'USD':
                log_extra_usd = extra_paid
            else:
                log_extra_usd = extra_paid / pmt_usd_rmb if pmt_usd_rmb > 0 else 0.0
        
        # 统计该物流单下有多少 po_num
        po_count_sql = """
        SELECT COUNT(DISTINCT po_num) as cnt
        FROM in_send_final
        WHERE sent_logistic_num IN :logistics
        """
        po_count_df = DBClient.read_df(po_count_sql, {'logistics': tuple(related_logistics)})
        po_count = int(po_count_df.iloc[0]['cnt']) if not po_count_df.empty else 1
        
        used_usd_rmb = pmt_usd_rmb if is_paid else send_usd_rmb
        
        logistics_info[parent] = {
            'total_price_rmb': total_price_rmb,
            'usd_rmb': used_usd_rmb,
            'is_paid': is_paid,
            'log_extra_usd': log_extra_usd,
            'po_count': po_count,
            'related_logistics': related_logistics
        }
    
    # ========== Step 9: 计算每个物流单下所有订单SKU的总重量 ==========
    logistics_total_weight = {}
    
    for parent in parent_logistics_list:
        related = logistics_info[parent]['related_logistics']
        
        weight_sql = """
        SELECT po_sku, SUM(sent_quantity) as qty
        FROM in_send_final
        WHERE sent_logistic_num IN :logistics
        GROUP BY po_sku
        """
        weight_df = DBClient.read_df(weight_sql, {'logistics': tuple(related)})
        
        total_weight = 0.0
        for _, row in weight_df.iterrows():
            sku = str(row['po_sku']).strip().upper() if row['po_sku'] else ''
            qty = int(row['qty']) if row['qty'] else 0
            sku_weight_kg = sku_weight_map.get(sku, 0.0)
            total_weight += sku_weight_kg * qty
        
        logistics_total_weight[parent] = total_weight
    
    # ========== Step 10: 计算每个 SKU 的 landed_price ==========
    result = {}
    
    for parent in parent_logistics_list:
        log_info = logistics_info[parent]
        
        # 费用池计算
        apportioned_order_extra_usd = order_extra_usd / logistics_count if logistics_count > 0 else 0.0
        apportioned_log_extra_usd = log_info['log_extra_usd'] / log_info['po_count'] if log_info['po_count'] > 0 else 0.0
        
        log_total_weight = logistics_total_weight.get(parent, 0.0)
        
        # 计算当前订单在该物流单的重量
        order_weight_in_log = 0.0
        sku_data = parent_sku_data.get(parent, {})
        for (sku, price), qty in sku_data.items():
            sku_weight_kg = sku_weight_map.get(sku.upper(), 0.0)
            order_weight_in_log += sku_weight_kg * qty
        
        # 按重量占比分摊物流费用
        if log_total_weight > 0:
            order_weight_ratio = order_weight_in_log / log_total_weight
        else:
            order_weight_ratio = 0.0
        
        order_log_cost_rmb = log_info['total_price_rmb'] * order_weight_ratio
        order_log_cost_usd = order_log_cost_rmb / log_info['usd_rmb'] if log_info['usd_rmb'] > 0 else 0.0
        
        fee_pool_usd = apportioned_order_extra_usd + apportioned_log_extra_usd + order_log_cost_usd
        
        # 计算每个 SKU
        for (sku, base_price), qty in sku_data.items():
            # 转 USD
            if order_currency == 'USD':
                price_usd = base_price
            else:
                price_usd = base_price / order_usd_rmb if order_usd_rmb > 0 else 0.0
            
            # 实际单价
            actual_price_usd = price_usd * payment_ratio
            
            # SKU 费用摊销
            sku_weight_kg = sku_weight_map.get(sku.upper(), 0.0)
            sku_total_weight = sku_weight_kg * qty
            
            if order_weight_in_log > 0 and qty > 0:
                weight_ratio = sku_total_weight / order_weight_in_log
                fee_apportioned_usd = (fee_pool_usd * weight_ratio) / qty
            else:
                fee_apportioned_usd = 0.0
            
            # 入库单价
            landed_price_usd = actual_price_usd + fee_apportioned_usd
            
            # 存储结果
            # 注意：使用母物流单号作为标识
            key = (parent, po_num, sku, base_price)
            result[key] = {
                'landed_price_usd': round(landed_price_usd, 4),
                'qty': qty,
                'base_price_usd': round(price_usd, 4),
                'actual_price_usd': round(actual_price_usd, 4),
                'payment_ratio': round(payment_ratio, 6),
                'fee_apportioned_usd': round(fee_apportioned_usd, 4),
            }
    
    return result


def calculate_landed_prices_for_display(po_num: str) -> dict:
    """
    计算订单下所有 SKU 的 landed_price，并返回完整的显示数据
    
    用于 flow_detail_api，返回格式与原 API 完全一致
    
    参数:
        po_num: 订单号
        
    返回:
        dict: {
            'data': [...],   # 按物流单分组的 SKU 明细
            'meta': {...},   # 订单汇总信息
        }
    """
    # ========== Step 1: 获取订单基础信息 ==========
    strategy_sql = """
    SELECT cur_currency, cur_usd_rmb
    FROM in_po_strategy
    WHERE po_num = :po_num
    ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
    LIMIT 1
    """
    strategy_df = DBClient.read_df(strategy_sql, {'po_num': po_num})
    
    if strategy_df.empty:
        return {'data': [], 'meta': {}}
    
    order_currency = strategy_df.iloc[0]['cur_currency'] or 'USD'
    order_usd_rmb = float(strategy_df.iloc[0]['cur_usd_rmb']) if strategy_df.iloc[0]['cur_usd_rmb'] else 7.0
    
    # ========== Step 2: 获取订单总金额 ==========
    raw_total_sql = """
    SELECT SUM(po_price * po_quantity) as raw_total
    FROM in_po_final
    WHERE po_num = :po_num
    """
    raw_df = DBClient.read_df(raw_total_sql, {'po_num': po_num})
    raw_total = float(raw_df.iloc[0]['raw_total']) if not raw_df.empty and raw_df.iloc[0]['raw_total'] else 0.0
    
    # ========== Step 3: 获取实际支付信息 ==========
    dep_sql = """
    SELECT SUM(dep_paid + dep_prepay_amount) as total, dep_cur, dep_paid_cur, MAX(dep_override) as dep_override
    FROM in_pmt_deposit_final
    WHERE po_num = :po_num
    GROUP BY dep_cur, dep_paid_cur
    """
    dep_df = DBClient.read_df(dep_sql, {'po_num': po_num})
    dep_paid_usd = 0.0
    dep_override = 0
    for _, row in dep_df.iterrows():
        dep_cur = row['dep_cur'] or 'RMB'
        dep_rate = float(row['dep_paid_cur']) if row['dep_paid_cur'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if dep_cur == 'USD':
            dep_paid_usd += total
        else:
            dep_paid_usd += total / dep_rate if dep_rate > 0 else 0.0
        if row['dep_override']:
            dep_override = max(dep_override, int(row['dep_override']))
    
    pmt_sql = """
    SELECT SUM(pmt_cash_amount + pmt_prepay_amount) as total, pmt_currency, pmt_fe_rate, MAX(pmt_override) as pmt_override
    FROM in_pmt_po_final
    WHERE po_num = :po_num
    GROUP BY pmt_currency, pmt_fe_rate
    """
    pmt_df = DBClient.read_df(pmt_sql, {'po_num': po_num})
    pmt_paid_usd = 0.0
    pmt_override = 0
    for _, row in pmt_df.iterrows():
        pmt_cur = row['pmt_currency'] or 'RMB'
        pmt_rate = float(row['pmt_fe_rate']) if row['pmt_fe_rate'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if pmt_cur == 'USD':
            pmt_paid_usd += total
        else:
            pmt_paid_usd += total / pmt_rate if pmt_rate > 0 else 0.0
        if row['pmt_override']:
            pmt_override = max(pmt_override, int(row['pmt_override']))
    
    actual_paid_usd = dep_paid_usd + pmt_paid_usd
    
    if order_currency == 'USD':
        total_usd = raw_total
    else:
        total_usd = raw_total / order_usd_rmb if order_usd_rmb > 0 else 0.0
    
    if pmt_override == 1:
        is_fully_paid = True
    else:
        balance_remaining_usd = total_usd - actual_paid_usd
        is_fully_paid = balance_remaining_usd <= 0.01
    
    if is_fully_paid:
        payment_ratio = actual_paid_usd / total_usd if total_usd > 0 else 1.0
    else:
        payment_ratio = 1.0
    
    # ========== Step 4: 获取额外费用 ==========
    dep_extra_sql = """
    SELECT SUM(extra_amount) as total, extra_cur, dep_paid_cur
    FROM in_pmt_deposit_final
    WHERE po_num = :po_num
    GROUP BY extra_cur, dep_paid_cur
    """
    dep_extra_df = DBClient.read_df(dep_extra_sql, {'po_num': po_num})
    dep_extra_usd = 0.0
    for _, row in dep_extra_df.iterrows():
        extra_cur = row['extra_cur'] or 'RMB'
        dep_rate = float(row['dep_paid_cur']) if row['dep_paid_cur'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if extra_cur == 'USD':
            dep_extra_usd += total
        else:
            dep_extra_usd += total / dep_rate if dep_rate > 0 else 0.0
    
    pmt_extra_sql = """
    SELECT SUM(extra_amount) as total, extra_currency, pmt_fe_rate
    FROM in_pmt_po_final
    WHERE po_num = :po_num
    GROUP BY extra_currency, pmt_fe_rate
    """
    pmt_extra_df = DBClient.read_df(pmt_extra_sql, {'po_num': po_num})
    pmt_extra_usd = 0.0
    for _, row in pmt_extra_df.iterrows():
        pmt_cur = row['extra_currency'] or 'RMB'
        pmt_rate = float(row['pmt_fe_rate']) if row['pmt_fe_rate'] else 7.0
        total = float(row['total']) if row['total'] else 0.0
        if pmt_cur == 'USD':
            pmt_extra_usd += total
        else:
            pmt_extra_usd += total / pmt_rate if pmt_rate > 0 else 0.0
    
    order_extra_usd = dep_extra_usd + pmt_extra_usd
    
    # ========== Step 5: 获取发货记录 ==========
    send_sql = """
    SELECT sent_logistic_num, po_sku, po_price, SUM(sent_quantity) as qty
    FROM in_send_final
    WHERE po_num = :po_num
    GROUP BY sent_logistic_num, po_sku, po_price
    """
    send_df = DBClient.read_df(send_sql, {'po_num': po_num})
    
    # ========== 处理未发货情况 ==========
    if send_df.empty:
        po_sku_sql = """
        SELECT po_sku, po_price, po_quantity as qty
        FROM in_po_final
        WHERE po_num = :po_num
        """
        po_sku_df = DBClient.read_df(po_sku_sql, {'po_num': po_num})
        
        if po_sku_df.empty:
            return {'data': [], 'meta': {}}
        
        skus = []
        for _, row in po_sku_df.iterrows():
            sku = row['po_sku']
            price = float(row['po_price']) if row['po_price'] else 0.0
            qty = int(row['qty']) if row['qty'] else 0
            
            if order_currency == 'USD':
                price_usd = price
            else:
                price_usd = price / order_usd_rmb if order_usd_rmb > 0 else 0.0
            
            actual_price_usd = price_usd * payment_ratio
            landed_price_usd = actual_price_usd  # 无物流费用
            
            if order_currency == 'USD':
                actual_price_display = actual_price_usd
                landed_display = landed_price_usd
            else:
                actual_price_display = actual_price_usd * order_usd_rmb
                landed_display = landed_price_usd * order_usd_rmb
            
            skus.append({
                'sku': sku,
                'qty': qty,
                'price_original': round(price, 5),
                'price_usd': round(price_usd, 5),
                'actual_price': round(actual_price_display, 5),
                'actual_price_usd': round(actual_price_usd, 5),
                'fee_apportioned': 0.0,
                'fee_apportioned_usd': 0.0,
                'landed_price': round(landed_display, 5),
                'landed_price_usd': round(landed_price_usd, 5),
                'total_usd': round(landed_price_usd * qty, 5)
            })
        
        return {
            'data': [{
                'logistic_num': 'NOT_SHIPPED',
                'currency': order_currency,
                'usd_rmb': round(order_usd_rmb, 4),
                'log_price_rmb': 0.0,
                'log_price_usd': 0.0,
                'is_paid': False,
                'skus': skus
            }],
            'meta': {
                'order_currency': order_currency,
                'order_usd_rmb': round(order_usd_rmb, 4),
                'raw_total': round(raw_total, 5),
                'raw_total_usd': round(total_usd, 5),
                'actual_paid_usd': round(actual_paid_usd, 5),
                'payment_ratio': round(payment_ratio, 6),
                'total_extra_usd': round(order_extra_usd, 5),
                'logistics_apportioned_usd': 0.0,
                'total_cost_usd': round(total_usd + order_extra_usd, 5)
            }
        }
    
    # ========== Step 6: 合并 delay 单到母单 ==========
    def get_parent_logistic(logistic_num):
        if '_delay_' in logistic_num or '_V' in logistic_num:
            parts = logistic_num.split('_')
            return parts[0]
        return logistic_num
    
    all_logistics = send_df['sent_logistic_num'].unique().tolist()
    parent_logistics_set = set()
    for log_num in all_logistics:
        parent_logistics_set.add(get_parent_logistic(log_num))
    logistics_count = len(parent_logistics_set)
    
    parent_sku_data = {}
    for _, row in send_df.iterrows():
        logistic_num = row['sent_logistic_num']
        parent = get_parent_logistic(logistic_num)
        sku = row['po_sku']
        price = float(row['po_price']) if row['po_price'] else 0.0
        qty = int(row['qty']) if row['qty'] else 0
        
        if parent not in parent_sku_data:
            parent_sku_data[parent] = {}
        key = (sku, price)
        if key not in parent_sku_data[parent]:
            parent_sku_data[parent][key] = 0
        parent_sku_data[parent][key] += qty
    
    # ========== Step 7: 获取 SKU 重量 ==========
    sku_weight_sql = "SELECT SKU, Weight FROM Data_COGS"
    sku_weight_df = DBClient.read_df(sku_weight_sql)
    sku_weight_map = {}
    for _, row in sku_weight_df.iterrows():
        sku = str(row['SKU']).strip().upper() if row['SKU'] else ''
        weight_g = float(row['Weight']) if row['Weight'] else 0.0
        sku_weight_map[sku] = weight_g / 1000.0
    
    # ========== Step 8: 获取每个母单的物流信息 ==========
    parent_logistics_list = list(parent_logistics_set)
    logistics_info = {}
    
    for parent in parent_logistics_list:
        related_logistics = [log for log in all_logistics if get_parent_logistic(log) == parent]
        
        log_sql = """
        SELECT total_price, usd_rmb
        FROM in_send
        WHERE logistic_num = :logistic_num
        ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
        LIMIT 1
        """
        log_df = DBClient.read_df(log_sql, {'logistic_num': parent})
        
        total_price_rmb = 0.0
        send_usd_rmb = 7.0
        if not log_df.empty:
            total_price_rmb = float(log_df.iloc[0]['total_price']) if log_df.iloc[0]['total_price'] else 0.0
            send_usd_rmb = float(log_df.iloc[0]['usd_rmb']) if log_df.iloc[0]['usd_rmb'] else 7.0
        
        pmt_log_sql = """
        SELECT logistic_paid, usd_rmb, extra_paid, extra_currency
        FROM in_pmt_logistic_final
        WHERE logistic_num = :logistic_num
        """
        pmt_log_df = DBClient.read_df(pmt_log_sql, {'logistic_num': parent})
        
        is_paid = False
        pmt_usd_rmb = send_usd_rmb
        log_extra_usd = 0.0
        
        if not pmt_log_df.empty:
            row = pmt_log_df.iloc[0]
            paid = float(row['logistic_paid']) if row['logistic_paid'] else 0.0
            is_paid = paid > 0
            if is_paid:
                pmt_usd_rmb = float(row['usd_rmb']) if row['usd_rmb'] else send_usd_rmb
            
            extra_paid = float(row['extra_paid']) if row['extra_paid'] else 0.0
            extra_cur = row['extra_currency'] or 'RMB'
            if extra_cur == 'USD':
                log_extra_usd = extra_paid
            else:
                log_extra_usd = extra_paid / pmt_usd_rmb if pmt_usd_rmb > 0 else 0.0
        
        po_count_sql = """
        SELECT COUNT(DISTINCT po_num) as cnt
        FROM in_send_final
        WHERE sent_logistic_num IN :logistics
        """
        po_count_df = DBClient.read_df(po_count_sql, {'logistics': tuple(related_logistics)})
        po_count = int(po_count_df.iloc[0]['cnt']) if not po_count_df.empty else 1
        
        used_usd_rmb = pmt_usd_rmb if is_paid else send_usd_rmb
        
        logistics_info[parent] = {
            'total_price_rmb': total_price_rmb,
            'usd_rmb': used_usd_rmb,
            'is_paid': is_paid,
            'log_extra_usd': log_extra_usd,
            'po_count': po_count,
            'related_logistics': related_logistics
        }
    
    # ========== Step 9: 计算总重量 ==========
    logistics_total_weight = {}
    for parent in parent_logistics_list:
        related = logistics_info[parent]['related_logistics']
        weight_sql = """
        SELECT po_sku, SUM(sent_quantity) as qty
        FROM in_send_final
        WHERE sent_logistic_num IN :logistics
        GROUP BY po_sku
        """
        weight_df = DBClient.read_df(weight_sql, {'logistics': tuple(related)})
        total_weight = 0.0
        for _, row in weight_df.iterrows():
            sku = str(row['po_sku']).strip().upper() if row['po_sku'] else ''
            qty = int(row['qty']) if row['qty'] else 0
            sku_weight_kg = sku_weight_map.get(sku, 0.0)
            total_weight += sku_weight_kg * qty
        logistics_total_weight[parent] = total_weight
    
    # ========== Step 10: 构建返回数据 ==========
    result = []
    total_logistics_apportioned_usd = 0.0
    
    for parent in sorted(parent_logistics_list, reverse=True):
        log_info = logistics_info[parent]
        
        apportioned_order_extra_usd = order_extra_usd / logistics_count if logistics_count > 0 else 0.0
        apportioned_log_extra_usd = log_info['log_extra_usd'] / log_info['po_count'] if log_info['po_count'] > 0 else 0.0
        
        log_total_weight = logistics_total_weight.get(parent, 0.0)
        
        order_weight_in_log = 0.0
        sku_data = parent_sku_data.get(parent, {})
        for (sku, price), qty in sku_data.items():
            sku_weight_kg = sku_weight_map.get(sku.upper(), 0.0)
            order_weight_in_log += sku_weight_kg * qty
        
        if log_total_weight > 0:
            order_weight_ratio = order_weight_in_log / log_total_weight
        else:
            order_weight_ratio = 0.0
        
        order_log_cost_rmb = log_info['total_price_rmb'] * order_weight_ratio
        order_log_cost_usd = order_log_cost_rmb / log_info['usd_rmb'] if log_info['usd_rmb'] > 0 else 0.0
        
        total_logistics_apportioned_usd += order_log_cost_usd
        
        fee_pool_usd = apportioned_order_extra_usd + apportioned_log_extra_usd + order_log_cost_usd
        
        skus = []
        for (sku, base_price), qty in sku_data.items():
            if order_currency == 'USD':
                price_usd = base_price
            else:
                price_usd = base_price / order_usd_rmb if order_usd_rmb > 0 else 0.0
            
            actual_price_usd = price_usd * payment_ratio
            
            sku_weight_kg = sku_weight_map.get(sku.upper(), 0.0)
            sku_total_weight = sku_weight_kg * qty
            
            if order_weight_in_log > 0 and qty > 0:
                weight_ratio = sku_total_weight / order_weight_in_log
                fee_apportioned_usd = (fee_pool_usd * weight_ratio) / qty
            else:
                fee_apportioned_usd = 0.0
            
            landed_price_usd = actual_price_usd + fee_apportioned_usd
            total_value_usd = landed_price_usd * qty
            
            if order_currency == 'USD':
                actual_price_display = actual_price_usd
                fee_display = fee_apportioned_usd
                landed_display = landed_price_usd
            else:
                actual_price_display = actual_price_usd * order_usd_rmb
                fee_display = fee_apportioned_usd * order_usd_rmb
                landed_display = landed_price_usd * order_usd_rmb
            
            skus.append({
                'sku': sku,
                'qty': qty,
                'price_original': round(base_price, 5),
                'price_usd': round(price_usd, 5),
                'actual_price': round(actual_price_display, 5),
                'actual_price_usd': round(actual_price_usd, 5),
                'fee_apportioned': round(fee_display, 5),
                'fee_apportioned_usd': round(fee_apportioned_usd, 5),
                'landed_price': round(landed_display, 5),
                'landed_price_usd': round(landed_price_usd, 5),
                'total_usd': round(total_value_usd, 5)
            })
        
        result.append({
            'logistic_num': parent,
            'currency': order_currency,
            'usd_rmb': round(order_usd_rmb, 4),
            'log_price_rmb': round(order_log_cost_rmb, 5),
            'log_price_usd': round(order_log_cost_usd, 5),
            'is_paid': log_info['is_paid'],
            'skus': skus
        })
    
    # ========== Step 11: 处理未发货的 SKU ==========
    order_sku_sql = """
    SELECT po_sku, po_price, po_quantity as qty
    FROM in_po_final
    WHERE po_num = :po_num
    """
    order_sku_df = DBClient.read_df(order_sku_sql, {'po_num': po_num})
    
    shipped_qty_map = {}  # { (sku, price): shipped_qty }
    for _, row in send_df.iterrows():
        sku = row['po_sku']
        price = float(row['po_price']) if row['po_price'] else 0.0
        qty = int(row['qty']) if row['qty'] else 0
        key = (sku, price)
        if key not in shipped_qty_map:
            shipped_qty_map[key] = 0
        shipped_qty_map[key] += qty
    
    unshipped_skus = []
    for _, row in order_sku_df.iterrows():
        sku = row['po_sku']
        price = float(row['po_price']) if row['po_price'] else 0.0
        ordered_qty = int(row['qty']) if row['qty'] else 0
        
        key = (sku, price)
        shipped_qty = shipped_qty_map.get(key, 0)
        unshipped_qty = ordered_qty - shipped_qty
        
        if unshipped_qty > 0:
            if order_currency == 'USD':
                price_usd = price
            else:
                price_usd = price / order_usd_rmb if order_usd_rmb > 0 else 0.0
            
            actual_price_usd = price_usd * payment_ratio
            landed_price_usd = actual_price_usd
            total_value_usd = landed_price_usd * unshipped_qty
            
            if order_currency == 'USD':
                actual_price_display = actual_price_usd
                landed_display = landed_price_usd
            else:
                actual_price_display = actual_price_usd * order_usd_rmb
                landed_display = landed_price_usd * order_usd_rmb
            
            unshipped_skus.append({
                'sku': sku,
                'qty': unshipped_qty,
                'price_original': round(price, 5),
                'price_usd': round(price_usd, 5),
                'actual_price': round(actual_price_display, 5),
                'actual_price_usd': round(actual_price_usd, 5),
                'fee_apportioned': 0.0,
                'fee_apportioned_usd': 0.0,
                'landed_price': round(landed_display, 5),
                'landed_price_usd': round(landed_price_usd, 5),
                'total_usd': round(total_value_usd, 5)
            })
    
    if unshipped_skus:
        result.append({
            'logistic_num': 'NOT_SHIPPED',
            'currency': order_currency,
            'usd_rmb': round(order_usd_rmb, 4),
            'log_price_rmb': 0.0,
            'log_price_usd': 0.0,
            'is_paid': False,
            'skus': unshipped_skus
        })
    
    if is_fully_paid:
        base_cost_usd = actual_paid_usd
    else:
        base_cost_usd = total_usd
    
    total_cost_usd = base_cost_usd + order_extra_usd + total_logistics_apportioned_usd
    
    return {
        'data': result,
        'meta': {
            'order_currency': order_currency,
            'order_usd_rmb': round(order_usd_rmb, 4),
            'raw_total': round(raw_total, 5),
            'raw_total_usd': round(total_usd, 5),
            'actual_paid_usd': round(actual_paid_usd, 5),
            'payment_ratio': round(payment_ratio, 6),
            'total_extra_usd': round(order_extra_usd, 5),
            'logistics_apportioned_usd': round(total_logistics_apportioned_usd, 5),
            'total_cost_usd': round(total_cost_usd, 5)
        }
    }


def create_landed_price_records(logistic_num: str) -> int:
    """
    入库时创建价格记录和 FIFO 层
    
    1. 从 in_receive_final 获取入库的 SKU 列表
    2. 对每个 po_num 调用 calculate_landed_prices
    3. INSERT in_dynamic_landed_price
    4. INSERT in_dynamic_tran (入库交易)
    5. INSERT in_dynamic_fifo_layers (FIFO 层)
    
    参数:
        logistic_num: 物流单号
        
    返回:
        int: 创建的记录数
    """
    # 获取该物流单下所有入库记录
    receive_sql = """
    SELECT 
        logistic_num, po_num, po_sku, receive_quantity, receive_date, po_price
    FROM in_receive_final
    WHERE logistic_num = :logistic_num
    """
    receive_df = DBClient.read_df(receive_sql, {'logistic_num': logistic_num})
    
    if receive_df.empty:
        return 0
    
    created_count = 0
    po_nums = receive_df['po_num'].unique().tolist()
    
    # 先计算所有相关订单的 landed_price
    landed_prices_map = {}
    for po_num in po_nums:
        prices = calculate_landed_prices(po_num)
        landed_prices_map[po_num] = prices
    
    # 处理每条入库记录
    for _, rec in receive_df.iterrows():
        log_num = rec['logistic_num']
        po_num = rec['po_num']
        sku = rec['po_sku']
        qty = int(rec['receive_quantity'])
        receive_date = str(rec['receive_date']) if rec['receive_date'] else None
        po_price = float(rec['po_price']) if rec['po_price'] else 0.0
        
        if qty <= 0:
            continue
        
        # 查找对应的 landed_price
        prices = landed_prices_map.get(po_num, {})
        landed_price_usd = po_price  # 默认使用订单价格
        
        # 在 prices 中查找匹配的记录
        for (p_log, p_po, p_sku, p_base), price_data in prices.items():
            if p_log == log_num and p_po == po_num and p_sku == sku:
                landed_price_usd = price_data['landed_price_usd']
                break
        
        # ========== 1. 创建 in_dynamic_tran 记录 ==========
        # 检查是否已存在
        existing_tran = DBClient.read_df("""
            SELECT record_id FROM in_dynamic_tran
            WHERE po_num = :po_num AND sku = :sku AND action = 'in'
              AND note LIKE :note_pattern
        """, {'po_num': po_num, 'sku': sku, 'note_pattern': f'%{log_num}%'})
        
        if existing_tran.empty:
            # 插入交易记录
            DBClient.execute_stmt("""
                INSERT INTO in_dynamic_tran
                (date_record, po_num, sku, price, quantity, action, type, note)
                VALUES
                (:date_record, :po_num, :sku, :price, :quantity, 'in', 'receive', :note)
            """, {
                'date_record': receive_date,
                'po_num': po_num,
                'sku': sku,
                'price': landed_price_usd,
                'quantity': qty,
                'note': f'入库_{log_num}'
            })
            
            # 获取刚插入的 record_id
            record_id_df = DBClient.read_df("""
                SELECT record_id FROM in_dynamic_tran
                WHERE po_num = :po_num AND sku = :sku AND action = 'in'
                  AND note = :note
                ORDER BY record_id DESC LIMIT 1
            """, {'po_num': po_num, 'sku': sku, 'note': f'入库_{log_num}'})
            
            in_record_id = int(record_id_df.iloc[0]['record_id']) if not record_id_df.empty else None
            
            # ========== 2. 创建 in_dynamic_fifo_layers 记录 ==========
            if in_record_id:
                DBClient.execute_stmt("""
                    INSERT INTO in_dynamic_fifo_layers
                    (sku, in_record_id, in_date, po_num, unit_cost, qty_in, qty_remaining)
                    VALUES
                    (:sku, :in_record_id, :in_date, :po_num, :unit_cost, :qty_in, :qty_remaining)
                """, {
                    'sku': sku,
                    'in_record_id': in_record_id,
                    'in_date': receive_date,
                    'po_num': po_num,
                    'unit_cost': landed_price_usd,
                    'qty_in': qty,
                    'qty_remaining': qty
                })
        else:
            in_record_id = None
        
        # ========== 3. 创建 in_dynamic_landed_price 记录 ==========
        existing_price = DBClient.read_df("""
            SELECT id FROM in_dynamic_landed_price
            WHERE logistic_num = :logistic_num
              AND po_num = :po_num
              AND sku = :sku
        """, {'logistic_num': log_num, 'po_num': po_num, 'sku': sku})
        
        if existing_price.empty:
            DBClient.execute_stmt("""
                INSERT INTO in_dynamic_landed_price
                (in_record_id, logistic_num, po_num, sku, qty, landed_price_usd)
                VALUES
                (:in_record_id, :logistic_num, :po_num, :sku, :qty, :landed_price_usd)
            """, {
                'in_record_id': in_record_id,
                'logistic_num': log_num,
                'po_num': po_num,
                'sku': sku,
                'qty': qty,
                'landed_price_usd': landed_price_usd
            })
            
            created_count += 1
    
    logger.info(f"create_landed_price_records({logistic_num}): 创建 {created_count} 条记录")
    return created_count




def recalculate_landed_prices(po_num: str = None, logistic_num: str = None) -> int:
    """
    付款变动时重新计算并更新价格表
    
    参数:
        po_num: 订单号（定金/货款变动时传入）
        logistic_num: 物流单号（物流付款变动时传入）
        
    返回:
        int: 更新的记录数
    """
    if not po_num and not logistic_num:
        logger.warning("recalculate_landed_prices: 必须提供 po_num 或 logistic_num")
        return 0
    
    # 确定受影响的 po_num 列表
    po_nums = []
    
    if po_num:
        po_nums.append(po_num)
    
    if logistic_num:
        # 获取父物流单
        def get_parent_logistic(log_num):
            if '_delay_' in log_num or '_V' in log_num:
                parts = log_num.split('_')
                return parts[0]
            return log_num
        
        parent = get_parent_logistic(logistic_num)
        
        # 获取该物流单（含子单）下所有 po_num
        affected_sql = """
        SELECT DISTINCT po_num
        FROM in_send_final
        WHERE sent_logistic_num = :logistic_num
           OR sent_logistic_num LIKE :pattern
        """
        affected_df = DBClient.read_df(affected_sql, {
            'logistic_num': parent,
            'pattern': f"{parent}_%"
        })
        
        for _, row in affected_df.iterrows():
            if row['po_num'] not in po_nums:
                po_nums.append(row['po_num'])
    
    updated_count = 0
    
    for pn in po_nums:
        # 重新计算
        prices = calculate_landed_prices(pn)
        
        # 更新价格表
        for (log_num, pnum, sku, base_price), price_data in prices.items():
            result = DBClient.execute_stmt("""
                UPDATE in_dynamic_landed_price
                SET qty = :qty,
                    landed_price_usd = :landed_price_usd,
                    updated_at = NOW()
                WHERE logistic_num = :logistic_num
                  AND po_num = :po_num
                  AND sku = :sku
            """, {
                'qty': price_data['qty'],
                'landed_price_usd': price_data['landed_price_usd'],
                'logistic_num': log_num,
                'po_num': pnum,
                'sku': sku
            })
            
            if result:
                updated_count += 1
    
    logger.info(f"recalculate_landed_prices: 更新了 {updated_count} 条记录")
    return updated_count
