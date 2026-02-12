"""
发货单管理 - 历史修订记录
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
def get_send_history_api(request):
    """
    获取发货单历史修订记录
    URL: /dashboard/purchase/api/send_mgmt/history/?logistic_num=xxx
    
    返回物流单信息（in_send）和货物修订（in_send_list）的版本历史
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
    
    try:
        # ========== 1. 物流单信息修订记录（in_send表） ==========
        send_df = DBClient.read_df("""
            SELECT seq, date_record, date_sent, date_eta, pallets, total_weight, 
                   price_kg, total_price, usd_rmb, mode, `by`, note
            FROM in_send 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED)
        """, {'logistic_num': logistic_num})
        
        strategy_versions = []
        prev_send = None
        first_seq = None  # 保存第一条的seq
        
        for idx, row in enumerate(send_df.iterrows()):
            _, row = row  # iterrows返回的是(index, row)元组
            if first_seq is None:
                first_seq = row['seq']
            
            current = {
                'seq': row['seq'],
                'date': str(row['date_record']) if row['date_record'] else '-',
                'by': row['by'] or '',
                'note': row.get('note') or '',
                'date_sent': str(row['date_sent']) if row['date_sent'] else '-',
                'date_eta': str(row['date_eta']) if row['date_eta'] else '-',
                'pallets': int(row['pallets']) if row['pallets'] else 0,
                'total_weight': float(row['total_weight']) if row['total_weight'] else 0,
                'price_kg': float(row['price_kg']) if row['price_kg'] else 0,
                'total_price': float(row['total_price']) if row['total_price'] else 0,
                'usd_rmb': float(row['usd_rmb']) if row['usd_rmb'] else 0,
                'mode': row['mode'] or 'A'
            }
            
            changes = []
            if prev_send:
                # 对比变更
                field_labels = {
                    'date_sent': _('发货日期'),
                    'date_eta': _('预计到达'),
                    'pallets': _('托盘数'),
                    'total_weight': _('总重量(kg)'),
                    'price_kg': _('单价(/kg)'),
                    'total_price': _('物流费用'),
                    'usd_rmb': _('汇率'),
                    'mode': _('汇率获取方式')
                }
                for field, label in field_labels.items():
                    old_val = prev_send[field]
                    new_val = current[field]
                    if old_val != new_val:
                        # 格式化显示
                        if field in ['total_weight', 'price_kg', 'total_price', 'usd_rmb']:
                            old_str = f"{old_val:.2f}" if isinstance(old_val, float) else str(old_val)
                            new_str = f"{new_val:.2f}" if isinstance(new_val, float) else str(new_val)
                        elif field == 'mode':
                            mode_map = {'A': _('自动获取'), 'M': _('手动输入')}
                            old_str = mode_map.get(old_val, old_val)
                            new_str = mode_map.get(new_val, new_val)
                        else:
                            old_str = str(old_val)
                            new_str = str(new_val)
                        changes.append({'field': label, 'old': old_str, 'new': new_str})
            
            strategy_versions.append({
                **current,
                'is_initial': idx == 0,  # 第一条就是初始版本
                'changes': changes
            })
            prev_send = current
        
        # ========== 2. 货物修订记录（in_send_list表） ==========
        detail_df = DBClient.read_df("""
            SELECT seq, date, `by`, note, po_num, sku, price, quantity, action, po_change
            FROM in_send_list 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED), po_num, sku
        """, {'logistic_num': logistic_num})
        
        # 按seq分组
        seq_groups = {}
        for _idx, row in detail_df.iterrows():
            seq = row['seq']
            if seq not in seq_groups:
                seq_groups[seq] = {
                    'seq': seq,
                    'date': str(row['date']) if row['date'] else '-',
                    'by': row['by'] or '',
                    'note': row.get('note') or '',
                    'items': []
                }
            seq_groups[seq]['items'].append({
                'po_num': row['po_num'] or '',
                'sku': row['sku'] or '',
                'qty': int(row['quantity']) if row['quantity'] else 0,
                'unit_price': float(row['price']) if row['price'] else 0,
                'action': row['action'] or '',
                'po_change': row['po_change'] or 'N'
            })
        
        # 按seq排序
        sorted_seqs = sorted(seq_groups.keys(), key=lambda x: int(x.replace('L', '')) if x.startswith('L') else 999)
        
        detail_versions = []
        prev_items_state = {}  # {(po_num, sku, price): qty}
        was_deleted = False
        
        for seq_idx, seq in enumerate(sorted_seqs):
            group = seq_groups[seq]
            is_initial = seq_idx == 0  # 第一条就是初始版本
            is_delete_order = False
            is_restore_order = False
            changes = []
            
            # 检查note是否以"删除订单"开头
            note = group.get('note', '')
            if note.startswith('删除订单'):
                is_delete_order = True
                was_deleted = True
            elif note.startswith('恢复删除'):
                is_restore_order = True
                was_deleted = False
            
            for item in group['items']:
                action = item['action']
                key = (item['po_num'], item['sku'], item['unit_price'])
                
                if is_initial and action in ['add', 'new'] and item['sku']:
                    # 初始数据
                    prev_items_state[key] = item['qty']
                
                elif action == 'add' and item['sku'] and not is_delete_order and not is_restore_order:
                    # 新增货物
                    changes.append({
                        'type': 'add',
                        'po_num': item['po_num'],
                        'sku': item['sku'],
                        'qty': item['qty'],
                        'unit_price': item['unit_price']
                    })
                    prev_items_state[key] = item['qty']
                
                elif action == 'adjust' and item['sku'] and not is_delete_order and not is_restore_order:
                    # 调整
                    old_qty = prev_items_state.get(key, 0)
                    # 如果qty变为0，表示删除（统一的单项删除模式）
                    if item['qty'] == 0 and old_qty > 0:
                        changes.append({
                            'type': 'delete',
                            'po_num': item['po_num'],
                            'sku': item['sku'],
                            'qty': old_qty,
                            'unit_price': item['unit_price']
                        })
                        if key in prev_items_state:
                            del prev_items_state[key]
                        elif old_qty != item['qty']:
                            changes.append({
                                'type': 'adjust',
                                'po_num': item['po_num'],
                                'sku': item['sku'],
                                'fields': [{'field': _('数量'), 'old': old_qty, 'new': item['qty']}]
                            })
                        prev_items_state[key] = item['qty']
                    else:
                        prev_items_state[key] = item['qty']
            
            detail_versions.append({
                'seq': seq,
                'date': group['date'],
                'by': group['by'],
                'note': group['note'],
                'is_initial': is_initial,
                'is_delete_order': is_delete_order,
                'is_restore_order': is_restore_order,
                'changes': changes,
                'items': group['items'] if is_initial else []
            })
        
        return JsonResponse({
            'success': True,
            'data': {
                'logistic_num': logistic_num,
                'strategy_versions': strategy_versions,
                'detail_versions': detail_versions
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取历史记录失败: {error}').format(error=str(e))
        }, status=500)
