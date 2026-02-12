"""
新建发货单 - 可用性检查

[P0-2 Fix] 统一使用 hub.check_perm
[P1-2 Fix] 使用 logging 替代 traceback.print_exc
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ..hub import check_perm
from core.components.db.client import DBClient


from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def check_send_availability_api(request):
    """
    检查是否有可发货的订单
    Permission: module.purchase.send.add
    
    返回:
        {
            success: true,
            can_send: true/false,
            error_type: null | 'no_orders' | 'all_shipped',
            message: string
        }
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        # 检查 in_po_final 表是否有数据
        po_count_df = DBClient.read_df("SELECT COUNT(*) as cnt FROM in_po_final")
        po_count = po_count_df['cnt'].iloc[0] if not po_count_df.empty else 0
        
        if po_count == 0:
            return JsonResponse({
                'success': True,
                'can_send': False,
                'error_type': 'no_orders',
                'message': _('无有效订单，请先新增订单后才能发货')
            })
        
        # 读取 in_po_final 表数据
        po_final_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_quantity
            FROM in_po_final
        """)
        
        # 读取 in_send_final 表数据
        send_final_df = DBClient.read_df("""
            SELECT po_num, po_sku, SUM(sent_quantity) as sent_quantity
            FROM in_send_final
            GROUP BY po_num, po_sku
        """)
        
        # 创建 sent 数据的字典
        sent_dict = {}
        if not send_final_df.empty:
            for _idx, row in send_final_df.iterrows():
                key = (row['po_num'], row['po_sku'])
                sent_dict[key] = int(row['sent_quantity']) if row['sent_quantity'] else 0
        
        # 检查是否有未发货的订单
        has_remaining = False
        for _idx, po_row in po_final_df.iterrows():
            po_num = po_row['po_num']
            po_sku = po_row['po_sku']
            po_quantity = int(po_row['po_quantity']) if po_row['po_quantity'] else 0
            
            key = (po_num, po_sku)
            sent_quantity = sent_dict.get(key, 0)
            remaining = po_quantity - sent_quantity
            
            if remaining > 0:
                has_remaining = True
                break
        
        if not has_remaining:
            return JsonResponse({
                'success': True,
                'can_send': False,
                'error_type': 'all_shipped',
                'message': _('当前订单已全部发货，请新增订单后才能继续发货')
            })
        
        return JsonResponse({
            'success': True,
            'can_send': True,
            'error_type': None,
            'message': ''
        })
        
    except Exception as e:
        logger.exception("检查发货可用性失败")
        return JsonResponse({'success': False, 'message': _('检查失败: %(error)s') % {'error': str(e)}}, status=500)

