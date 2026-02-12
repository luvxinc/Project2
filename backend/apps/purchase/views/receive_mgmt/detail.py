"""
入库管理 - 详情查询API

[P0-2 Fix] 统一使用 hub.check_perm
[P1-2 Fix] 使用 logging 替代 traceback.print_exc
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from django.utils.translation import gettext as _

from ..hub import check_perm
from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def receive_detail_api(request):
    """
    获取入库单详情
    URL: /dashboard/purchase/api/receive_mgmt/detail/
    Permission: module.purchase.receive.mgmt
    
    GET参数:
        logistic_num: 物流单号
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '')
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号参数')}, status=400)
    
    try:
        # 1. 获取 in_receive_final 基础信息
        receive_df = DBClient.read_df("""
            SELECT 
                logistic_num,
                receive_date,
                eta_date_final,
                update_date,
                seq,
                note,
                `by`,
                CAST(REGEXP_REPLACE(seq, '[^0-9]', '') AS UNSIGNED) as seq_num
            FROM in_receive_final
            WHERE logistic_num = :logistic_num
            ORDER BY seq_num DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if receive_df.empty:
            return JsonResponse({'success': False, 'message': _('入库单不存在')}, status=404)
        
        receive_row = receive_df.iloc[0]
        receive_date = str(receive_row['receive_date']) if receive_row['receive_date'] else '-'
        eta_date_final = str(receive_row['eta_date_final']) if receive_row['eta_date_final'] else '-'
        receive_seq = receive_row['seq'] or 'V01'
        receive_update_date = str(receive_row['update_date']) if receive_row['update_date'] else '-'
        receive_note = receive_row['note'] or '-'
        receive_by = receive_row['by'] or '-'
        
        # 2. 获取托盘数 (从 in_send 表)
        pallets_df = DBClient.read_df("""
            SELECT 
                pallets,
                seq,
                CAST(REGEXP_REPLACE(seq, '[^0-9]', '') AS UNSIGNED) as seq_num
            FROM in_send
            WHERE logistic_num = :logistic_num
            ORDER BY seq_num DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        pallets = int(pallets_df.iloc[0]['pallets']) if not pallets_df.empty and pallets_df.iloc[0]['pallets'] else 0
        
        # 3. 获取物流单明细版本信息 (从 in_send_final 表)
        send_final_df = DBClient.read_df("""
            SELECT 
                sent_seq,
                sent_by,
                sent_update_date,
                sent_note,
                CAST(REGEXP_REPLACE(sent_seq, '[^0-9]', '') AS UNSIGNED) as seq_num
            FROM in_send_final
            WHERE sent_logistic_num = :logistic_num
            ORDER BY seq_num DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if not send_final_df.empty:
            send_row = send_final_df.iloc[0]
            send_seq = send_row['sent_seq'] or 'L01'
            send_by = send_row['sent_by'] or '-'
            send_update_date = str(send_row['sent_update_date']) if send_row['sent_update_date'] else '-'
            send_note = send_row['sent_note'] or '-'
        else:
            send_seq = '-'
            send_by = '-'
            send_update_date = '-'
            send_note = '-'
        
        # 4. 计算入库状态
        # 获取发货数据
        send_df = DBClient.read_df("""
            SELECT 
                po_num,
                po_sku,
                po_price,
                sent_quantity
            FROM in_send_final
            WHERE sent_logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        
        # 构建发货 map
        send_map = {}
        for _idx, row in send_df.iterrows():
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            send_map[key] = send_map.get(key, 0) + (int(row['sent_quantity']) if row['sent_quantity'] else 0)
        
        # 获取入库数据
        receive_detail_df = DBClient.read_df("""
            SELECT 
                po_num,
                po_sku,
                po_price,
                receive_quantity
            FROM in_receive_final
            WHERE logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        
        # 构建入库 map
        receive_detail_map = {}
        for _idx, row in receive_detail_df.iterrows():
            key = (row['po_num'], row['po_sku'], float(row['po_price']) if row['po_price'] else 0)
            receive_detail_map[key] = receive_detail_map.get(key, 0) + (int(row['receive_quantity']) if row['receive_quantity'] else 0)
        
        # 计算状态
        all_match = True
        for key, sent_qty in send_map.items():
            receive_qty = receive_detail_map.get(key, 0)
            if sent_qty != receive_qty:
                all_match = False
                break
        
        if all_match:
            receive_status = _('全部已入库')
        else:
            # 检查差异状态 - 使用 in_diff_final 判断（终态表反映异常处理结果）
            diff_df = DBClient.read_df("""
                SELECT diff_quantity
                FROM in_diff_final
                WHERE logistic_num = :logistic_num
            """, {'logistic_num': logistic_num})
            
            if diff_df.empty:
                receive_status = _('入库有差异:未解决')
            elif all(dq == 0 for dq in diff_df['diff_quantity'].tolist()):
                receive_status = _('入库有差异:已解决')
            else:
                receive_status = _('入库有差异:未解决')
        
        # 5. 构建货物列表 (按 po_num, po_sku 聚合)
        items = []
        # 获取所有唯一的 (po_num, po_sku) 组合
        items_df = DBClient.read_df("""
            SELECT DISTINCT po_num, po_sku
            FROM in_receive_final
            WHERE logistic_num = :logistic_num
            ORDER BY po_num, po_sku
        """, {'logistic_num': logistic_num})
        
        for _idx, row in items_df.iterrows():
            po_num = row['po_num']
            po_sku = row['po_sku']
            
            # 发货数量 (从 in_send_final 聚合)
            sent_qty = 0
            for key, qty in send_map.items():
                if key[0] == po_num and key[1] == po_sku:
                    sent_qty += qty
            
            # 入库数量 (从 in_receive_final 聚合)
            receive_qty = 0
            for key, qty in receive_detail_map.items():
                if key[0] == po_num and key[1] == po_sku:
                    receive_qty += qty
            
            # 差异
            diff = sent_qty - receive_qty
            if diff == 0:
                item_status = 'normal'
            elif diff > 0:
                item_status = 'deficit'  # 少收
            else:
                item_status = 'excess'   # 超收
            
            items.append({
                'po_num': po_num,
                'po_sku': po_sku,
                'sent_quantity': sent_qty,
                'receive_quantity': receive_qty,
                'diff': diff,
                'status': item_status
            })
        
        # 6. 构建返回数据
        return JsonResponse({
            'success': True,
            'data': {
                'logistics': {
                    'logistic_num': logistic_num,
                    'receive_date': receive_date,
                    'eta_date_final': eta_date_final,
                    'pallets': pallets,
                    'receive_status': receive_status
                },
                'detail': {
                    'send_seq': send_seq,
                    'send_by': send_by,
                    'send_update_date': send_update_date,
                    'send_note': send_note,
                    'receive_seq': receive_seq,
                    'receive_by': receive_by,
                    'receive_update_date': receive_update_date,
                    'receive_note': receive_note,
                    'items': items
                }
            }
        })
        
    except Exception as e:
        logger.exception("获取入库单详情失败")
        return JsonResponse({
            'success': False,
            'message': _('获取入库单详情失败: {error}').format(error=str(e))
        }, status=500)

