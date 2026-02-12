"""
订单管理 - 共享工具函数
"""
from core.components.db.client import DBClient
from django.utils.translation import gettext as _


def check_po_shipping_status(po_num: str) -> tuple:
    """
    检查订单的发货状态
    
    返回: (can_modify, shipping_status, message)
    - can_modify: bool - 是否允许修改/删除
    - shipping_status: str - 'not_shipped' | 'partially_shipped' | 'fully_shipped'
    - message: str - 状态描述
    """
    # 获取订单在in_po_final中的数据
    po_final_df = DBClient.read_df("""
        SELECT po_num, po_sku, po_quantity, po_price
        FROM in_po_final
        WHERE po_num = :po_num
    """, {'po_num': po_num})
    
    if po_final_df.empty:
        return True, 'not_shipped', _('未发货')
    
    # 获取该订单的发货数据（按sku和price聚合）
    send_final_df = DBClient.read_df("""
        SELECT po_num, po_sku, po_price, SUM(sent_quantity) as total_sent
        FROM in_send_final
        WHERE po_num = :po_num
        GROUP BY po_num, po_sku, po_price
    """, {'po_num': po_num})
    
    # 构建发货量字典 {(po_sku, po_price): total_sent}
    send_map = {}
    if not send_final_df.empty:
        for _idx, row in send_final_df.iterrows():
            key = (row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            send_map[key] = int(row['total_sent']) if row['total_sent'] else 0
    
    total_ordered = 0  # 总订货量
    total_diff = 0     # 差值总和 (订货量 - 已发量)
    
    for _idx, item in po_final_df.iterrows():
        sku = item['po_sku']
        qty = int(item['po_quantity']) if item['po_quantity'] else 0
        price = float(item['po_price']) if item['po_price'] else 0
        
        total_ordered += qty
        
        # 查找对应的发货量
        key = (sku, price)
        sent_qty = send_map.get(key, 0)
        
        diff = qty - sent_qty
        total_diff += diff
    
    if total_ordered == 0:
        return True, 'not_shipped', _('未发货')
    elif total_diff == 0:
        # 全部已发货 - 不允许修改/删除
        return False, 'fully_shipped', _('该订单已全部发货完成，无法修改或删除')
    elif total_diff == total_ordered:
        # 完全未发货 - 允许修改/删除
        return True, 'not_shipped', _('未发货')
    else:
        # 部分已发货 - 不允许修改/删除
        shipped_qty = total_ordered - total_diff
        return False, 'partially_shipped', _('该订单已部分发货（已发{qty}件），无法修改或删除').format(qty=shipped_qty)
