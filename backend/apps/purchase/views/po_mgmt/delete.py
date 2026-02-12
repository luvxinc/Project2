"""
订单管理 - 删除和恢复

[审计修复 2026-01-02]:
- P0-3: 添加数据库事务保护
- P0-4: 添加L3安全验证
- P1-2: 使用 logging 替代 traceback.print_exc
"""
import json
import logging
from datetime import date

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

from ..hub import check_perm
from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager
from apps.purchase.utils import extract_date_from_po_num, make_delete_note, make_restore_note, get_next_seq, is_deleted_note
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_po_delete_api(request):
    """
    提交订单删除
    URL: /dashboard/purchase/api/po_mgmt/submit_delete/
    Body: { po_num: string }
    
    逻辑：在in_po表中插入一条action='delete'且sku为空的记录
    表示整单删除
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('请求数据格式错误')}, status=400)
    
    # P0-4: L3 安全验证 (传入已解析的 data 避免重复读取 body)
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, 'btn_po_delete', json_data=data)
    if not is_valid:
        return JsonResponse({'success': False, 'message': sec_msg}, status=403)
    
    try:
        po_num = data.get('po_num', '').strip()
        
        if not po_num:
            return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
        
        # 验证订单存在且未被删除
        base_df = DBClient.read_df("""
            SELECT supplier_code FROM in_po 
            WHERE po_num = :po_num AND action = 'new' AND seq = 'L01'
            LIMIT 1
        """, {'po_num': po_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('订单不存在')}, status=404)
        
        supplier_code = base_df.iloc[0]['supplier_code']
        
        # 检查是否已经被删除
        # 方式1: in_po_final 中没有该订单的记录
        # 方式2: 最新的in_po记录note以'删除订单'开头
        final_check_df = DBClient.read_df("""
            SELECT COUNT(*) as cnt FROM in_po_final 
            WHERE po_num = :po_num
        """, {'po_num': po_num})
        
        has_final_records = not final_check_df.empty and int(final_check_df.iloc[0]['cnt']) > 0
        
        if not has_final_records:
            # 再检查是否有原始记录（可能是刚创建就被删除的情况）
            delete_check_df = DBClient.read_df("""
                SELECT note 
                FROM in_po 
                WHERE po_num = :po_num
                ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
                LIMIT 1
            """, {'po_num': po_num})
            
            if not delete_check_df.empty:
                latest_note = delete_check_df.iloc[0]['note'] or ''
                if latest_note.startswith('删除订单'):
                    return JsonResponse({'success': False, 'message': _('订单已被删除')}, status=400)
        
        # 检查发货状态 - 已发货订单不允许删除
        from .utils import check_po_shipping_status
        can_modify, shipping_status, status_msg = check_po_shipping_status(po_num)
        if not can_modify:
            return JsonResponse({
                'success': False, 
                'message': status_msg,
                'shipping_status': shipping_status
            }, status=400)
        
        # 获取当前最大seq
        max_seq_df = DBClient.read_df("""
            SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
            FROM in_po
            WHERE po_num = :po_num
        """, {'po_num': po_num})
        
        max_num = 1
        if not max_seq_df.empty and max_seq_df.iloc[0]['max_num']:
            max_num = int(max_seq_df.iloc[0]['max_num'])
        
        new_seq = get_next_seq(max_num, 'L')  # P0-1 优化
        
        # 获取当前策略的货币和汇率
        current_strategy_df = DBClient.read_df("""
            SELECT cur_currency, cur_usd_rmb 
            FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC 
            LIMIT 1
        """, {'po_num': po_num})
        
        currency = 'RMB'
        usd_rmb = 1.0
        if not current_strategy_df.empty:
            currency = current_strategy_df.iloc[0]['cur_currency'] or 'RMB'
            usd_rmb = float(current_strategy_df.iloc[0]['cur_usd_rmb'] or 1.0)
        
        # 获取 in_po_final 中该订单的所有货物
        final_items_df = DBClient.read_df("""
            SELECT po_sku, po_quantity, po_price
            FROM in_po_final
            WHERE po_num = :po_num
        """, {'po_num': po_num})
        
        if final_items_df.empty:
            return JsonResponse({'success': False, 'message': _('订单无货物记录')}, status=400)
        
        # 获取当前最大seq
        max_seq_df = DBClient.read_df("""
            SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
            FROM in_po
            WHERE po_num = :po_num
        """, {'po_num': po_num})
        
        max_num = 1
        if not max_seq_df.empty and max_seq_df.iloc[0]['max_num']:
            max_num = int(max_seq_df.iloc[0]['max_num'])
        
        new_seq = f"L{str(max_num + 1).zfill(2)}"
        
        today = date.today().isoformat()
        operator = request.user.username or 'system'
        delete_note = make_delete_note(operator)  # P0-1 优化
        
        # P0-3: 使用事务保护所有写入操作
        # 为每个货物插入 qty=0 的删除记录（与Send模块一致）
        success_count = 0
        with DBClient.atomic_transaction():
            for _idx, row in final_items_df.iterrows():
                po_sku = row['po_sku']
                po_price = float(row['po_price']) if row['po_price'] else 0
                
                result = DBClient.execute_stmt("""
                    INSERT INTO in_po 
                    (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, note, action, seq)
                    VALUES 
                    (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, :note, :action, :seq)
                """, {
                    'update_date': today,
                    'supplier_code': supplier_code,
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'po_quantity': 0,  # qty=0 表示删除
                    'po_price': po_price,
                    'currency': currency,
                    'usd_rmb': usd_rmb,
                    'by_user': operator,
                    'note': delete_note,
                    'action': 'adjust',
                    'seq': new_seq
                })
                
                if result:
                    success_count += 1
            
            # 同步删除 in_po_final 表中该订单的所有记录
            if success_count > 0:
                DBClient.execute_stmt("""
                    DELETE FROM in_po_final 
                    WHERE po_num = :po_num
                """, {'po_num': po_num})
        
        # 事务完成后记录日志和返回
        if success_count > 0:
            # 记录审计日志
            from core.sys.logger import get_audit_logger
            audit_logger = get_audit_logger()
            audit_logger.warning(f"删除采购订单: {po_num}", extra={
                "user": operator,
                "func": "Purchase:PODelete",
                "action": "DELETE_PO",
                "target": po_num
            })
            
            return JsonResponse({
                'success': True,
                'message': _('订单删除成功'),
                'data': {
                    'po_num': po_num,
                    'delete_seq': new_seq,
                    'items_deleted': success_count
                }
            })
        else:
            return JsonResponse({
                'success': False,
                'message': _('删除失败: 数据库写入失败')
            }, status=500)
        
    except Exception as e:
        # import traceback  # P1-2: Removed
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('删除订单失败: %(error)s') % {'error': str(e)}
        }, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_po_undelete_api(request):
    """
    撤销订单删除
    URL: /dashboard/purchase/api/po_mgmt/submit_undelete/
    Body: { po_num: string }
    
    逻辑（参考Send模块模式）：
    1. 找到note以"删除订单"开头的删除记录（seq最大的批次）
    2. 对每个SKU，回溯找seq-1的记录获取原quantity
    3. 插入新seq的恢复记录
    4. 同步写入in_po_final
    """
    if not check_perm(request.user, 'module.purchase.po.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('请求数据格式错误')}, status=400)
    
    # P0-4: 安全验证 (传入已解析的 data 避免重复读取 body)
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, 'btn_po_undelete', json_data=data)
    if not is_valid:
        return JsonResponse({'success': False, 'message': sec_msg}, status=403)
    
    try:
        po_num = data.get('po_num', '').strip()
        
        if not po_num:
            return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
        
        today = date.today().isoformat()
        operator = request.user.username or 'system'
        restore_note = make_restore_note(operator)  # P0-1 优化

        
        # ========== 1. 查找删除记录 ==========
        # 找到note以"删除订单"开头的行，选取seq最大的批次
        delete_records_df = DBClient.read_df("""
            SELECT update_date, supplier_code, po_num, po_sku, po_quantity, po_price, 
                   currency, usd_rmb, `by`, action, note, seq,
                   CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
            FROM in_po
            WHERE po_num = :po_num 
              AND note LIKE '删除订单%'
              AND po_sku IS NOT NULL
              AND po_sku != ''
            ORDER BY seq_num DESC
        """, {'po_num': po_num})
        
        if delete_records_df.empty:
            return JsonResponse({'success': False, 'message': _('找不到删除记录，订单未被删除')}, status=400)
        
        # 获取最大的seq_num（删除版本号）
        max_delete_seq_num = int(delete_records_df.iloc[0]['seq_num'])
        
        # 筛选出seq_num等于max_delete_seq_num的所有行（同一批删除的记录）
        delete_items = delete_records_df[delete_records_df['seq_num'] == max_delete_seq_num]
        
        # 新的seq (P0-1 优化: 使用公共工具函数)
        new_seq = get_next_seq(max_delete_seq_num, 'L')
        
        # 获取基础信息
        supplier_code = delete_items.iloc[0]['supplier_code'] or ''
        currency = delete_items.iloc[0]['currency'] or 'RMB'
        usd_rmb = float(delete_items.iloc[0]['usd_rmb']) if delete_items.iloc[0]['usd_rmb'] else 1.0
        
        # ========== 2. 收集要恢复的数据 ==========
        items_to_restore = []
        
        for _idx, del_row in delete_items.iterrows():
            po_sku = del_row['po_sku']
            po_price = float(del_row['po_price']) if del_row['po_price'] else 0
            current_seq_num = int(del_row['seq_num'])
            
            # 在本表中找seq-1的行的quantity（如果找不到就继续-1）
            prev_quantity = 0
            found_prev = False
            
            for prev_seq in range(current_seq_num - 1, 0, -1):
                prev_row_df = DBClient.read_df("""
                    SELECT po_quantity
                    FROM in_po
                    WHERE po_num = :po_num 
                      AND po_sku = :po_sku 
                      AND ABS(po_price - :po_price) < 0.001
                      AND CAST(SUBSTRING(seq, 2) AS UNSIGNED) = :seq_num
                    LIMIT 1
                """, {
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'po_price': po_price,
                    'seq_num': prev_seq
                })
                
                if not prev_row_df.empty:
                    prev_quantity = int(prev_row_df.iloc[0]['po_quantity']) if prev_row_df.iloc[0]['po_quantity'] else 0
                    found_prev = True
                    break
            
            if not found_prev:
                # 找不到前一个版本，跳过
                continue
            
            items_to_restore.append({
                'po_sku': po_sku,
                'po_price': po_price,
                'po_quantity': prev_quantity
            })
        
        if not items_to_restore:
            return JsonResponse({'success': False, 'message': _('无法恢复：找不到历史记录')}, status=400)
        
        # ========== 3. 写入in_po (P0-3: 使用事务保护) ==========
        success_count = 0
        po_date_from_num = extract_date_from_po_num(po_num)
        
        with DBClient.atomic_transaction():
            for item in items_to_restore:
                # 写入 in_po (无po_date列)
                result = DBClient.execute_stmt("""
                    INSERT INTO in_po 
                    (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, note, action, seq)
                    VALUES 
                    (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, :note, :action, :seq)
                """, {
                    'update_date': today,
                    'supplier_code': supplier_code,
                    'po_num': po_num,
                    'po_sku': item['po_sku'],
                    'po_quantity': item['po_quantity'],
                    'po_price': item['po_price'],
                    'currency': currency,
                    'usd_rmb': usd_rmb,
                    'by_user': operator,
                    'note': restore_note,
                    'action': 'add',  # 使用add动作恢复
                    'seq': new_seq
                })
                if result:
                    success_count += 1
            
            # ========== 4. 更新in_po_final ==========
            # 先清理可能存在的残留记录
            DBClient.execute_stmt("""
                DELETE FROM in_po_final 
                WHERE po_num = :po_num
            """, {'po_num': po_num})
            
            # 写入恢复的记录
            for item in items_to_restore:
                if item['po_quantity'] > 0:
                    DBClient.execute_stmt("""
                        INSERT INTO in_po_final 
                        (po_date, po_update_date, po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by)
                        VALUES (:po_date, :po_update_date, :po_num, :po_sku, :po_quantity, :po_price, :po_note, :po_seq, :po_by)
                    """, {
                        'po_date': po_date_from_num,
                        'po_update_date': today,
                        'po_num': po_num,
                        'po_sku': item['po_sku'],
                        'po_quantity': item['po_quantity'],
                        'po_price': item['po_price'],
                        'po_note': restore_note,
                        'po_seq': new_seq,
                        'po_by': operator
                    })
        
        if success_count > 0:
            # 记录审计日志
            from core.sys.logger import get_audit_logger
            audit_logger = get_audit_logger()
            audit_logger.info(f"恢复采购订单: {po_num}", extra={
                "user": operator,
                "func": "Purchase:PORestore",
                "action": "RESTORE_PO",
                "target": po_num
            })
            
            return JsonResponse({
                'success': True,
                'message': _('订单恢复成功，共恢复 %(count)s 个商品') % {'count': success_count},
                'data': {
                    'po_num': po_num,
                    'restore_seq': new_seq,
                    'restored_items': success_count
                }
            })
        else:
            return JsonResponse({
                'success': False,
                'message': _('恢复失败: 数据库写入失败')
            }, status=500)
        
    except Exception as e:
        # import traceback  # P1-2: Removed
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('撤销删除失败: %(error)s') % {'error': str(e)}
        }, status=500)

