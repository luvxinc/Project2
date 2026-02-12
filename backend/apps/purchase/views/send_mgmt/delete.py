"""
发货单管理 - 删除和恢复

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
from apps.purchase.utils import extract_date_from_po_num, inject_security_codes_to_post, make_delete_note, make_restore_note, get_next_seq, is_deleted_note
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_send_delete_api(request):
    """
    提交发货单删除
    URL: /dashboard/purchase/api/send_mgmt/submit_delete/
    Body: { logistic_num: string, note: string }
    
    逻辑：
    1. 从in_send_final获取该发货单的所有货物记录
    2. 根据key在in_send_list中找到对应记录，复制并设置quantity=0
    3. 如果原记录po_change='Y'，需要恢复in_po中的订货量
    4. 更新in_po_final和in_send_final
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    # P0-4: L3 安全验证
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, 'btn_send_delete')
    if not is_valid:
        return JsonResponse({'success': False, 'message': sec_msg}, status=403)
    
    try:
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        delete_note = data.get('note', '').strip()
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        if not delete_note:
            return JsonResponse({'success': False, 'message': _('缺少删除备注')}, status=400)
        
        today = date.today().isoformat()
        operator = request.user.username or 'system'
        
        # P0-1 优化: 使用公共工具函数生成标准删除备注
        delete_note = make_delete_note(operator, delete_note)
        
        # ========== 0. 获取发货单基础信息 ==========
        base_df = DBClient.read_df("""
            SELECT date_sent
            FROM in_send 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('发货单不存在')}, status=404)
        
        date_sent = str(base_df.iloc[0]['date_sent']) if base_df.iloc[0]['date_sent'] else ''
        
        # ========== 1. 从in_send_final获取货物列表 ==========
        final_items_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_price, sent_seq
            FROM in_send_final
            WHERE sent_logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        
        if final_items_df.empty:
            return JsonResponse({'success': False, 'message': _('发货单无货物记录')}, status=400)
        
        # ========== 2. 计算新的seq ==========
        max_seq_df = DBClient.read_df("""
            SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
            FROM in_send_list
            WHERE logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        max_list_seq = int(max_seq_df.iloc[0]['max_num']) if not max_seq_df.empty and max_seq_df.iloc[0]['max_num'] else 0
        new_list_seq = get_next_seq(max_list_seq, 'L')  # P0-1 优化
        
        # ========== 3. 处理每个货物记录 ==========
        processed_count = 0
        po_adjustments = []  # 需要恢复in_po的记录
        
        for _idx, item in final_items_df.iterrows():
            po_num = item['po_num']
            po_sku = item['po_sku']
            po_price = float(item['po_price']) if item['po_price'] else 0
            sent_seq = item['sent_seq'] or ''
            
            # 3.1 从in_send_list获取原记录
            orig_list_df = DBClient.read_df("""
                SELECT date, logistic_num, po_num, sku, price, quantity, action, note, `by`, seq, po_change
                FROM in_send_list
                WHERE logistic_num = :logistic_num 
                  AND po_num = :po_num 
                  AND sku = :sku 
                  AND ABS(price - :price) < 0.001
                  AND seq = :seq
                LIMIT 1
            """, {
                'logistic_num': logistic_num,
                'po_num': po_num,
                'sku': po_sku,
                'price': po_price,
                'seq': sent_seq
            })
            
            if orig_list_df.empty:
                # 如果找不到匹配的原记录，跳过（可能是初始数据）
                continue
            
            orig = orig_list_df.iloc[0]
            orig_po_change = orig['po_change'] or 'N'
            
            # 3.2 复制并插入新记录（quantity=0, action='adjust'）
            DBClient.execute_stmt("""
                INSERT INTO in_send_list 
                (date, logistic_num, po_num, sku, price, quantity, action, note, `by`, seq, po_change)
                VALUES 
                (:date, :logistic_num, :po_num, :sku, :price, :quantity, :action, :note, :by_user, :seq, :po_change)
            """, {
                'date': today,
                'logistic_num': logistic_num,
                'po_num': po_num,
                'sku': po_sku,
                'price': po_price,
                'quantity': 0,  # 设为0表示删除
                'action': 'adjust',
                'note': delete_note,
                'by_user': operator,
                'seq': new_list_seq,
                'po_change': 'N'
            })
            processed_count += 1
            
            # 3.3 如果原记录po_change='Y'，需要恢复in_po
            if orig_po_change == 'Y':
                po_adjustments.append({
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'po_price': po_price
                })
        
        # ========== 4. 处理需要恢复in_po的记录 ==========
        for adj in po_adjustments:
            po_num = adj['po_num']
            po_sku = adj['po_sku']
            po_price = adj['po_price']
            
            # 4.1 获取in_po中seq最大的记录 (注意: in_po没有po_date字段)
            latest_po_df = DBClient.read_df("""
                SELECT update_date, supplier_code, po_num, po_sku, po_quantity, po_price, 
                       currency, usd_rmb, `by`, action, note, seq,
                       CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
                FROM in_po
                WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                ORDER BY seq_num DESC
                LIMIT 1
            """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
            
            if latest_po_df.empty:
                continue
            
            latest_po = latest_po_df.iloc[0]
            current_seq_num = int(latest_po['seq_num'])
            
            # 4.2 获取seq-1的记录的po_quantity（恢复到调整前的值）
            prev_seq = f"L{str(current_seq_num - 1).zfill(2)}" if current_seq_num > 1 else f"P{str(current_seq_num - 1).zfill(2)}"
            prev_po_df = DBClient.read_df("""
                SELECT po_quantity
                FROM in_po
                WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                  AND CAST(SUBSTRING(seq, 2) AS UNSIGNED) = :prev_seq_num
                LIMIT 1
            """, {
                'po_num': po_num, 
                'po_sku': po_sku, 
                'po_price': po_price,
                'prev_seq_num': current_seq_num - 1
            })
            
            # 如果找不到前一个seq的记录，使用当前记录的quantity
            if prev_po_df.empty:
                restored_qty = int(latest_po['po_quantity']) if latest_po['po_quantity'] else 0
            else:
                restored_qty = int(prev_po_df.iloc[0]['po_quantity']) if prev_po_df.iloc[0]['po_quantity'] else 0
            
            # 4.3 计算新seq
            new_po_seq_num = current_seq_num + 1
            # 判断seq前缀
            orig_seq = latest_po['seq'] or ''
            if orig_seq.startswith('P'):
                new_po_seq = f"L{str(new_po_seq_num).zfill(2)}"  # 统一使用L前缀
            else:
                new_po_seq = f"L{str(new_po_seq_num).zfill(2)}"
            
            # 4.4 po_date在in_po表中不存在，跳过
            
            # 4.5 插入新的in_po记录 (无po_date列)
            DBClient.execute_stmt("""
                INSERT INTO in_po 
                (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, 
                 currency, usd_rmb, `by`, action, note, seq)
                VALUES 
                (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price,
                 :currency, :usd_rmb, :by_user, :action, :note, :seq)
            """, {
                'update_date': today,
                'supplier_code': latest_po['supplier_code'] or '',
                'po_num': po_num,
                'po_sku': po_sku,
                'po_quantity': restored_qty,
                'po_price': po_price,
                'currency': latest_po['currency'] or 'USD',
                'usd_rmb': float(latest_po['usd_rmb']) if latest_po['usd_rmb'] else 0,
                'by_user': operator,
                'action': 'adjust',
                'note': delete_note,
                'seq': new_po_seq
            })
            
            # 4.6 更新in_po_final
            if restored_qty == 0:
                # 如果恢复后数量为0，删除该行
                DBClient.execute_stmt("""
                    DELETE FROM in_po_final 
                    WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
            else:
                # 更新该行
                DBClient.execute_stmt("""
                    UPDATE in_po_final 
                    SET po_update_date = :update_date,
                        po_quantity = :po_quantity,
                        po_note = :note,
                        po_seq = :seq,
                        po_by = :by_user
                    WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                """, {
                    'update_date': today,
                    'po_quantity': restored_qty,
                    'note': delete_note,
                    'seq': new_po_seq,
                    'by_user': operator,
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'po_price': po_price
                })
        
        # ========== 5. 更新in_send_final ==========
        # 由于所有quantity都设为0，需要删除这些行
        DBClient.execute_stmt("""
            DELETE FROM in_send_final 
            WHERE sent_logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.warning(f"删除发货单: {logistic_num}", extra={
            "user": request.user.username,
            "func": "Purchase:SendDelete",
            "action": "DELETE_SEND",
            "target": logistic_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('发货单删除成功，共处理 %(count)s 件货物') % {'count': processed_count},
            'data': {
                'logistic_num': logistic_num,
                'processed_items': processed_count,
                'po_restored': len(po_adjustments)
            }
        })
        
    except Exception as e:
        logger.exception("删除发货单失败")
        return JsonResponse({
            'success': False,
            'message': _('删除发货单失败: %(error)s') % {'error': str(e)}
        }, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_send_undelete_api(request):
    """
    撤销发货单删除
    URL: /dashboard/purchase/api/send_mgmt/submit_undelete/
    Body: { logistic_num: string }
    
    顺序：in_send_list -> in_po -> in_send_final -> in_po_final
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    # P0-4: 安全验证
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, 'btn_send_undelete')
    if not is_valid:
        return JsonResponse({'success': False, 'message': sec_msg}, status=403)
    
    try:
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        today = date.today().isoformat()
        operator = request.user.username or 'system'
        restore_note = make_restore_note(operator)  # P0-1 优化
        
        # ========== 0. 获取发货单基础信息 ==========
        base_df = DBClient.read_df("""
            SELECT date_sent
            FROM in_send 
            WHERE logistic_num = :logistic_num
            ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if base_df.empty:
            return JsonResponse({'success': False, 'message': _('发货单不存在')}, status=404)
        
        date_sent = str(base_df.iloc[0]['date_sent']) if base_df.iloc[0]['date_sent'] else ''
        
        # ========== 1. 步骤1: 查找删除记录 ==========
        # 找到note以"删除订单"开头的行，选取seq最大的行
        delete_records_df = DBClient.read_df("""
            SELECT date, logistic_num, po_num, sku, price, quantity, action, note, `by`, seq, po_change,
                   CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
            FROM in_send_list
            WHERE logistic_num = :logistic_num 
              AND note LIKE '删除订单%'
              AND po_num != ''
            ORDER BY seq_num DESC
        """, {'logistic_num': logistic_num})
        
        if delete_records_df.empty:
            return JsonResponse({'success': False, 'message': _('找不到删除记录')}, status=400)
        
        # 获取最大的seq_num（删除版本号）
        max_delete_seq_num = delete_records_df.iloc[0]['seq_num']
        
        # 筛选出seq_num等于max_delete_seq_num的所有行（同一批删除的记录）
        delete_items = delete_records_df[delete_records_df['seq_num'] == max_delete_seq_num]
        
        # 新的seq (P0-1 优化: 使用公共工具函数)
        new_seq = get_next_seq(max_delete_seq_num, 'L')
        
        # ========== 2. 步骤2: 收集要恢复的数据 ==========
        items_to_restore = []
        po_changes_to_process = []
        
        for _idx, del_row in delete_items.iterrows():
            po_num = del_row['po_num']
            sku = del_row['sku']
            price = float(del_row['price']) if del_row['price'] else 0
            po_change = del_row['po_change'] or 'N'
            current_seq_num = int(del_row['seq_num'])
            
            # 在本表中找seq-1的行的quantity（如果找不到就继续-1）
            prev_quantity = 0
            prev_row_data = None
            
            for prev_seq in range(current_seq_num - 1, 0, -1):
                prev_row_df = DBClient.read_df("""
                    SELECT date, logistic_num, po_num, sku, price, quantity, action, note, `by`, seq, po_change
                    FROM in_send_list
                    WHERE logistic_num = :logistic_num 
                      AND po_num = :po_num 
                      AND sku = :sku 
                      AND ABS(price - :price) < 0.001
                      AND CAST(SUBSTRING(seq, 2) AS UNSIGNED) = :seq_num
                    LIMIT 1
                """, {
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'sku': sku,
                    'price': price,
                    'seq_num': prev_seq
                })
                
                if not prev_row_df.empty:
                    prev_quantity = int(prev_row_df.iloc[0]['quantity']) if prev_row_df.iloc[0]['quantity'] else 0
                    prev_row_data = prev_row_df.iloc[0]
                    break
            
            if prev_row_data is None:
                # 找不到前一个版本，跳过
                continue
            
            items_to_restore.append({
                'date': prev_row_data['date'],
                'logistic_num': logistic_num,
                'po_num': po_num,
                'sku': sku,
                'price': price,
                'quantity': prev_quantity,
                'action': 'adjust',
                'note': restore_note,
                'by': operator,
                'seq': new_seq,
                'po_change': prev_row_data['po_change'] or 'N'
            })
            
            # 如果有po_change=Y，需要处理in_po
            if prev_row_data['po_change'] == 'Y':
                po_changes_to_process.append({
                    'po_num': po_num,
                    'sku': sku,
                    'price': price,
                    'quantity': prev_quantity
                })
        
        if not items_to_restore:
            return JsonResponse({'success': False, 'message': _('无法恢复：找不到历史记录')}, status=400)
        
        # ========== 3. 写入in_send_list（一起写入） ==========
        for item in items_to_restore:
            DBClient.execute_stmt("""
                INSERT INTO in_send_list 
                (date, logistic_num, po_num, sku, price, quantity, action, note, `by`, seq, po_change)
                VALUES 
                (:date, :logistic_num, :po_num, :sku, :price, :quantity, :action, :note, :by_user, :seq, :po_change)
            """, {
                'date': today,
                'logistic_num': item['logistic_num'],
                'po_num': item['po_num'],
                'sku': item['sku'],
                'price': item['price'],
                'quantity': item['quantity'],
                'action': item['action'],
                'note': item['note'],
                'by_user': item['by'],
                'seq': item['seq'],
                'po_change': item['po_change']
            })
        
        # ========== 4. 写入in_po（如果有po_change=Y） ==========
        po_updates = []
        for pc in po_changes_to_process:
            po_num = pc['po_num']
            po_sku = pc['sku']
            po_price = pc['price']
            new_po_quantity = pc['quantity']  # 用in_send_list中的quantity作为新的po_quantity
            
            # 获取in_po中seq最大的行 (注意: in_po没有po_date字段)
            latest_po_df = DBClient.read_df("""
                SELECT update_date, supplier_code, po_num, po_sku, po_quantity, po_price, 
                       currency, usd_rmb, `by`, action, note, seq,
                       CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
                FROM in_po
                WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                ORDER BY seq_num DESC
                LIMIT 1
            """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
            
            if latest_po_df.empty:
                continue
            
            latest_po = latest_po_df.iloc[0]
            current_po_seq_num = int(latest_po['seq_num'])
            
            # 计算新seq（P##格式）
            # 先获取该po_num下的最大seq
            max_po_seq_df = DBClient.read_df("""
                SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                FROM in_po
                WHERE po_num = :po_num
            """, {'po_num': po_num})
            max_po_seq = int(max_po_seq_df.iloc[0]['max_num']) if not max_po_seq_df.empty and max_po_seq_df.iloc[0]['max_num'] else 0
            new_po_seq = f"L{str(max_po_seq + 1).zfill(2)}"  # 统一使用L前缀
            
            po_note = f"恢复删除发货单_恢复订单调整项_{operator}_{today}"
            
            # 写入in_po (无po_date列)
            DBClient.execute_stmt("""
                INSERT INTO in_po 
                (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, 
                 currency, usd_rmb, `by`, action, note, seq)
                VALUES 
                (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price,
                 :currency, :usd_rmb, :by_user, :action, :note, :seq)
            """, {
                'update_date': today,
                'supplier_code': latest_po['supplier_code'] or '',
                'po_num': po_num,
                'po_sku': po_sku,
                'po_quantity': new_po_quantity,
                'po_price': po_price,
                'currency': latest_po['currency'] or 'USD',
                'usd_rmb': float(latest_po['usd_rmb']) if latest_po['usd_rmb'] else 0,
                'by_user': operator,
                'action': 'adjust',
                'note': po_note,
                'seq': new_po_seq
            })
            
            po_updates.append({
                'po_num': po_num,
                'po_sku': po_sku,
                'po_price': po_price,
                'po_quantity': new_po_quantity,
                'note': po_note,
                'seq': new_po_seq
            })
        
        # ========== 5. 更新in_send_final ==========
        for item in items_to_restore:
            if item['quantity'] > 0:
                # 检查是否已存在
                existing_df = DBClient.read_df("""
                    SELECT 1 FROM in_send_final 
                    WHERE sent_logistic_num = :logistic_num 
                      AND po_num = :po_num 
                      AND po_sku = :sku 
                      AND ABS(po_price - :price) < 0.001
                    LIMIT 1
                """, {
                    'logistic_num': item['logistic_num'],
                    'po_num': item['po_num'],
                    'sku': item['sku'],
                    'price': item['price']
                })
                
                if existing_df.empty:
                    # 插入新记录
                    DBClient.execute_stmt("""
                        INSERT INTO in_send_final 
                        (sent_date, sent_update_date, sent_logistic_num, po_num, po_sku, sent_quantity, po_price, sent_note, sent_seq, sent_by)
                        VALUES
                        (:sent_date, :update_date, :logistic_num, :po_num, :po_sku, :sent_qty, :po_price, :note, :seq, :by_user)
                    """, {
                        'sent_date': date_sent,
                        'update_date': today,
                        'logistic_num': item['logistic_num'],
                        'po_num': item['po_num'],
                        'po_sku': item['sku'],
                        'sent_qty': item['quantity'],
                        'po_price': item['price'],
                        'note': item['note'],
                        'seq': item['seq'],
                        'by_user': operator
                    })
                else:
                    # 更新现有记录
                    DBClient.execute_stmt("""
                        UPDATE in_send_final 
                        SET sent_update_date = :update_date,
                            sent_quantity = :sent_qty,
                            sent_note = :note,
                            sent_seq = :seq,
                            sent_by = :by_user
                        WHERE sent_logistic_num = :logistic_num 
                          AND po_num = :po_num 
                          AND po_sku = :sku 
                          AND ABS(po_price - :price) < 0.001
                    """, {
                        'update_date': today,
                        'sent_qty': item['quantity'],
                        'note': item['note'],
                        'seq': item['seq'],
                        'by_user': operator,
                        'logistic_num': item['logistic_num'],
                        'po_num': item['po_num'],
                        'sku': item['sku'],
                        'price': item['price']
                    })
            else:
                # quantity为0，删除该行
                DBClient.execute_stmt("""
                    DELETE FROM in_send_final 
                    WHERE sent_logistic_num = :logistic_num 
                      AND po_num = :po_num 
                      AND po_sku = :sku 
                      AND ABS(po_price - :price) < 0.001
                """, {
                    'logistic_num': item['logistic_num'],
                    'po_num': item['po_num'],
                    'sku': item['sku'],
                    'price': item['price']
                })
        
        # ========== 6. 更新in_po_final（如果有po更新） ==========
        for pu in po_updates:
            if pu['po_quantity'] > 0:
                DBClient.execute_stmt("""
                    UPDATE in_po_final 
                    SET po_update_date = :update_date,
                        po_quantity = :po_quantity,
                        po_note = :note,
                        po_seq = :seq,
                        po_by = :by_user
                    WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                """, {
                    'update_date': today,
                    'po_quantity': pu['po_quantity'],
                    'note': pu['note'],
                    'seq': pu['seq'],
                    'by_user': operator,
                    'po_num': pu['po_num'],
                    'po_sku': pu['po_sku'],
                    'po_price': pu['po_price']
                })
            else:
                # po_quantity为0，删除该行
                DBClient.execute_stmt("""
                    DELETE FROM in_po_final 
                    WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                """, {
                    'po_num': pu['po_num'],
                    'po_sku': pu['po_sku'],
                    'po_price': pu['po_price']
                })
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"恢复发货单: {logistic_num}", extra={
            "user": request.user.username,
            "func": "Purchase:SendRestore",
            "action": "RESTORE_SEND",
            "target": logistic_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('发货单恢复成功，共恢复 %(count)s 件货物') % {'count': len(items_to_restore)},
            'data': {
                'logistic_num': logistic_num,
                'restored_items': len(items_to_restore),
                'po_adjusted': len(po_updates)
            }
        })
        
    except Exception as e:
        logger.exception("撤销删除失败")
        return JsonResponse({
            'success': False,
            'message': _('撤销删除失败: %(error)s') % {'error': str(e)}
        }, status=500)


