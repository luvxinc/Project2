"""
订单管理 - 历史修订记录
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
import pandas as pd

def safe_str(val):
    """安全获取字符串值，处理 None 和 NaN"""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ''
    return str(val)

@login_required(login_url='web_ui:login')
@require_GET
def get_po_history_api(request):
    """
    获取订单历史修订记录
    URL: /dashboard/purchase/api/po_mgmt/history/?po_num=xxx
    
    返回策略和明细的版本历史，包含变更对比
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    logger.info(f"[PO History] 请求订单历史: {po_num}, 用户: {request.user}")
    
    try:
        # ========== 1. 策略修订记录 ==========
        strategy_df = DBClient.read_df("""
            SELECT seq, date, `by`, note, 
                   cur_currency, cur_usd_rmb, cur_float, cur_ex_float, cur_deposit, cur_deposit_par
            FROM in_po_strategy 
            WHERE po_num = :po_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED)
        """, {'po_num': po_num})
        
        strategy_versions = []
        prev_strategy = None
        
        for _idx, row in strategy_df.iterrows():
            current = {
                'seq': row['seq'],
                'date': str(row['date']),
                'by': safe_str(row['by']),
                'note': safe_str(row['note']),
                'currency': row['cur_currency'] or 'RMB',
                'exchange_rate': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 0,
                'float_enabled': bool(row['cur_float']),
                'float_threshold': float(row['cur_ex_float']) if row['cur_ex_float'] else 0,
                'deposit_enabled': bool(row['cur_deposit']),
                'deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0
            }
            
            changes = []
            if prev_strategy:
                # 对比变更
                field_labels = {
                    'currency': _('货币'),
                    'exchange_rate': _('汇率'),
                    'float_enabled': _('价格浮动'),
                    'float_threshold': _('浮动阈值'),
                    'deposit_enabled': _('定金要求'),
                    'deposit_par': _('定金比例')
                }
                for field, label in field_labels.items():
                    if current[field] != prev_strategy[field]:
                        old_val = prev_strategy[field]
                        new_val = current[field]
                        if isinstance(old_val, bool):
                            old_val = _('开启') if old_val else _('关闭')
                            new_val = _('开启') if new_val else _('关闭')
                        elif isinstance(old_val, float):
                            old_val = f"{old_val:.4f}" if field == 'exchange_rate' else f"{old_val}%"
                            new_val = f"{new_val:.4f}" if field == 'exchange_rate' else f"{new_val}%"
                        changes.append({'field': label, 'old': str(old_val), 'new': str(new_val)})
            
            strategy_versions.append({
                **current,
                'is_initial': row['seq'] == 'V01',
                'changes': changes
            })
            prev_strategy = current
        
        # ========== 2. 明细修订记录 ==========
        detail_df = DBClient.read_df("""
            SELECT seq, update_date, `by`, note, po_sku, po_quantity, po_price, action
            FROM in_po 
            WHERE po_num = :po_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED), po_sku
        """, {'po_num': po_num})
        
        # 按seq分组
        seq_groups = {}
        for _idx, row in detail_df.iterrows():
            seq = row['seq']
            if seq not in seq_groups:
                seq_groups[seq] = {
                    'seq': seq,
                    'date': str(row['update_date']),
                    'by': safe_str(row['by']),
                    'note': safe_str(row['note']),
                    'items': []
                }
            seq_groups[seq]['items'].append({
                'sku': row['po_sku'] or '',
                'qty': int(row['po_quantity']) if row['po_quantity'] else 0,
                'unit_price': float(row['po_price']) if row['po_price'] else 0,
                'action': row['action'] or ''
            })
        
        # 按seq排序
        sorted_seqs = sorted(seq_groups.keys(), key=lambda x: int(x.replace('L', '')) if x.startswith('L') else 999)
        
        detail_versions = []
        prev_items_state = {}  # {sku: {qty, unit_price}}
        was_deleted = False  # 跟踪是否之前被删除过
        
        for seq in sorted_seqs:
            group = seq_groups[seq]
            is_initial = seq == 'L01'
            is_delete_order = False
            is_restore_order = False
            changes = []
            note = group.get('note', '')
            
            # 预检测整单删除：note 以"删除订单"开头，且所有商品 qty=0
            if note.startswith('删除订单'):
                all_zero = all(item['qty'] == 0 for item in group['items'] if item['sku'])
                if all_zero and len([i for i in group['items'] if i['sku']]) > 0:
                    is_delete_order = True
                    was_deleted = True
                    prev_items_state = {}  # 清空状态
            
            # 预检测整单恢复：note 以"恢复订单"开头
            if note.startswith('恢复订单') and was_deleted:
                is_restore_order = True
                was_deleted = False
            
            if not is_delete_order and not is_restore_order:
                for item in group['items']:
                    action = item['action']
                    sku = item['sku']
                    
                    if action == 'new' and is_initial and sku:
                        # 初始数据
                        prev_items_state[sku] = {'qty': item['qty'], 'unit_price': item['unit_price']}
                    
                    elif action == 'add' and sku:
                        # 新增商品（恢复操作也用 add）
                        if was_deleted and not is_restore_order:
                            is_restore_order = True
                            was_deleted = False
                        
                        if not is_restore_order or sku in prev_items_state:
                            changes.append({
                                'type': 'add',
                                'sku': sku,
                                'qty': item['qty'],
                                'unit_price': item['unit_price']
                            })
                        prev_items_state[sku] = {'qty': item['qty'], 'unit_price': item['unit_price']}
                    
                    elif action == 'adjust' and sku and sku in prev_items_state:
                        # 调整
                        old = prev_items_state[sku]
                        # 如果qty=0，表示删除（统一的单项删除模式）
                        if item['qty'] == 0:
                            changes.append({
                                'type': 'delete',
                                'sku': sku,
                                'qty': old['qty'],
                                'unit_price': old['unit_price']
                            })
                            del prev_items_state[sku]
                        else:
                            change_detail = {'type': 'adjust', 'sku': sku, 'fields': []}
                            if old['qty'] != item['qty']:
                                change_detail['fields'].append({'field': _('数量'), 'old': old['qty'], 'new': item['qty']})
                            if abs(old['unit_price'] - item['unit_price']) > 0.001:
                                change_detail['fields'].append({'field': _('单价'), 'old': f"{old['unit_price']:.2f}", 'new': f"{item['unit_price']:.2f}"})
                            if change_detail['fields']:
                                changes.append(change_detail)
                            prev_items_state[sku] = {'qty': item['qty'], 'unit_price': item['unit_price']}
            
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
                'po_num': po_num,
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
