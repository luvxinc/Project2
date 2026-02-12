"""
发货单管理 - 货物明细修改API - 工具函数

[P0-1 拆分] 从 edit_items.py 提取的工具函数
"""
import logging

from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


def get_fully_shipped_po_nums():
    """
    获取所有已完全发货的订单号
    逻辑：in_po_final中的订货量 - in_send_final中的已发量 = 0
    """
    # 获取所有订单的订货量
    po_df = DBClient.read_df("""
        SELECT po_num, po_sku, po_price, po_quantity
        FROM in_po_final
    """)
    
    if po_df.empty:
        return set()
    
    # 获取所有发货量
    send_df = DBClient.read_df("""
        SELECT po_num, po_sku, po_price, SUM(sent_quantity) as total_sent
        FROM in_send_final
        GROUP BY po_num, po_sku, po_price
    """)
    
    # 构建发货映射
    send_map = {}
    if not send_df.empty:
        for _, row in send_df.iterrows():
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            send_map[key] = int(row['total_sent']) if row['total_sent'] else 0
    
    # 计算每个订单的差值总和
    po_diff_map = {}  # {po_num: total_diff}
    
    for _, item in po_df.iterrows():
        po_num = item['po_num']
        sku = item['po_sku']
        qty = int(item['po_quantity']) if item['po_quantity'] else 0
        price = float(item['po_price']) if item['po_price'] else 0
        
        key = (po_num, sku, price)
        sent_qty = send_map.get(key, 0)
        diff = qty - sent_qty
        
        if po_num not in po_diff_map:
            po_diff_map[po_num] = 0
        po_diff_map[po_num] += diff
    
    # 差值为0的订单表示已全部发货
    fully_shipped = {po_num for po_num, diff in po_diff_map.items() if diff == 0}
    return fully_shipped


def get_item_diff(po_num, po_sku, po_price):
    """
    获取单个item的差值（未发量）
    返回: {ordered_qty, sent_qty, diff}
    """
    # 订货量
    ordered_df = DBClient.read_df("""
        SELECT po_quantity
        FROM in_po_final
        WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
    """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
    
    ordered_qty = 0
    if not ordered_df.empty:
        ordered_qty = int(ordered_df.iloc[0]['po_quantity']) if ordered_df.iloc[0]['po_quantity'] else 0
    
    # 已发量
    sent_df = DBClient.read_df("""
        SELECT SUM(sent_quantity) as total_sent
        FROM in_send_final
        WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
    """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
    
    sent_qty = 0
    if not sent_df.empty and sent_df.iloc[0]['total_sent']:
        sent_qty = int(sent_df.iloc[0]['total_sent'])
    
    return {
        'ordered_qty': ordered_qty,
        'sent_qty': sent_qty,
        'diff': ordered_qty - sent_qty
    }
