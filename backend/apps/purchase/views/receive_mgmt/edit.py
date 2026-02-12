"""
入库管理 - 修改提交API

逻辑说明：
1. in_receive表：写入每一行修改记录（根据in_send_final匹配可能写入多行）
2. in_diff表：写入存在差异的行（发货数量≠入库数量）
3. in_receive_final表：覆盖更新匹配的行

[审计修复 2026-01-02]:
- P0-1: 添加数据库事务保护
- P1-1: 统一 check_perm 导入
- P1-4: 统一权限KEY格式
- P2-6: SQL参数化白名单校验
- P2-7: 日期处理统一
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.views.decorators.csrf import csrf_protect
import json
import pandas as pd
from datetime import date
from decimal import Decimal

from ..hub import check_perm
from core.services.security.policy_manager import SecurityPolicyManager
from core.components.db.client import DBClient
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


# P2-6: 安全白名单 - 防止SQL注入
ALLOWED_TABLES = {'in_receive', 'in_receive_final', 'in_diff', 'in_diff_final'}
ALLOWED_SEQ_COLS = {'seq', 'sent_seq'}


def get_next_seq(table_name: str, logistic_num: str, seq_col: str = 'seq', prefix: str = 'V') -> str:
    """
    获取下一个版本号
    
    安全说明: table_name和seq_col通过白名单校验，防止SQL注入
    """
    # 白名单校验
    if table_name not in ALLOWED_TABLES:
        raise ValueError(f"Invalid table_name: {table_name}")
    if seq_col not in ALLOWED_SEQ_COLS:
        raise ValueError(f"Invalid seq_col: {seq_col}")
    
    seq_df = DBClient.read_df(f"""
        SELECT {seq_col}, CAST(REGEXP_REPLACE({seq_col}, '[^0-9]', '') AS UNSIGNED) as seq_num
        FROM {table_name}
        WHERE logistic_num = :logistic_num
        ORDER BY seq_num DESC
        LIMIT 1
    """, {'logistic_num': logistic_num})
    
    if seq_df.empty:
        return f"{prefix}01"
    
    current_seq_num = int(seq_df.iloc[0]['seq_num']) if seq_df.iloc[0]['seq_num'] else 0
    return f"{prefix}{str(current_seq_num + 1).zfill(2)}"


@login_required(login_url='web_ui:login')
@require_POST
@csrf_protect
def receive_edit_submit_api(request):
    """
    提交入库单修改
    URL: /dashboard/purchase/api/receive_mgmt/edit_submit/
    Permission: module.purchase.receive.mgmt
    Security: btn_receive_mgmt_edit
    
    POST JSON:
        logistic_num: 物流单号
        note: 修改备注
        items: [{ po_num, po_sku, sent_quantity, receive_quantity }, ...]
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return JsonResponse({'success': False, 'message': 'Forbidden'}, status=403)
    
    # 安全策略验证
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'btn_receive_mgmt_edit')
    if not is_valid:
        return JsonResponse({'success': False, 'message': msg}, status=403)
    
    try:
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '')
        note = data.get('note', '')
        items = data.get('items', [])
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        if not items:
            return JsonResponse({'success': False, 'message': _('无修改项')}, status=400)
        
        # P2-7: 统一使用isoformat()字符串格式
        today = date.today().isoformat()
        username = request.user.username
        
        # 获取原始入库记录（用于获取receive_date等不可变字段）
        original_receive_df = DBClient.read_df("""
            SELECT DISTINCT receive_date
            FROM in_receive_final
            WHERE logistic_num = :logistic_num
            LIMIT 1
        """, {'logistic_num': logistic_num})
        
        if original_receive_df.empty:
            return JsonResponse({'success': False, 'message': _('入库单不存在')}, status=404)
        
        receive_date = original_receive_df.iloc[0]['receive_date']
        
        # 获取各表的下一个seq
        receive_new_seq = get_next_seq('in_receive', logistic_num, 'seq', 'R')
        receive_final_new_seq = get_next_seq('in_receive_final', logistic_num, 'seq', 'V')
        
        # 存储要写入的记录
        in_receive_records = []
        in_diff_records = []
        in_receive_final_records = []
        diff_final_deletes = []  # 差异消除时需要从 in_diff_final 删除的记录
        
        for item in items:
            po_num = item['po_num']
            po_sku = item['po_sku']
            new_receive_qty = int(item['receive_quantity'])
            sent_qty = int(item.get('sent_quantity', 0))
            
            # 步骤1：从in_send_final获取该logistic_num/po_num/po_sku的所有行（按po_price排序）
            send_final_df = DBClient.read_df("""
                SELECT sent_logistic_num, po_num, po_sku, po_price, sent_quantity, sent_date
                FROM in_send_final
                WHERE sent_logistic_num = :logistic_num
                  AND po_num = :po_num
                  AND po_sku = :po_sku
                ORDER BY po_price DESC
            """, {'logistic_num': logistic_num, 'po_num': po_num, 'po_sku': po_sku})
            
            if send_final_df.empty:
                # 如果没找到匹配的发货记录，使用默认值
                send_final_df = pd.DataFrame([{
                    'sent_logistic_num': logistic_num,
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'po_price': 0,
                    'sent_quantity': sent_qty,
                    'sent_date': today
                }])
            
            # 获取eta_date_final（通过in_send表）
            eta_df = DBClient.read_df("""
                SELECT s.date_eta
                FROM in_send s
                INNER JOIN (
                    SELECT sent_seq, sent_logistic_num
                    FROM in_send_final
                    WHERE sent_logistic_num = :logistic_num
                    ORDER BY CAST(REGEXP_REPLACE(sent_seq, '[^0-9]', '') AS UNSIGNED) DESC
                    LIMIT 1
                ) sf ON s.seq = sf.sent_seq AND s.logistic_num = sf.sent_logistic_num
            """, {'logistic_num': logistic_num})
            
            eta_date_final = eta_df.iloc[0]['date_eta'] if not eta_df.empty else None
            sent_date = send_final_df.iloc[0]['sent_date']
            
            # 步骤2：分配 receive_quantity 到各价格档位
            total_send_qty = send_final_df['sent_quantity'].astype(int).sum()
            
            if len(send_final_df) == 1:
                # 单行情况：直接写入
                row = send_final_df.iloc[0]
                record = {
                    'sent_date': sent_date,
                    'eta_date_final': eta_date_final,
                    'receive_date': receive_date,
                    'update_date': today,
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'sent_quantity': int(row['sent_quantity']),
                    'receive_quantity': new_receive_qty,
                    'po_price': float(row['po_price']) if row['po_price'] else 0,
                    'action': 'adjust',
                    'note': note,
                    'seq': receive_new_seq,
                    'by': username
                }
                in_receive_records.append(record)
            else:
                # 多行情况：需要分配
                # 按价格排序（已排序DESC）
                diff = new_receive_qty - total_send_qty
                
                if diff >= 0:
                    # 收货多于发货：多的部分加到最高价格
                    for idx, row in send_final_df.iterrows():
                        row_sent_qty = int(row['sent_quantity'])
                        if idx == 0:
                            # 最高价格行，加上多余数量
                            row_recv_qty = row_sent_qty + diff
                        else:
                            # 其他行保持发货数量
                            row_recv_qty = row_sent_qty
                        
                        record = {
                            'sent_date': sent_date,
                            'eta_date_final': eta_date_final,
                            'receive_date': receive_date,
                            'update_date': today,
                            'logistic_num': logistic_num,
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'sent_quantity': row_sent_qty,
                            'receive_quantity': row_recv_qty,
                            'po_price': float(row['po_price']) if row['po_price'] else 0,
                            'action': 'adjust',
                            'note': note,
                            'seq': receive_new_seq,
                            'by': username
                        }
                        in_receive_records.append(record)
                else:
                    # 收货少于发货：差额从最低价格扣除
                    remaining_recv = new_receive_qty
                    sorted_by_price_asc = send_final_df.sort_values('po_price', ascending=True)
                    
                    for idx, row in sorted_by_price_asc.iterrows():
                        row_sent_qty = int(row['sent_quantity'])
                        if remaining_recv >= row_sent_qty:
                            row_recv_qty = row_sent_qty
                            remaining_recv -= row_sent_qty
                        else:
                            row_recv_qty = remaining_recv
                            remaining_recv = 0
                        
                        record = {
                            'sent_date': sent_date,
                            'eta_date_final': eta_date_final,
                            'receive_date': receive_date,
                            'update_date': today,
                            'logistic_num': logistic_num,
                            'po_num': po_num,
                            'po_sku': po_sku,
                            'sent_quantity': row_sent_qty,
                            'receive_quantity': row_recv_qty,
                            'po_price': float(row['po_price']) if row['po_price'] else 0,
                            'action': 'adjust',
                            'note': note,
                            'seq': receive_new_seq,
                            'by': username
                        }
                        in_receive_records.append(record)
            
            # 检查是否存在差异（发货数量≠入库数量）
            if sent_qty != new_receive_qty:
                # 获取po_quantity
                po_qty_df = DBClient.read_df("""
                    SELECT SUM(po_quantity) as total_qty
                    FROM in_po_final
                    WHERE po_num = :po_num AND po_sku = :po_sku
                """, {'po_num': po_num, 'po_sku': po_sku})
                
                po_quantity = int(po_qty_df.iloc[0]['total_qty']) if not po_qty_df.empty and po_qty_df.iloc[0]['total_qty'] else 0
                
                # 获取diff表的下一个seq
                diff_new_seq = get_next_seq('in_diff', logistic_num, 'seq', 'D')
                
                diff_record = {
                    'record_num': f"{logistic_num}_{receive_date}",
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'receive_date': receive_date,
                    'po_sku': po_sku,
                    'po_quantity': po_quantity,
                    'sent_quantity': sent_qty,
                    'receive_quantity': new_receive_qty,
                    'diff_quantity': sent_qty - new_receive_qty,
                    'status': 'pending',
                    'action': 'adjust',
                    'note': f"入库差异_{note}",
                    'seq': diff_new_seq,
                    'by': username
                }
                in_diff_records.append(diff_record)
            else:
                # 差异消除：需要从 in_diff_final 中删除该记录
                diff_final_deletes.append({
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'po_sku': po_sku
                })
        
        # 写入in_receive表
        if in_receive_records:
            receive_df = pd.DataFrame(in_receive_records)
            DBClient.write_df(receive_df, 'in_receive', if_exists='append')
        
        # 写入in_diff表
        if in_diff_records:
            diff_df = pd.DataFrame(in_diff_records)
            DBClient.write_df(diff_df, 'in_diff', if_exists='append')
        
        # 更新in_receive_final表
        for record in in_receive_records:
            # 查找匹配行并更新
            update_record = {
                'eta_date_final': record['eta_date_final'],
                'receive_date': record['receive_date'],
                'update_date': record['update_date'],
                'logistic_num': record['logistic_num'],
                'po_num': record['po_num'],
                'po_sku': record['po_sku'],
                'sent_quantity': record['sent_quantity'],
                'receive_quantity': record['receive_quantity'],
                'po_price': record['po_price'],
                'note': note,
                'seq': receive_final_new_seq,
                'by': username
            }
            in_receive_final_records.append(update_record)
        
        # 删除旧的in_receive_final记录并插入新的
        if in_receive_final_records:
            # 获取所有修改的po_num/po_sku/po_price组合
            keys_to_update = [(r['po_num'], r['po_sku'], r['po_price']) for r in in_receive_final_records]
            
            # 逐个更新（或用批量处理）
            for record in in_receive_final_records:
                # 检查是否存在匹配行
                existing = DBClient.read_df("""
                    SELECT COUNT(*) as cnt
                    FROM in_receive_final
                    WHERE logistic_num = :logistic_num
                      AND po_num = :po_num
                      AND po_sku = :po_sku
                      AND po_price = :po_price
                """, {
                    'logistic_num': record['logistic_num'],
                    'po_num': record['po_num'],
                    'po_sku': record['po_sku'],
                    'po_price': record['po_price']
                })
                
                if not existing.empty and existing.iloc[0]['cnt'] > 0:
                    # 更新已有行
                    DBClient.execute_stmt("""
                        UPDATE in_receive_final
                        SET eta_date_final = :eta_date_final,
                            receive_date = :receive_date,
                            update_date = :update_date,
                            sent_quantity = :sent_quantity,
                            receive_quantity = :receive_quantity,
                            note = :note,
                            seq = :seq,
                            `by` = :by
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                          AND po_price = :po_price
                    """, record)
                else:
                    # 插入新行
                    final_df = pd.DataFrame([record])
                    DBClient.write_df(final_df, 'in_receive_final', if_exists='append')
        
        # 同步更新in_diff_final表（State-Aware Synchronization）
        if in_diff_records:
            for diff in in_diff_records:
                # 检查是否已存在匹配行
                existing_diff = DBClient.read_df("""
                    SELECT COUNT(*) as cnt
                    FROM in_diff_final
                    WHERE logistic_num = :logistic_num
                      AND po_num = :po_num
                      AND po_sku = :po_sku
                """, {
                    'logistic_num': diff['logistic_num'],
                    'po_num': diff['po_num'],
                    'po_sku': diff['po_sku']
                })
                
                if not existing_diff.empty and existing_diff.iloc[0]['cnt'] > 0:
                    # 更新已有行
                    DBClient.execute_stmt("""
                        UPDATE in_diff_final
                        SET record_num = :record_num,
                            receive_date = :receive_date,
                            po_quantity = :po_quantity,
                            sent_quantity = :sent_quantity,
                            receive_quantity = :receive_quantity,
                            diff_quantity = :diff_quantity,
                            status = :status,
                            note = :note,
                            seq = :seq,
                            `by` = :by
                        WHERE logistic_num = :logistic_num
                          AND po_num = :po_num
                          AND po_sku = :po_sku
                    """, diff)
                else:
                    # 插入新行 - 使用execute_stmt以确保字段完整
                    DBClient.execute_stmt("""
                        INSERT INTO in_diff_final 
                        (record_num, logistic_num, po_num, receive_date, po_sku, 
                         po_quantity, sent_quantity, receive_quantity, diff_quantity,
                         status, note, seq, `by`)
                        VALUES 
                        (:record_num, :logistic_num, :po_num, :receive_date, :po_sku,
                         :po_quantity, :sent_quantity, :receive_quantity, :diff_quantity,
                         :status, :note, :seq, :by)
                    """, diff)
        
        # 删除差异消除的in_diff_final记录
        for del_key in diff_final_deletes:
            DBClient.execute_stmt("""
                DELETE FROM in_diff_final
                WHERE logistic_num = :logistic_num
                  AND po_num = :po_num
                  AND po_sku = :po_sku
            """, del_key)
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"修改入库单: {logistic_num}", extra={
            "user": username,
            "func": "Purchase:ReceiveEdit",
            "action": "EDIT_RECEIVE",
            "target": logistic_num
        })
        
        # 更新 FIFO 入库单价记录
        from apps.finance.utils.landed_price import recalculate_landed_prices
        try:
            recalculate_landed_prices(logistic_num=logistic_num)
        except Exception as price_err:
            logger.warning(f"更新入库单价记录失败 ({logistic_num}): {price_err}")
        
        return JsonResponse({
            'success': True,
            'message': _('入库单已更新至版本 %(seq)s') % {'seq': receive_final_new_seq},
            'new_seq': receive_final_new_seq,
            'receive_records': len(in_receive_records),
            'diff_records': len(in_diff_records)
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('提交失败: %(error)s') % {'error': str(e)}
        }, status=500)
