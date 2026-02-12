"""
发货单管理 - 货物明细修改API - 提交接口

[P0-1 拆分] 从 edit_items.py 提取的提交API
"""
import json
import logging
from datetime import date as date_type

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

from ...hub import check_perm
from core.components.db.client import DBClient
from apps.purchase.utils import extract_date_from_po_num
from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def submit_items_modification_api(request):
    """
    提交货物明细修改（同时可选提交物流参数修改）
    URL: POST /dashboard/purchase/api/send_mgmt/submit_items_modify/
    
    完整的数据库写入逻辑：
    1. in_send: 若物流参数有修改则写入
    2. in_send_list: 每个有变更的货物行写入
    3. in_send_final: 根据action进行add/adjust/delete
    4. in_po & in_po_final: 若po_change=Y则进行规整操作
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
        logistic_num = data.get('logistic_num', '').strip()
        items = data.get('items', [])
        note = data.get('note', '').strip()
        logistics = data.get('logistics', None)
        logistics_note = data.get('logistics_note', '').strip()
        
        if not logistic_num:
            return JsonResponse({'success': False, 'message': _('缺少物流单号')}, status=400)
        
        # ========== 0. 验证发货单存在并获取基础信息 ==========
        check_df = DBClient.read_df("""
            SELECT logistic_num, date_sent, mode,
                   MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_seq
            FROM in_send
            WHERE logistic_num = :logistic_num
            GROUP BY logistic_num, date_sent, mode
        """, {'logistic_num': logistic_num})
        
        if check_df.empty:
            return JsonResponse({'success': False, 'message': _('发货单不存在')}, status=404)
        
        date_sent = str(check_df.iloc[0]['date_sent']) if check_df.iloc[0]['date_sent'] else ''
        orig_mode = check_df.iloc[0]['mode'] or 'A'
        max_send_seq = int(check_df.iloc[0]['max_seq']) if check_df.iloc[0]['max_seq'] else 0
        
        # 获取in_send_list的最大seq
        list_seq_df = DBClient.read_df("""
            SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
            FROM in_send_list
            WHERE logistic_num = :logistic_num
        """, {'logistic_num': logistic_num})
        max_list_seq = int(list_seq_df.iloc[0]['max_num']) if not list_seq_df.empty and list_seq_df.iloc[0]['max_num'] else 0
        
        today = date_type.today().isoformat()
        operator = request.user.username
        
        # ========== 1. 写入in_send（若物流参数有修改） ==========
        logistics_updated = False
        new_send_seq = None
        if logistics:
            new_send_seq_num = max_send_seq + 1
            new_send_seq = f"S{str(new_send_seq_num).zfill(2)}"
            
            price_kg = float(logistics.get('price_kg', 0))
            total_weight = float(logistics.get('total_weight', 0))
            total_price = float(logistics.get('total_price', 0))
            usd_rmb = float(logistics.get('usd_rmb', 0))
            usd_rmb_manual = logistics.get('usd_rmb_manual', False)
            new_mode = 'M' if usd_rmb_manual else 'A'
            
            DBClient.execute_stmt("""
                INSERT INTO in_send 
                (logistic_num, date_sent, date_eta, pallets, total_weight, price_kg, total_price, usd_rmb, mode, seq, `by`, date_record, note)
                VALUES 
                (:logistic_num, :date_sent, :date_eta, :pallets, :total_weight, :price_kg, :total_price, :usd_rmb, :mode, :seq, :by_user, :date_record, :note)
            """, {
                'logistic_num': logistic_num,
                'date_sent': date_sent,
                'date_eta': logistics.get('date_eta', ''),
                'pallets': int(logistics.get('pallets', 0)),
                'total_weight': total_weight,
                'price_kg': price_kg,
                'total_price': total_price,
                'usd_rmb': usd_rmb,
                'mode': new_mode,
                'seq': new_send_seq,
                'by_user': operator,
                'date_record': today,
                'note': logistics_note or note or ''
            })
            logistics_updated = True
        
        # ========== 2. 写入in_send_list（每个有变更的货物行） ==========
        new_list_seq = None
        if items:
            # 计算新的list seq
            new_list_seq_num = max_list_seq + 1
            new_list_seq = f"L{str(new_list_seq_num).zfill(2)}"
            
            # 收集要写入的行
            list_records = []
            for item in items:
                po_num = item.get('po_num', '')
                po_sku = item.get('po_sku', '')
                po_price = float(item.get('po_price', 0))
                sent_qty = int(item.get('sent_qty', 0))
                is_adjusted = item.get('is_adjusted', False)
                is_deleted = item.get('is_deleted', False)
                is_new = item.get('is_new', False)
                
                if not po_num or not po_sku:
                    continue
                
                # 判断action
                # 单项删除统一使用 action='adjust', qty=0
                if is_deleted:
                    action = 'adjust'  # 统一使用adjust，qty=0表示删除
                elif is_new:
                    action = 'add'
                else:
                    action = 'adjust'
                
                # po_change: 规整开关状态
                po_change = 'Y' if is_adjusted else 'N'
                
                list_records.append({
                    'date': today,
                    'logistic_num': logistic_num,
                    'po_num': po_num,
                    'sku': po_sku,
                    'price': po_price,
                    'quantity': sent_qty if not is_deleted else 0,
                    'action': action,
                    'note': note,
                    'by_user': operator,
                    'seq': new_list_seq,
                    'po_change': po_change,
                    'is_deleted': is_deleted  # 保留标记供final表处理使用
                })
            
            # 批量写入in_send_list
            for rec in list_records:
                DBClient.execute_stmt("""
                    INSERT INTO in_send_list 
                    (date, logistic_num, po_num, sku, price, quantity, action, note, `by`, seq, po_change)
                    VALUES 
                    (:date, :logistic_num, :po_num, :sku, :price, :quantity, :action, :note, :by_user, :seq, :po_change)
                """, rec)
            
            # ========== 3. 更新in_send_final ==========
            # 先收集所有操作，然后一起执行
            final_inserts = []
            final_updates = []
            final_deletes = []
            
            for rec in list_records:
                action = rec['action']
                key = {
                    'logistic_num': rec['logistic_num'],
                    'po_num': rec['po_num'],
                    'po_sku': rec['sku'],
                    'po_price': rec['price']
                }
                
                if action == 'add':
                    final_inserts.append({
                        'sent_date': date_sent,
                        'update_date': today,
                        'logistic_num': rec['logistic_num'],
                        'po_num': rec['po_num'],
                        'po_sku': rec['sku'],
                        'sent_qty': rec['quantity'],
                        'po_price': rec['price'],
                        'note': rec['note'],
                        'seq': new_list_seq,
                        'by_user': operator
                    })
                elif action == 'adjust':
                    final_updates.append({
                        'sent_date': date_sent,
                        'update_date': today,
                        'logistic_num': rec['logistic_num'],
                        'po_num': rec['po_num'],
                        'po_sku': rec['sku'],
                        'sent_qty': rec['quantity'],
                        'po_price': rec['price'],
                        'note': rec['note'],
                        'seq': new_list_seq,
                        'by_user': operator
                    })
                elif rec.get('is_deleted'):
                    # 删除: action='adjust', qty=0，通过is_deleted标记识别
                    final_deletes.append(key)
            
            # 执行in_send_final删除
            for key in final_deletes:
                DBClient.execute_stmt("""
                    DELETE FROM in_send_final 
                    WHERE sent_logistic_num = :logistic_num 
                      AND po_num = :po_num 
                      AND po_sku = :po_sku 
                      AND ABS(po_price - :po_price) < 0.001
                """, key)
            
            # 执行in_send_final更新（删除后重新插入）
            for rec in final_updates:
                DBClient.execute_stmt("""
                    DELETE FROM in_send_final 
                    WHERE sent_logistic_num = :logistic_num 
                      AND po_num = :po_num 
                      AND po_sku = :po_sku 
                      AND ABS(po_price - :po_price) < 0.001
                """, {
                    'logistic_num': rec['logistic_num'],
                    'po_num': rec['po_num'],
                    'po_sku': rec['po_sku'],
                    'po_price': rec['po_price']
                })
                DBClient.execute_stmt("""
                    INSERT INTO in_send_final 
                    (sent_date, sent_update_date, sent_logistic_num, po_num, po_sku, sent_quantity, po_price, sent_note, sent_seq, sent_by)
                    VALUES
                    (:sent_date, :update_date, :logistic_num, :po_num, :po_sku, :sent_qty, :po_price, :note, :seq, :by_user)
                """, rec)
            
            # 执行in_send_final新增
            for rec in final_inserts:
                DBClient.execute_stmt("""
                    INSERT INTO in_send_final 
                    (sent_date, sent_update_date, sent_logistic_num, po_num, po_sku, sent_quantity, po_price, sent_note, sent_seq, sent_by)
                    VALUES
                    (:sent_date, :update_date, :logistic_num, :po_num, :po_sku, :sent_qty, :po_price, :note, :seq, :by_user)
                """, rec)
            
            # ========== 4. 处理规整操作（po_change=Y的行） ==========
            po_adjustments = [r for r in list_records if r['po_change'] == 'Y' and not r.get('is_deleted')]
            
            for rec in po_adjustments:
                po_num = rec['po_num']
                po_sku = rec['sku']
                po_price = rec['price']
                new_quantity = rec['quantity']  # 用发货量作为新的订货量
                
                # 查找in_po中最大seq的记录
                orig_po_df = DBClient.read_df("""
                    SELECT supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb,
                           CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
                    FROM in_po
                    WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                    ORDER BY seq_num DESC
                    LIMIT 1
                """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
                
                if orig_po_df.empty:
                    continue  # 找不到订单记录则跳过
                
                orig_po = orig_po_df.iloc[0]
                
                # 计算新的in_po seq
                po_seq_df = DBClient.read_df("""
                    SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                    FROM in_po
                    WHERE po_num = :po_num
                """, {'po_num': po_num})
                max_po_seq = int(po_seq_df.iloc[0]['max_num']) if not po_seq_df.empty and po_seq_df.iloc[0]['max_num'] else 0
                new_po_seq = f"L{str(max_po_seq + 1).zfill(2)}"
                
                # 获取po_date（从po_num提取，同一po_num下恒定不变）
                po_date_from_num = extract_date_from_po_num(po_num)
                
                # 写入in_po (注意: in_po 没有 po_date 列)
                DBClient.execute_stmt("""
                    INSERT INTO in_po 
                    (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, action, note, seq)
                    VALUES 
                    (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by_user, :action, :note, :seq)
                """, {
                    'update_date': today,
                    'supplier_code': orig_po['supplier_code'] or '',
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'po_quantity': new_quantity,
                    'po_price': po_price,
                    'currency': orig_po['currency'] or 'USD',
                    'usd_rmb': float(orig_po['usd_rmb']) if orig_po['usd_rmb'] else 0,
                    'by_user': operator,
                    'action': 'adjust',
                    'note': f'规整订单_物流单据规整操作_{logistic_num}_{note}',
                    'seq': new_po_seq
                })
                
                # 更新in_po_final
                if new_quantity > 0:
                    # 先获取原始po_date（必须在DELETE前获取！）
                    orig_final_df = DBClient.read_df("""
                        SELECT po_date FROM in_po_final
                        WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                        LIMIT 1
                    """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
                    
                    # 如果没有原始记录，使用从po_num提取的日期
                    if not orig_final_df.empty and orig_final_df.iloc[0]['po_date']:
                        po_date = str(orig_final_df.iloc[0]['po_date'])
                    else:
                        po_date = po_date_from_num
                    
                    # 再删除旧记录
                    DBClient.execute_stmt("""
                        DELETE FROM in_po_final 
                        WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                    """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
                    
                    DBClient.execute_stmt("""
                        INSERT INTO in_po_final 
                        (po_date, po_update_date, po_num, po_sku, po_quantity, po_price, po_note, po_seq, po_by)
                        VALUES 
                        (:po_date, :update_date, :po_num, :po_sku, :po_quantity, :po_price, :note, :seq, :by_user)
                    """, {
                        'po_date': po_date,
                        'update_date': today,
                        'po_num': po_num,
                        'po_sku': po_sku,
                        'po_quantity': new_quantity,
                        'po_price': po_price,
                        'note': f'规整订单_物流单据规整操作_{logistic_num}_{note}',
                        'seq': new_po_seq,
                        'by_user': operator
                    })
                else:
                    # 若po_quantity为0，删除该行
                    DBClient.execute_stmt("""
                        DELETE FROM in_po_final 
                        WHERE po_num = :po_num AND po_sku = :po_sku AND ABS(po_price - :po_price) < 0.001
                    """, {'po_num': po_num, 'po_sku': po_sku, 'po_price': po_price})
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"修改发货单货物: {logistic_num}", extra={
            "user": request.user.username,
            "func": "Purchase:SendEditItems",
            "action": "EDIT_SEND_ITEMS",
            "target": logistic_num
        })
        
        return JsonResponse({
            'success': True,
            'message': _('发货单修改成功'),
            'data': {
                'logistic_num': logistic_num,
                'new_seq': new_send_seq or new_list_seq if items else None,
                'logistics_updated': logistics_updated,
                'items_count': len(items) if items else 0
            }
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({
            'success': False,
            'message': _('提交修改失败: {error}').format(error=str(e))
        }, status=500)
