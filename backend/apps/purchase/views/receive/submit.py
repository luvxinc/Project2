"""
货物入库 - 提交API
处理流程4的数据库写入逻辑

[审计修复 2026-01-02]:
- P0-1: 添加数据库事务保护
- P0-2: 添加重复入库检查
- P1-1: 统一 check_perm 导入
"""
import logging

import json
from datetime import date as date_type
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods
from django.utils.translation import gettext as _

from ..hub import check_perm
from core.services.security.policy_manager import SecurityPolicyManager
from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_receive_api(request):
    """
    提交入库数据
    Permission: module.purchase.receive
    Security: btn_receive_confirm (L3)
    
    POST Body:
        {
            receive_date: 入库日期 (YYYY-MM-DD),
            items: [
                {
                    logistic_num: 物流单号,
                    po_num: 订单号,
                    po_sku: SKU,
                    sent_quantity: 发货数量,
                    receive_quantity: 入库数量
                },
                ...
            ]
        }
    
    写入逻辑:
        1. 对于每个 (logistic_num, po_num, po_sku) 组合:
           - 查询 in_send_final 获取所有匹配行（可能多个 po_price）
           - 按 po_price 分配 receive_quantity
        2. 写入 in_receive 表
        3. 若有差异，写入 in_diff 表
        4. 同步写入 in_receive_final 表
    """
    if not check_perm(request.user, 'module.purchase.receive'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
        receive_date = data.get('receive_date', '')
        items = data.get('items', [])
        
        # 从 JSON body 获取安全码并注入到 POST（用于 SecurityPolicyManager 验证）
        from django.http import QueryDict
        mutable_post = request.POST.copy()
        for key in ['sec_code_l0', 'sec_code_l1', 'sec_code_l2', 'sec_code_l3', 'sec_code_l4']:
            if key in data:
                mutable_post[key] = data[key]
        request.POST = mutable_post
        
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_receive_confirm')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
        items = data.get('items', [])
        
        if not receive_date:
            return JsonResponse({'success': False, 'message': _('缺少入库日期')}, status=400)
        if not items:
            return JsonResponse({'success': False, 'message': _('没有需要入库的数据')}, status=400)
        
        today = date_type.today().isoformat()
        operator = request.user.username
        
        # ========== P0-2: 重复入库检查 ==========
        logistic_nums = list(set(item.get('logistic_num', '') for item in items if item.get('logistic_num')))
        if logistic_nums:
            existing_df = DBClient.read_df("""
                SELECT DISTINCT logistic_num FROM in_receive_final
                WHERE logistic_num IN :logistic_nums
            """, {'logistic_nums': tuple(logistic_nums)})
            
            if not existing_df.empty:
                existing_list = existing_df['logistic_num'].tolist()
                return JsonResponse({
                    'success': False,
                    'message': _('以下物流单已入库，不可重复提交: {log_list}').format(log_list=", ".join(existing_list))
                }, status=400)
        
        # 统计
        total_receive_rows = 0
        total_diff_rows = 0
        skipped_items = []
        
        # ========== P0-1: 使用事务包裹所有写入操作 ==========
        with DBClient.atomic_transaction() as conn:
            # 处理每个入库项
            for item in items:
                logistic_num = item.get('logistic_num', '')
                po_num = item.get('po_num', '')
                po_sku = item.get('po_sku', '')
                sent_quantity = int(item.get('sent_quantity', 0))
                receive_quantity = int(item.get('receive_quantity', 0))
                
                if not logistic_num or not po_num or not po_sku:
                    skipped_items.append({'item': item, 'reason': _('缺少必填字段')})
                    continue
                
                # ========== 步骤1: 查询 in_send_final 获取所有匹配行 ==========
                send_rows_df = DBClient.read_df("""
                    SELECT 
                        sent_date,
                        sent_logistic_num,
                        po_num,
                        po_sku,
                        sent_quantity,
                        po_price,
                        sent_seq
                    FROM in_send_final
                    WHERE sent_logistic_num = :logistic_num
                      AND po_num = :po_num
                      AND po_sku = :po_sku
                    ORDER BY po_price DESC
                """, {
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'po_sku': po_sku
                })
                
                if send_rows_df.empty:
                    continue  # 没有匹配的发货记录，跳过
                
                # 获取 sent_date 和 sent_seq（取第一条）
                sent_date = str(send_rows_df.iloc[0]['sent_date']) if send_rows_df.iloc[0]['sent_date'] else ''
                sent_seq = send_rows_df.iloc[0]['sent_seq'] if send_rows_df.iloc[0]['sent_seq'] else 'S01'
                
                # 获取 date_eta（从 in_send 表）
                eta_df = DBClient.read_df("""
                    SELECT date_eta
                    FROM in_send
                    WHERE logistic_num = :logistic_num
                      AND seq = :seq
                    LIMIT 1
                """, {
                    'logistic_num': logistic_num,
                    'seq': sent_seq
                })
                eta_date_final = str(eta_df.iloc[0]['date_eta']) if not eta_df.empty and eta_df.iloc[0]['date_eta'] else receive_date
                
                # ========== 步骤2: 按 po_price 分配 receive_quantity ==========
                rows_to_write = []
                
                if len(send_rows_df) == 1:
                    # 只有一行，直接写入
                    row = send_rows_df.iloc[0]
                    rows_to_write.append({
                        'sent_date': sent_date,
                        'eta_date_final': eta_date_final,
                        'receive_date': receive_date,
                        'update_date': today,
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'sent_quantity': int(row['sent_quantity']),
                        'receive_quantity': receive_quantity,
                        'po_price': float(row['po_price']) if row['po_price'] else 0,
                        'action': 'new',
                        'note': _('原始入库'),
                        'seq': 'V01',
                        'by': operator
                    })
                else:
                    # 多行情况：需要按 po_price 分配
                    total_sent = send_rows_df['sent_quantity'].sum()
                    diff = total_sent - receive_quantity
                    
                    if diff >= 0:
                        # 收货不足或相等：差额从 po_price 最低的项扣除
                        sorted_df = send_rows_df.sort_values('po_price', ascending=True)
                        remaining_diff = diff
                        
                        for idx, row in sorted_df.iterrows():
                            row_sent = int(row['sent_quantity'])
                            row_price = float(row['po_price']) if row['po_price'] else 0
                            
                            if remaining_diff >= row_sent:
                                row_receive = 0
                                remaining_diff -= row_sent
                            else:
                                row_receive = row_sent - remaining_diff
                                remaining_diff = 0
                            
                            rows_to_write.append({
                                'sent_date': sent_date,
                                'eta_date_final': eta_date_final,
                                'receive_date': receive_date,
                                'update_date': today,
                                'logistic_num': logistic_num,
                                'po_num': po_num,
                                'po_sku': po_sku,
                                'sent_quantity': row_sent,
                                'receive_quantity': row_receive,
                                'po_price': row_price,
                                'action': 'new',
                                'note': _('原始入库'),
                                'seq': 'V01',
                                'by': operator
                            })
                    else:
                        # 超出发货：多余的加到 po_price 最高的项
                        excess = abs(diff)
                        first_row = True
                        
                        for idx, row in send_rows_df.iterrows():
                            row_sent = int(row['sent_quantity'])
                            row_price = float(row['po_price']) if row['po_price'] else 0
                            
                            if first_row:
                                row_receive = row_sent + excess
                                first_row = False
                            else:
                                row_receive = row_sent
                            
                            rows_to_write.append({
                                'sent_date': sent_date,
                                'eta_date_final': eta_date_final,
                                'receive_date': receive_date,
                                'update_date': today,
                                'logistic_num': logistic_num,
                                'po_num': po_num,
                                'po_sku': po_sku,
                                'sent_quantity': row_sent,
                                'receive_quantity': row_receive,
                                'po_price': row_price,
                                'action': 'new',
                                'note': _('原始入库'),
                                'seq': 'V01',
                                'by': operator
                            })
                
                # ========== 步骤3: 写入 in_receive 和 in_receive_final ==========
                for rec in rows_to_write:
                    # 写入 in_receive
                    DBClient.execute_stmt("""
                        INSERT INTO in_receive 
                        (sent_date, eta_date_final, receive_date, update_date, logistic_num, 
                         po_num, po_sku, sent_quantity, receive_quantity, po_price, 
                         action, note, seq, `by`)
                        VALUES 
                        (:sent_date, :eta_date_final, :receive_date, :update_date, :logistic_num,
                         :po_num, :po_sku, :sent_quantity, :receive_quantity, :po_price,
                         :action, :note, :seq, :by)
                    """, rec)
                    
                    # 写入 in_receive_final
                    DBClient.execute_stmt("""
                        INSERT INTO in_receive_final 
                        (eta_date_final, receive_date, update_date, logistic_num, 
                         po_num, po_sku, sent_quantity, receive_quantity, po_price, 
                         note, seq, `by`)
                        VALUES 
                        (:eta_date_final, :receive_date, :update_date, :logistic_num,
                         :po_num, :po_sku, :sent_quantity, :receive_quantity, :po_price,
                         :note, :seq, :by)
                    """, rec)
                    
                    total_receive_rows += 1
                
                # ========== 步骤4: 若有差异，写入 in_diff ==========
                if sent_quantity != receive_quantity:
                    diff_quantity = sent_quantity - receive_quantity
                    record_num = f"{logistic_num}_{receive_date}"
                    
                    # 获取 po_quantity（从 in_po_final）
                    po_qty_df = DBClient.read_df("""
                        SELECT SUM(po_quantity) as total_qty
                        FROM in_po_final
                        WHERE po_num = :po_num AND po_sku = :po_sku
                    """, {'po_num': po_num, 'po_sku': po_sku})
                    po_quantity = int(po_qty_df.iloc[0]['total_qty']) if not po_qty_df.empty and po_qty_df.iloc[0]['total_qty'] else 0
                    
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff 
                        (record_num, logistic_num, po_num, receive_date, po_sku, 
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, action, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         :po_quantity, :sent_quantity, :receive_quantity, :diff_quantity,
                         :status, :action, :note, :seq, :by)
                    """, {
                        'record_num': record_num,
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'receive_date': receive_date,
                        'po_sku': po_sku,
                        'po_quantity': po_quantity,
                        'sent_quantity': sent_quantity,
                        'receive_quantity': receive_quantity,
                        'diff_quantity': diff_quantity,
                        'status': 'pending',
                        'action': 'new',
                        'note': _('原始入库差异'),
                        'seq': 'D01',
                        'by': operator
                    })
                    
                    # 同时写入 in_diff_final 表
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff_final 
                        (record_num, logistic_num, po_num, receive_date, po_sku, 
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         :po_quantity, :sent_quantity, :receive_quantity, :diff_quantity,
                         :status, :note, :seq, :by)
                    """, {
                        'record_num': record_num,
                        'logistic_num': logistic_num,
                        'po_num': po_num,
                        'receive_date': receive_date,
                        'po_sku': po_sku,
                        'po_quantity': po_quantity,
                        'sent_quantity': sent_quantity,
                        'receive_quantity': receive_quantity,
                        'diff_quantity': diff_quantity,
                        'status': 'pending',
                        'note': _('原始入库差异'),
                        'seq': 'D01',
                        'by': operator
                    })
                    
                    total_diff_rows += 1
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"货物入库: {receive_date}", extra={
            "user": operator,
            "func": "Purchase:Receive",
            "action": "RECEIVE",
            "target": ",".join(logistic_nums) if logistic_nums else receive_date
        })
        
        # 创建 FIFO 入库单价记录
        if logistic_nums:
            from apps.finance.utils.landed_price import create_landed_price_records
            for log_num in logistic_nums:
                try:
                    create_landed_price_records(log_num)
                except Exception as price_err:
                    logger.warning(f"创建入库单价记录失败 ({log_num}): {price_err}")
        
        return JsonResponse({
            'success': True,
            'message': _('入库成功'),
            'data': {
                'receive_date': receive_date,
                'total_receive_rows': total_receive_rows,
                'total_diff_rows': total_diff_rows,
                'skipped_items': skipped_items if skipped_items else None
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('入库失败: {error}').format(error=str(e))
        }, status=500)
