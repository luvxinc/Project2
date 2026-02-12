"""
入库管理 - 删除和恢复

[审计修复 2026-01-02]:
- P0-1: 添加数据库事务保护
"""
import logging

import json
from datetime import date
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

from ..hub import check_perm
from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager
from apps.purchase.utils import inject_security_codes_to_post, make_delete_note, make_restore_note, get_next_seq, is_deleted_note
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_receive_delete_api(request):
    """
    提交入库单删除
    URL: /dashboard/purchase/api/receive_mgmt/submit_delete/
    Body: { logistic_num: string, note: string, sec_code_l3: string }
    
    逻辑：
    1. 验证密码
    2. 在in_receive中为每个货物插入一条action='adjust', qty=0的记录，note以"删除订单"开头
    3. 删除in_receive_final中该物流单号的所有记录
    4. 在in_diff中为每个差异插入一条action='adjust', qty=0的记录
    5. 删除in_diff_final中该物流单号的所有记录
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        delete_note = data.get('note', '').strip()
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        if not delete_note:
            return JsonResponse({'success': False, 'message': _('缺少删除备注')}, status=400)
        
        # P0-1 优化: 使用公共工具函数
        inject_security_codes_to_post(request, data)
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_receive_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
        
        today = date.today().isoformat()
        operator = request.user.username or 'system'
        
        # P0-1 优化: 使用公共工具函数生成标准删除备注
        delete_note = make_delete_note(operator, delete_note)
        
        # ========== 0. 检查入库单是否存在 ==========
        base_df = DBClient.read_df("""
            SELECT receive_date
            FROM in_receive 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('入库单不存在')}, status=404)
        
        receive_date = str(base_df.iloc[0]['receive_date']) if base_df.iloc[0]['receive_date'] else ''
        
        # ========== 1. 检查是否已被删除 (只检查最新记录) ==========
        delete_check_df = DBClient.read_df("""
            SELECT note FROM in_receive 
            WHERE logistic_num = :logistic_num 
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if not delete_check_df.empty:
            latest_note = delete_check_df.iloc[0]['note'] or ''
            if latest_note.startswith('删除订单'):
                return JsonResponse({'success': False, 'message': _('入库单已被删除')}, status=400)
        
        # ========== 2. 获取in_receive_final中的所有记录 ==========
        final_items_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_price, sent_quantity, receive_quantity, seq
            FROM in_receive_final
            WHERE logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        
        if final_items_df.empty:
            return JsonResponse({'success': False, 'message': _('入库单无货物记录')}, status=400)
        
        # ========== 3. 计算新的seq ==========
        max_seq_df = DBClient.read_df("""
            SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
            FROM in_receive
            WHERE logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        max_receive_seq = int(max_seq_df.iloc[0]['max_num']) if not max_seq_df.empty and max_seq_df.iloc[0]['max_num'] else 0
        new_receive_seq = f"V{str(max_receive_seq + 1).zfill(2)}"
        
        # ========== P0-1: 使用事务包裹所有写入操作 ==========
        with DBClient.atomic_transaction() as conn:
            # ========== 4. 为每个货物插入删除记录到in_receive ==========
            for _idx, row in final_items_df.iterrows():
                DBClient.execute_stmt("""
                    INSERT INTO in_receive 
                    (sent_date, eta_date_final, receive_date, update_date, logistic_num, po_num, po_sku, 
                     sent_quantity, receive_quantity, po_price, action, note, seq, `by`)
                    VALUES 
                    (:sent_date, :eta_date_final, :receive_date, :update_date, :logistic_num, :po_num, :po_sku,
                     :sent_quantity, :receive_quantity, :po_price, :action, :note, :seq, :by_user)
                """, {
                    'sent_date': None,  # 删除时可为空
                    'eta_date_final': None,  # 删除时可为空
                    'receive_date': receive_date,
                    'update_date': today,
                    'logistic_num': logistic_num,
                    'po_num': row['po_num'],
                    'po_sku': row['po_sku'],
                    'sent_quantity': 0,
                    'receive_quantity': 0,
                    'po_price': float(row['po_price']) if row['po_price'] else 0,
                    'action': 'adjust',
                    'note': delete_note,
                    'seq': new_receive_seq,
                    'by_user': operator
                })
            
            # ========== 5. 删除in_receive_final中的记录 ==========
            DBClient.execute_stmt("""
                DELETE FROM in_receive_final 
                WHERE logistic_num = :logistic_num
            """, {'logistic_num': logistic_num})
            
            # ========== 6. 处理in_diff相关 ==========
            # 获取当前差异记录
            diff_items_df = DBClient.read_df("""
                SELECT po_num, po_sku, diff_quantity, seq
                FROM in_diff_final
                WHERE logistic_num = :logistic_num
            """, {'logistic_num': logistic_num})
            
            if not diff_items_df.empty:
                # 计算新的diff seq
                max_diff_seq_df = DBClient.read_df("""
                    SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                    FROM in_diff
                    WHERE logistic_num = :logistic_num
                """, {'logistic_num': logistic_num})
                max_diff_seq = int(max_diff_seq_df.iloc[0]['max_num']) if not max_diff_seq_df.empty and max_diff_seq_df.iloc[0]['max_num'] else 0
                new_diff_seq = f"D{str(max_diff_seq + 1).zfill(2)}"
                
                # 为每个差异插入删除记录
                for _idx, row in diff_items_df.iterrows():
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff 
                        (record_num, logistic_num, po_num, receive_date, po_sku,
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, action, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         0, 0, 0, 0,
                         :status, :action, :note, :seq, :by_user)
                    """, {
                        'record_num': f"{logistic_num}_{receive_date}",
                        'logistic_num': logistic_num,
                        'po_num': row['po_num'],
                        'receive_date': receive_date,
                        'po_sku': row['po_sku'],
                        'status': 'deleted',
                        'action': 'adjust',
                        'note': delete_note,
                        'seq': new_diff_seq,
                        'by_user': operator
                    })
                
                # 删除in_diff_final中的记录
                DBClient.execute_stmt("""
                    DELETE FROM in_diff_final 
                    WHERE logistic_num = :logistic_num
                """, {'logistic_num': logistic_num})
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.warning(f"删除入库单: {logistic_num}", extra={
            "user": request.user.username,
            "func": "Purchase:ReceiveDelete",
            "action": "DELETE_RECEIVE",
            "target": logistic_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('入库单 %(logistic_num)s 已成功删除') % {'logistic_num': logistic_num}
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('删除失败: %(error)s') % {'error': str(e)}
        }, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_receive_undelete_api(request):
    """
    提交入库单恢复
    URL: /dashboard/purchase/api/receive_mgmt/submit_undelete/
    Body: { logistic_num: string, sec_code_l3: string }
    
    逻辑：
    1. 验证密码
    2. 重放in_receive中删除前的状态
    3. 恢复in_receive_final
    4. 重放in_diff中删除前的状态
    5. 恢复in_diff_final
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        # P0-1 优化: 使用公共工具函数
        inject_security_codes_to_post(request, data)
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_receive_undelete')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
        
        today = date.today().isoformat()
        operator = request.user.username or 'system'
        
        # ========== 1. 查找删除记录（note以'删除订单'开头的最新seq） ==========
        delete_records_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_price, sent_quantity, receive_quantity, 
                   action, seq, receive_date, sent_date, eta_date_final, note,
                   CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
            FROM in_receive 
            WHERE logistic_num = :logistic_num 
              AND note LIKE '删除订单%'
              AND po_num IS NOT NULL AND po_num != ''
            ORDER BY seq_num DESC
        """, {'logistic_num': logistic_num})
        
        if delete_records_df.empty:
            return JsonResponse({'success': False, 'message': _('入库单未被删除')}, status=400)
        
        # 获取最大的删除版本号
        max_delete_seq_num = delete_records_df.iloc[0]['seq_num']
        
        # 筛选出同一批删除的所有记录
        delete_items = delete_records_df[delete_records_df['seq_num'] == max_delete_seq_num]
        
        # ========== 2. 对每个删除记录，回溯找到删除前的数据 ==========
        items_to_restore = []
        receive_date = ''
        eta_date_final = ''
        sent_date = ''
        
        for _idx, del_row in delete_items.iterrows():
            po_num = del_row['po_num']
            po_sku = del_row['po_sku']
            po_price = float(del_row['po_price']) if del_row['po_price'] else 0
            current_seq_num = int(del_row['seq_num'])
            
            # 向前回溯，找到seq < 删除seq 且同key的最后一条有效记录
            prev_row_df = DBClient.read_df("""
                SELECT po_num, po_sku, po_price, sent_quantity, receive_quantity, 
                       receive_date, sent_date, eta_date_final, seq,
                       CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
                FROM in_receive 
                WHERE logistic_num = :logistic_num 
                  AND po_num = :po_num 
                  AND po_sku = :po_sku 
                  AND ABS(po_price - :po_price) < 0.001
                  AND CAST(SUBSTRING(seq, 2) AS UNSIGNED) < :seq_num
                ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
                LIMIT 1
            """, {
                'logistic_num': logistic_num,
                'po_num': po_num,
                'po_sku': po_sku,
                'po_price': po_price,
                'seq_num': current_seq_num
            })
            
            if prev_row_df.empty:
                # 找不到前一个版本，跳过
                continue
            
            prev = prev_row_df.iloc[0]
            prev_sent_qty = int(prev['sent_quantity']) if prev['sent_quantity'] else 0
            prev_receive_qty = int(prev['receive_quantity']) if prev['receive_quantity'] else 0
            
            # 跳过 qty=0 的记录（这本身可能就是之前的删除）
            if prev_sent_qty == 0 and prev_receive_qty == 0:
                continue
            
            items_to_restore.append({
                'po_num': po_num,
                'po_sku': po_sku,
                'po_price': po_price,
                'sent_quantity': prev_sent_qty,
                'receive_quantity': prev_receive_qty,
                'receive_date': str(prev['receive_date']) if prev['receive_date'] else '',
                'sent_date': str(prev['sent_date']) if prev['sent_date'] else '',
                'eta_date_final': str(prev['eta_date_final']) if prev['eta_date_final'] else ''
            })
            
            # 保存日期信息
            if not receive_date:
                receive_date = str(prev['receive_date']) if prev['receive_date'] else ''
            if not eta_date_final:
                eta_date_final = str(prev['eta_date_final']) if prev['eta_date_final'] else ''
            if not sent_date:
                sent_date = str(prev['sent_date']) if prev['sent_date'] else ''
        
        if not items_to_restore:
            return JsonResponse({
                'success': False, 
                'message': _('无法恢复：找不到删除前的有效记录')
            }, status=400)
        
        # ========== 4. 计算新的seq ==========
        max_seq_df = DBClient.read_df("""
            SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
            FROM in_receive
            WHERE logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        max_seq = int(max_seq_df.iloc[0]['max_num']) if not max_seq_df.empty and max_seq_df.iloc[0]['max_num'] else 0
        new_seq = get_next_seq(max_seq, 'V')  # P0-1 优化: 使用公共工具函数
        
        # ========== 5. 插入恢复记录到in_receive ==========
        restore_note = make_restore_note(operator)  # P0-1 优化: 使用公共工具函数
        
        # ========== P0-1: 使用事务包裹所有写入操作 ==========
        with DBClient.atomic_transaction() as conn:
            for item in items_to_restore:
                DBClient.execute_stmt("""
                    INSERT INTO in_receive 
                    (sent_date, eta_date_final, receive_date, update_date, logistic_num, 
                     po_num, po_sku, sent_quantity, receive_quantity, po_price, 
                     action, note, seq, `by`)
                    VALUES 
                    (:sent_date, :eta_date_final, :receive_date, :update_date, :logistic_num,
                     :po_num, :po_sku, :sent_quantity, :receive_quantity, :po_price,
                     :action, :note, :seq, :by_user)
                """, {
                    'sent_date': item.get('sent_date', ''),
                    'eta_date_final': item.get('eta_date_final', ''),
                    'receive_date': item.get('receive_date', receive_date),
                    'update_date': today,
                    'logistic_num': logistic_num,
                    'po_num': item['po_num'],
                    'po_sku': item['po_sku'],
                    'sent_quantity': item['sent_quantity'],
                    'receive_quantity': item['receive_quantity'],
                    'po_price': item['po_price'],
                    'action': 'add',
                    'note': restore_note,
                    'seq': new_seq,
                    'by_user': operator
                })
                
                # 同时恢复in_receive_final (无sent_date列)
                DBClient.execute_stmt("""
                    INSERT INTO in_receive_final 
                    (eta_date_final, receive_date, update_date, logistic_num,
                     po_num, po_sku, sent_quantity, receive_quantity, po_price,
                     note, seq, `by`)
                    VALUES 
                    (:eta_date_final, :receive_date, :update_date, :logistic_num,
                     :po_num, :po_sku, :sent_quantity, :receive_quantity, :po_price,
                     :note, :seq, :by_user)
                """, {
                    'eta_date_final': item.get('eta_date_final', ''),
                    'receive_date': item.get('receive_date', receive_date),
                    'update_date': today,
                    'logistic_num': logistic_num,
                    'po_num': item['po_num'],
                    'po_sku': item['po_sku'],
                    'sent_quantity': item['sent_quantity'],
                    'receive_quantity': item['receive_quantity'],
                    'po_price': item['po_price'],
                    'note': restore_note,
                    'seq': new_seq,
                    'by_user': operator
                })
            
            # ========== 6. 恢复差异记录（如果有差异） ==========
            # 检查恢复的项目中是否存在差异（发货数量≠入库数量）
            diff_items_to_restore = []
            
            for item in items_to_restore:
                sent_qty = item['sent_quantity']
                receive_qty = item['receive_quantity']
                
                if sent_qty != receive_qty:
                    # 获取po_quantity（从in_po_final）
                    po_qty_df = DBClient.read_df("""
                        SELECT SUM(po_quantity) as total_qty
                        FROM in_po_final
                        WHERE po_num = :po_num AND po_sku = :po_sku
                    """, {'po_num': item['po_num'], 'po_sku': item['po_sku']})
                    
                    po_quantity = int(po_qty_df.iloc[0]['total_qty']) if not po_qty_df.empty and po_qty_df.iloc[0]['total_qty'] else 0
                    
                    diff_items_to_restore.append({
                        'po_num': item['po_num'],
                        'po_sku': item['po_sku'],
                        'po_quantity': po_quantity,
                        'sent_quantity': sent_qty,
                        'receive_quantity': receive_qty,
                        'diff_quantity': sent_qty - receive_qty,
                        'receive_date': item.get('receive_date', receive_date)
                    })
            
            # 如果有差异项，恢复差异记录
            if diff_items_to_restore:
                # 获取diff表下一个seq
                max_diff_seq_df = DBClient.read_df("""
                    SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                    FROM in_diff
                    WHERE logistic_num = :logistic_num
                """, {'logistic_num': logistic_num})
                max_diff_seq = int(max_diff_seq_df.iloc[0]['max_num']) if not max_diff_seq_df.empty and max_diff_seq_df.iloc[0]['max_num'] else 0
                new_diff_seq = f"D{str(max_diff_seq + 1).zfill(2)}"
                
                for diff in diff_items_to_restore:
                    # 写入in_diff
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff 
                        (record_num, logistic_num, po_num, receive_date, po_sku,
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, action, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         :po_quantity, :sent_quantity, :receive_quantity, :diff_quantity,
                         :status, :action, :note, :seq, :by_user)
                    """, {
                        'record_num': f"{logistic_num}_{diff['receive_date']}",
                        'logistic_num': logistic_num,
                        'po_num': diff['po_num'],
                        'receive_date': diff['receive_date'],
                        'po_sku': diff['po_sku'],
                        'po_quantity': diff['po_quantity'],
                        'sent_quantity': diff['sent_quantity'],
                        'receive_quantity': diff['receive_quantity'],
                        'diff_quantity': diff['diff_quantity'],
                        'status': 'pending',
                        'action': 'adjust',
                        'note': restore_note,
                        'seq': new_diff_seq,
                        'by_user': operator
                    })
                    
                    # 写入in_diff_final
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff_final 
                        (record_num, logistic_num, po_num, receive_date, po_sku,
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         :po_quantity, :sent_quantity, :receive_quantity, :diff_quantity,
                         :status, :note, :seq, :by_user)
                    """, {
                        'record_num': f"{logistic_num}_{diff['receive_date']}",
                        'logistic_num': logistic_num,
                        'po_num': diff['po_num'],
                        'receive_date': diff['receive_date'],
                        'po_sku': diff['po_sku'],
                        'po_quantity': diff['po_quantity'],
                        'sent_quantity': diff['sent_quantity'],
                        'receive_quantity': diff['receive_quantity'],
                        'diff_quantity': diff['diff_quantity'],
                        'status': 'pending',
                        'note': restore_note,
                        'seq': new_diff_seq,
                        'by_user': operator
                    })
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"恢复入库单: {logistic_num}", extra={
            "user": operator,
            "func": "Purchase:ReceiveRestore",
            "action": "RESTORE_RECEIVE",
            "target": logistic_num
        })
        
        
        return JsonResponse({
            'success': True,
            'message': _('入库单 %(logistic_num)s 已成功恢复') % {'logistic_num': logistic_num}
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('恢复失败: %(error)s') % {'error': str(e)}
        }, status=500)
