"""
订单管理 - 订单编辑和修改

[审计修复 2026-01-02]:
"""
import logging

import json
from datetime import date as date_type
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET, require_http_methods

from ..hub import check_perm
from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager
from apps.purchase.utils import extract_date_from_po_num
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_GET
def get_po_for_edit_api(request):
    """
    获取订单可编辑数据（用于修改订单向导）
    URL: /dashboard/purchase/api/po_mgmt/edit_data/?po_num=xxx
    
    返回:
    - strategy: 最新策略信息（可编辑）
    - items: 当前商品列表（计算后的最终状态）
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    try:
        # 1. 获取订单基础信息
        base_df = DBClient.read_df("""
            SELECT supplier_code, update_date as order_date
            FROM in_po 
            WHERE po_num = :po_num AND action = 'new' AND seq = 'L01'
            LIMIT 1
        """, {'po_num': po_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('订单不存在')}, status=404)
        
        supplier_code = base_df.iloc[0]['supplier_code']
        order_date = str(base_df.iloc[0]['order_date'])
        
        # 2. 获取最新策略（seq V##数字最大的）
        strategy_df = DBClient.read_df("""
            SELECT * FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY 
                CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC,
                date DESC
            LIMIT 1
        """, {'po_num': po_num})
        
        strategy = {}
        current_strategy_seq = 'V00'
        if not strategy_df.empty:
            row = strategy_df.iloc[0]
            current_strategy_seq = row['seq']
            strategy = {
                'seq': row['seq'],
                'currency': row['cur_currency'],
                'exchange_rate': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 0,
                'float_enabled': bool(row['cur_float']),
                'float_threshold': float(row['cur_ex_float']) if row['cur_ex_float'] else 0,
                'deposit_enabled': bool(row['cur_deposit']),
                'deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0,
                'note': row.get('note', '') or ''
            }
        
        # 3. 获取商品列表（计算后的最终状态）
        all_details_df = DBClient.read_df("""
            SELECT po_sku, po_quantity, po_price, action, seq
            FROM in_po 
            WHERE po_num = :po_num
            ORDER BY seq
        """, {'po_num': po_num})
        
        # 按seq排序所有记录
        all_records = []
        for _idx, row in all_details_df.iterrows():
            all_records.append({
                'sku': row['po_sku'] or '',
                'qty': int(row['po_quantity']) if row['po_quantity'] else 0,
                'unit_price': float(row['po_price']) if row['po_price'] else 0,
                'action': row['action'] or '',
                'seq': row['seq'] or ''
            })
        all_records.sort(key=lambda x: int(x['seq'].replace('L', '')) if x['seq'].startswith('L') else 999)
        
        # 按seq顺序应用变更，遇到整单删除则清空
        items = {}
        current_detail_seq = 'L00'
        
        for record in all_records:
            action = record['action']
            sku = record['sku']
            seq = record['seq']
            
            # 更新最大seq
            if seq.startswith('L'):
                seq_num = int(seq.replace('L', ''))
                current_num = int(current_detail_seq.replace('L', ''))
                if seq_num > current_num:
                    current_detail_seq = seq
            
            if action == 'new' and seq == 'L01' and sku:
                # 初始数据 - 使用 (sku, price) 作为 key 避免同SKU不同价格被覆盖
                key = (sku, record['unit_price'])
                items[key] = {
                    'sku': sku,
                    'qty': record['qty'],
                    'unit_price': record['unit_price'],
                    'original_qty': record['qty'],
                    'original_price': record['unit_price']
                }
            
            elif action == 'adjust' and not sku:
                # 整单删除标记：note以"删除订单"开头，清空之前所有数据
                if record.get('note', '').startswith('删除订单'):
                    items = {}
            
            elif action == 'adjust' and sku:
                # 调整：更新已存在SKU
                # 如果qty=0，表示删除（统一的单项删除模式）
                key = (sku, record['unit_price'])
                if record['qty'] == 0:
                    if key in items:
                        items[key]['is_deleted'] = True
                elif key in items:
                    items[key]['qty'] = record['qty']
                    items[key]['unit_price'] = record['unit_price']
                    items[key]['is_deleted'] = False  # 如果之前被删除，现在调整意味着恢复
            
            elif action == 'add' and sku:
                # 新增：添加新SKU（用于恢复或新增商品）
                key = (sku, record['unit_price'])
                items[key] = {
                    'sku': sku,
                    'qty': record['qty'],
                    'unit_price': record['unit_price'],
                    'original_qty': 0,
                    'original_price': 0,
                    'is_added': True,
                    'is_deleted': False
                }
        
        # 将当前状态设置为"原始信息"（供下次编辑时显示）
        for sku_key in items:
            items[sku_key]['original_qty'] = items[sku_key]['qty']
            items[sku_key]['original_price'] = items[sku_key]['unit_price']
            # 确保is_deleted字段存在
            if 'is_deleted' not in items[sku_key]:
                items[sku_key]['is_deleted'] = False
        
        return JsonResponse({
            'success': True,
            'data': {
                'po_num': po_num,
                'supplier_code': supplier_code,
                'order_date': order_date,
                'strategy': strategy,
                'current_strategy_seq': current_strategy_seq,
                'current_detail_seq': current_detail_seq,
                'items': list(items.values())
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('获取订单数据失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_sku_list_api(request):
    """
    获取SKU列表（用于新增SKU下拉）
    URL: /dashboard/purchase/api/po_mgmt/sku_list/
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        df = DBClient.read_df("""
            SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU
        """)
        
        sku_list = df['SKU'].tolist() if not df.empty else []
        
        return JsonResponse({
            'success': True,
            'data': sku_list
        })
        
    except Exception as e:
        return JsonResponse({
            'success': False,
            'message': _('获取SKU列表失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_po_modification_api(request):
    """
    提交订单修改
    URL: POST /dashboard/purchase/api/po_mgmt/submit_modify/
    
    请求体:
    {
        "po_num": "XX20251224-S01",
        "strategy_modified": true/false,
        "strategy": { ... },      // 如果strategy_modified为true
        "items_modified": true/false,
        "items": [                // 如果items_modified为true，仅包含修改/新增/删除的项
            {"sku": "...", "qty": 10, "unit_price": 5.0, "action": "adjust|add|delete"}
        ]
    }
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
        
        # [Security Fix 2026-01-11] 添加密码验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_po_modify', data)
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
        
        po_num = data.get('po_num', '').strip()
        strategy_modified = data.get('strategy_modified', False)
        items_modified = data.get('items_modified', False)
        
        
        if not po_num:
            return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
        
        # 验证订单存在
        base_df = DBClient.read_df("""
            SELECT supplier_code FROM in_po 
            WHERE po_num = :po_num AND action = 'new' AND seq = 'L01'
            LIMIT 1
        """, {'po_num': po_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('订单不存在')}, status=404)
        
        supplier_code = base_df.iloc[0]['supplier_code']
        today = date_type.today().isoformat()
        operator = request.user.username
        
        # 检查发货状态 - 已发货订单不允许修改
        from .utils import check_po_shipping_status
        can_modify, shipping_status, status_msg = check_po_shipping_status(po_num)
        if not can_modify:
            return JsonResponse({
                'success': False, 
                'message': status_msg,
                'shipping_status': shipping_status
            }, status=400)
        
        new_strategy_seq = None
        new_detail_seq = None
        
        # 1. 处理策略修改
        if strategy_modified:
            strategy = data.get('strategy', {})
            
            # 获取当前最大seq
            max_seq_df = DBClient.read_df("""
                SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                FROM in_po_strategy
                WHERE po_num = :po_num
            """, {'po_num': po_num})
            
            max_num = 0
            if not max_seq_df.empty and max_seq_df.iloc[0]['max_num']:
                max_num = int(max_seq_df.iloc[0]['max_num'])
            
            new_strategy_seq = f"V{str(max_num + 1).zfill(2)}"
            
            # 插入新策略
            DBClient.execute_stmt("""
                INSERT INTO in_po_strategy 
                (po_num, date, seq, `by`, note, cur_currency, cur_usd_rmb, cur_mode, cur_float, cur_ex_float, cur_deposit, cur_deposit_par)
                VALUES 
                (:po_num, :date, :seq, :by_user, :note, :currency, :exchange_rate, :cur_mode, :float_enabled, :float_threshold, :deposit_enabled, :deposit_par)
            """, {
                'po_num': po_num,
                'date': today,
                'seq': new_strategy_seq,
                'by_user': operator,
                'note': strategy.get('note', ''),
                'currency': strategy.get('currency', 'RMB'),
                'exchange_rate': float(strategy.get('exchange_rate', 0)),
                'cur_mode': strategy.get('cur_mode', 'M'),
                'float_enabled': 1 if strategy.get('float_enabled') else 0,
                'float_threshold': float(strategy.get('float_threshold', 0)),
                'deposit_enabled': 1 if strategy.get('deposit_enabled') else 0,
                'deposit_par': float(strategy.get('deposit_par', 0))
            })
        
        # 2. 处理明细修改
        if items_modified:
            items = data.get('items', [])
            items_note = data.get('items_note', '')  # 明细修改备注
            
            if items:
                # 获取当前策略的货币和汇率
                current_strategy_df = DBClient.read_df("""
                    SELECT cur_currency, cur_usd_rmb 
                    FROM in_po_strategy 
                    WHERE po_num = :po_num 
                    ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC 
                    LIMIT 1
                """, {'po_num': po_num})
                
                if not current_strategy_df.empty:
                    currency = current_strategy_df.iloc[0]['cur_currency'] or 'RMB'
                    usd_rmb = float(current_strategy_df.iloc[0]['cur_usd_rmb'] or 1.0)
                else:
                    currency = 'RMB'
                    usd_rmb = 1.0
                
                # 获取当前最大seq
                max_seq_df = DBClient.read_df("""
                    SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                    FROM in_po
                    WHERE po_num = :po_num
                """, {'po_num': po_num})
                
                max_num = 1  # 默认L01
                if not max_seq_df.empty and max_seq_df.iloc[0]['max_num']:
                    max_num = int(max_seq_df.iloc[0]['max_num'])
                
                new_detail_seq = f"L{str(max_num + 1).zfill(2)}"
                
                # 获取po_date（从po_num提取，同一po_num下恒定不变）
                po_date_from_num = extract_date_from_po_num(po_num)
                
                # 插入每个修改的项
                for item in items:
                    original_action = item.get('action', 'adjust')  # adjust, add, delete
                    sku = item.get('sku', '')
                    
                    # 单项删除统一使用 action='adjust', qty=0
                    # (前端可能传入action='delete'，这里转换为adjust)
                    if original_action == 'delete' and sku:
                        action_to_write = 'adjust'
                        qty_to_write = 0
                    else:
                        action_to_write = original_action
                        qty_to_write = int(item.get('qty', 0))
                    
                    # 插入 in_po 表 (注意: in_po 没有 po_date 列)
                    DBClient.execute_stmt("""
                        INSERT INTO in_po 
                        (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, note, action, seq)
                        VALUES 
                        (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, :note, :action, :seq)
                    """, {
                        'update_date': today,
                        'supplier_code': supplier_code,
                        'po_num': po_num,
                        'po_sku': sku,
                        'po_quantity': qty_to_write,
                        'po_price': float(item.get('unit_price', 0)),
                        'currency': currency,
                        'usd_rmb': usd_rmb,
                        'by_user': operator,
                        'note': items_note,
                        'action': action_to_write,
                        'seq': new_detail_seq
                    })
                    
                    # 同步更新 in_po_final 表
                    if original_action == 'add':
                        # 新增: 插入新行，从po_num提取日期
                        po_date_from_num = extract_date_from_po_num(po_num)
                        DBClient.execute_stmt("""
                            INSERT INTO in_po_final 
                            (po_date, po_update_date, po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by)
                            VALUES (:po_date, :po_update_date, :po_num, :po_sku, :po_quantity, :po_price, :po_note, :po_seq, :po_by)
                        """, {
                            'po_date': po_date_from_num,
                            'po_update_date': today,
                            'po_num': po_num,
                            'po_sku': sku,
                            'po_quantity': int(item.get('qty', 0)),
                            'po_price': float(item.get('unit_price', 0)),
                            'po_note': items_note,
                            'po_seq': new_detail_seq,
                            'po_by': operator
                        })
                        
                    elif original_action == 'adjust':
                        # 调整: 通过SKU、原数量、原单价定位并更新
                        original_qty = int(item.get('original_qty', 0))
                        original_price = float(item.get('original_price', 0))
                        
                        DBClient.execute_stmt("""
                            UPDATE in_po_final 
                            SET po_update_date = :po_update_date,
                                po_quantity = :po_quantity,
                                po_price = :po_price,
                                po_note = :po_note,
                                po_seq = :po_seq,
                                po_by = :po_by
                            WHERE po_num = :po_num 
                              AND po_sku = :po_sku
                              AND po_quantity = :original_qty
                              AND ABS(po_price - :original_price) < 0.001
                            LIMIT 1
                        """, {
                            'po_update_date': today,
                            'po_num': po_num,
                            'po_sku': sku,
                            'po_quantity': int(item.get('qty', 0)),
                            'po_price': float(item.get('unit_price', 0)),
                            'po_note': items_note,
                            'po_seq': new_detail_seq,
                            'po_by': operator,
                            'original_qty': original_qty,
                            'original_price': original_price
                        })
                        
                    elif original_action == 'delete' and sku:
                        # 删除单个SKU: 通过SKU、原数量、原单价定位并删除
                        # (记录表写入的是action='adjust', qty=0，但final表仍物理删除)
                        original_qty = int(item.get('original_qty', 0))
                        original_price = float(item.get('original_price', 0))
                        
                        DBClient.execute_stmt("""
                            DELETE FROM in_po_final 
                            WHERE po_num = :po_num 
                              AND po_sku = :po_sku
                              AND po_quantity = :original_qty
                              AND ABS(po_price - :original_price) < 0.001
                            LIMIT 1
                        """, {
                            'po_num': po_num,
                            'po_sku': sku,
                            'original_qty': original_qty,
                            'original_price': original_price
                        })
        
        # =============================================
        # 合并 in_po_final 中重复的记录
        # 同 po_num 下, po_sku 和 po_price 相同时合并
        # po_quantity 相加, po_note/po_seq/po_by 用最新的
        # =============================================
        try:
            # 查找需要合并的记录组
            merge_df = DBClient.read_df("""
                SELECT po_sku, po_price, COUNT(*) as cnt, 
                       SUM(po_quantity) as total_qty,
                       MAX(po_update_date) as latest_date
                FROM in_po_final
                WHERE po_num = :po_num
                GROUP BY po_sku, po_price
                HAVING COUNT(*) > 1
            """, params={'po_num': po_num})
            
            if not merge_df.empty:
                for _idx, merge_row in merge_df.iterrows():
                    m_sku = merge_row['po_sku']
                    m_price = float(merge_row['po_price'])
                    m_total_qty = int(merge_row['total_qty'])
                    
                    # 获取最新记录的元数据 (po_note, po_seq, po_by, po_date)
                    latest_df = DBClient.read_df("""
                        SELECT po_date, po_note, po_seq, po_by
                        FROM in_po_final
                        WHERE po_num = :po_num 
                          AND po_sku = :po_sku 
                          AND ABS(po_price - :po_price) < 0.001
                        ORDER BY po_update_date DESC, po_seq DESC
                        LIMIT 1
                    """, params={
                        'po_num': po_num,
                        'po_sku': m_sku,
                        'po_price': m_price
                    })
                    
                    if not latest_df.empty:
                        latest = latest_df.iloc[0]
                        
                        # 删除所有重复记录
                        DBClient.execute_stmt("""
                            DELETE FROM in_po_final
                            WHERE po_num = :po_num 
                              AND po_sku = :po_sku 
                              AND ABS(po_price - :po_price) < 0.001
                        """, {
                            'po_num': po_num,
                            'po_sku': m_sku,
                            'po_price': m_price
                        })
                        
                        # 插入合并后的单条记录，从po_num提取日期
                        merge_po_date = extract_date_from_po_num(po_num)
                        DBClient.execute_stmt("""
                            INSERT INTO in_po_final 
                            (po_date, po_update_date, po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by)
                            VALUES (:po_date, :po_update_date, :po_num, :po_sku, :po_quantity, :po_price, :po_note, :po_seq, :po_by)
                        """, {
                            'po_date': merge_po_date,
                            'po_update_date': today,
                            'po_num': po_num,
                            'po_sku': m_sku,
                            'po_quantity': m_total_qty,
                            'po_price': m_price,
                            'po_note': latest['po_note'],
                            'po_seq': latest['po_seq'],
                            'po_by': latest['po_by']
                        })
        except Exception as merge_err:
            # 合并失败不影响主流程，只记录日志
            logger.exception("合并操作失败")
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"修改采购订单: {po_num}", extra={
            "user": request.user.username,
            "func": "Purchase:POEdit",
            "action": "EDIT_PO",
            "target": po_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('订单修改成功'),
            'data': {
                'po_num': po_num,
                'new_strategy_seq': new_strategy_seq,
                'new_detail_seq': new_detail_seq
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('提交修改失败: {error}').format(error=str(e))
        }, status=500)
