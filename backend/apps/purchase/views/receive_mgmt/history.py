"""
入库管理 - 历史修订记录
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ..hub import check_perm
from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


from django.utils.translation import gettext as _
import json

@login_required(login_url='web_ui:login')
@require_GET
def get_receive_history_api(request):
    """
    获取入库单历史修订记录
    URL: /dashboard/purchase/api/receive_mgmt/history/?logistic_num=xxx
    
    返回入库修订记录（in_receive）和差异修订记录（in_diff）的版本历史
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
    
    try:
        # ========== 1. 入库修订记录（in_receive表） ==========
        receive_df = DBClient.read_df("""
            SELECT seq, receive_date, update_date, `by`, note, 
                   po_num, po_sku, po_price, sent_quantity, receive_quantity, action
            FROM in_receive 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED), po_num, po_sku, po_price
        """, {'logistic_num': logistic_num})
        
        # 按seq分组
        seq_groups = {}
        for _idx, row in receive_df.iterrows():
            seq = row['seq']
            if seq not in seq_groups:
                seq_groups[seq] = {
                    'seq': seq,
                    'receive_date': str(row['receive_date']) if row['receive_date'] else '-',
                    'update_date': str(row['update_date']) if row['update_date'] else '-',
                    'by': row['by'] or '',
                    'note': row.get('note') or '',
                    'items': []
                }
            seq_groups[seq]['items'].append({
                'po_num': row['po_num'] or '',
                'po_sku': row['po_sku'] or '',
                'po_price': float(row['po_price']) if row['po_price'] else 0,
                'sent_qty': int(row['sent_quantity']) if row['sent_quantity'] else 0,
                'receive_qty': int(row['receive_quantity']) if row['receive_quantity'] else 0,
                'action': row['action'] or ''
            })
        
        # 按seq排序
        sorted_seqs = sorted(seq_groups.keys(), key=lambda x: int(x.replace('V', '').replace('R', '')) if x[0] in ['V', 'R'] else 999)
        
        receive_versions = []
        prev_items_state = {}  # {(po_num, po_sku, po_price): receive_qty}
        
        for seq_idx, seq in enumerate(sorted_seqs):
            group = seq_groups[seq]
            is_initial = seq_idx == 0  # 第一条就是初始版本
            changes = []
            
            for item in group['items']:
                action = item['action']
                key = (item['po_num'], item['po_sku'], item['po_price'])
                
                if is_initial and action == 'new':
                    # 初始数据
                    prev_items_state[key] = item['receive_qty']
                
                elif action == 'adjust' and not is_initial:
                    # 调整
                    old_qty = prev_items_state.get(key, 0)
                    if old_qty != item['receive_qty']:
                        changes.append({
                            'type': 'adjust',
                            'po_num': item['po_num'],
                            'po_sku': item['po_sku'],
                            'po_price': item['po_price'],
                            'fields': [{'field': _('入库数量'), 'old': old_qty, 'new': item['receive_qty']}]
                        })
                    prev_items_state[key] = item['receive_qty']
            
            receive_versions.append({
                'seq': seq,
                'receive_date': group['receive_date'],
                'update_date': group['update_date'],
                'by': group['by'],
                'note': group['note'],
                'is_initial': is_initial,
                'changes': changes,
                'items': group['items'] if is_initial else []
            })
        
        # ========== 2. 差异修订记录（in_diff表） ==========
        diff_df = DBClient.read_df("""
            SELECT seq, receive_date, `by`, note, 
                   po_num, po_sku, po_quantity, sent_quantity, receive_quantity, diff_quantity, status, action
            FROM in_diff 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED), po_num, po_sku
        """, {'logistic_num': logistic_num})
        
        # 按seq分组
        diff_seq_groups = {}
        for _idx, row in diff_df.iterrows():
            seq = row['seq']
            if seq not in diff_seq_groups:
                diff_seq_groups[seq] = {
                    'seq': seq,
                    'receive_date': str(row['receive_date']) if row['receive_date'] else '-',
                    'by': row['by'] or '',
                    'note': row.get('note') or '',
                    'items': []
                }
            diff_seq_groups[seq]['items'].append({
                'po_num': row['po_num'] or '',
                'po_sku': row['po_sku'] or '',
                'po_qty': int(row['po_quantity']) if row['po_quantity'] else 0,
                'sent_qty': int(row['sent_quantity']) if row['sent_quantity'] else 0,
                'receive_qty': int(row['receive_quantity']) if row['receive_quantity'] else 0,
                'diff_qty': int(row['diff_quantity']) if row['diff_quantity'] else 0,
                'status': row['status'] or '',
                'action': row['action'] or ''
            })
        
        # 按seq排序
        sorted_diff_seqs = sorted(diff_seq_groups.keys(), key=lambda x: int(x.replace('D', '')) if x.startswith('D') else 999)
        
        diff_versions = []
        prev_diff_state = {}  # {(po_num, po_sku): diff_qty}
        
        for seq_idx, seq in enumerate(sorted_diff_seqs):
            group = diff_seq_groups[seq]
            is_initial = seq_idx == 0
            changes = []
            
            for item in group['items']:
                action = item['action']
                key = (item['po_num'], item['po_sku'])
                
                if is_initial and action == 'new':
                    # 初始差异
                    prev_diff_state[key] = item['diff_qty']
                
                elif action == 'adjust' and not is_initial:
                    # 差异调整
                    old_diff = prev_diff_state.get(key, 0)
                    if old_diff != item['diff_qty']:
                        changes.append({
                            'type': 'adjust',
                            'po_num': item['po_num'],
                            'po_sku': item['po_sku'],
                            'fields': [
                                {'field': _('差异数量'), 'old': old_diff, 'new': item['diff_qty']},
                                {'field': _('入库数量'), 'old': '-', 'new': item['receive_qty']}
                            ]
                        })
                    prev_diff_state[key] = item['diff_qty']
            
            diff_versions.append({
                'seq': seq,
                'receive_date': group['receive_date'],
                'by': group['by'],
                'note': group['note'],
                'is_initial': is_initial,
                'changes': changes,
                'items': group['items'] if is_initial else []
            })
        
        return JsonResponse({
            'success': True,
            'data': {
                'logistic_num': logistic_num,
                'receive_versions': receive_versions,
                'diff_versions': diff_versions
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取历史记录失败: {error}').format(error=str(e))
        }, status=500)
