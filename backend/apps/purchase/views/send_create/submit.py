"""
新建发货单 - 提交API

[审计修复 2026-01-02]:
- P0-1: 添加数据库事务保护
- P1-1: 统一 check_perm 导入
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
import json
from datetime import date as dt_date
from django.utils.translation import gettext as _

from ..hub import check_perm
from core.services.security.policy_manager import SecurityPolicyManager
from core.components.db.client import DBClient
from apps.purchase.utils import extract_date_from_po_num

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_POST
def submit_send_api(request):
    """
    提交发货单
    Permission: module.purchase.send.add
    
    POST 参数:
        logistics: {date_sent, date_eta, logistic_num, pallets, total_weight, price_kg, total_price, usd_rmb}
        items: [{po_num, po_sku, send_quantity, is_rounded, sku_note}, ...]
        sec_code_l0, sec_code_l4: 安全验证码
    
    数据库写入顺序:
        1. in_send - 发货单主表
        2. in_send_list - 发货单明细表
        3. in_send_final - 发货单最终表（发货量>0的行）
        4. in_po - 采购订单表（规整时）
        5. in_po_final - 采购订单最终表（规整时）
    
    返回:
        {success: true, logistic_num: 'xxx'}
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    # 安全验证 - 从JSON中提取密码
    from core.services.security.policy_manager import SecurityPolicyManager
    
    required_tokens = SecurityPolicyManager.get_required_tokens('send_order_create')
    passwords = data.get('passwords', {})
    
    for token in required_tokens:
        meta = SecurityPolicyManager.TOKEN_MAP.get(token)
        if not meta:
            continue
        
        # 密码key格式: passwords中是 l0, l4 等
        # 需要转换: user -> l0, system -> l4 等
        level = meta['level'].lower()  # L0 -> l0
        input_val = passwords.get(level, '').strip()
        
        if not input_val:
            return JsonResponse({'success': False, 'message': _('安全验证失败: 缺少验证码: {label}').format(label=meta["label"])}, status=403)
        
        if not SecurityPolicyManager.validate_single_token(token, input_val, request):
            return JsonResponse({'success': False, 'message': _('安全验证失败: {label} 错误').format(label=meta["label"])}, status=403)
    
    logistics = data.get('logistics', {})
    items = data.get('items', [])
    
    try:
        import math
        
        username = request.user.username
        today = dt_date.today().strftime('%Y-%m-%d')
        
        # 处理物流数据
        date_sent = logistics.get('date_sent')
        date_eta = logistics.get('date_eta')
        logistic_num = str(logistics.get('logistic_num', '')).strip().upper()
        pallets = int(logistics.get('pallets', 0))
        total_weight = math.ceil(float(logistics.get('total_weight', 0)))  # 进一法取整
        price_kg = round(float(logistics.get('price_kg', 0)), 4)
        total_price = round(total_weight * price_kg, 5)
        usd_rmb = float(logistics.get('usd_rmb', 1.0))
        
        # 汇率获取方式: M=手动填写, A=自动获取
        is_manual_rate = logistics.get('is_manual_rate', False)
        rate_mode = 'M' if is_manual_rate else 'A'
        
        # P0-1: 使用事务包裹所有写入操作
        with DBClient.atomic_transaction() as conn:
            # =========================================================================
            # 1. 写入 in_send 表
            # =========================================================================
            DBClient.execute_stmt("""
            INSERT INTO in_send 
            (date_sent, logistic_num, price_kg, total_weight, total_price, usd_rmb, mode, date_eta, pallets, note, date_record, `by`, seq, created_at)
            VALUES 
            (:date_sent, :logistic_num, :price_kg, :total_weight, :total_price, :usd_rmb, :mode, :date_eta, :pallets, :note, :date_record, :by, 'V01', NOW())
        """, params={
            'date_sent': date_sent,
            'logistic_num': logistic_num,
            'price_kg': price_kg,
            'total_weight': total_weight,
            'total_price': total_price,
            'usd_rmb': usd_rmb,
            'mode': rate_mode,
            'date_eta': date_eta,
            'pallets': pallets,
            'note': '原始发货单',
            'date_record': today,
            'by': username
        })
        
        # =========================================================================
        # 2. 预处理：获取所有SKU的价格信息（包含价格位列）
        # =========================================================================
        # 构建查询条件
        po_nums = list(set([item.get('po_num', '') for item in items]))
        skus = list(set([item.get('po_sku', '') for item in items]))
        
        # 获取价格信息
        price_df = DBClient.read_df("""
            SELECT po_num, po_sku, po_price, po_quantity
            FROM in_po_final
            WHERE po_num IN :po_nums AND po_sku IN :skus
            ORDER BY po_num, po_sku, po_price DESC
        """, {'po_nums': tuple(po_nums) if po_nums else ('',), 'skus': tuple(skus) if skus else ('',)})
        
        # 构建价格映射 {(po_num, po_sku): [(price, qty), ...]} 按价格从高到低排序
        price_map = {}
        if not price_df.empty:
            for _idx, row in price_df.iterrows():
                key = (row['po_num'], row['po_sku'])
                if key not in price_map:
                    price_map[key] = []
                price_map[key].append({
                    'price': float(row['po_price']),
                    'qty': int(row['po_quantity'])
                })
        
        # =========================================================================
        # 3. 写入 in_send_list 和 in_send_final
        # =========================================================================
        po_change_items = []  # 记录需要规整的项
        
        for item in items:
            po_num = str(item.get('po_num', '')).strip()
            po_sku = str(item.get('po_sku', '')).strip().upper()
            send_quantity = int(item.get('send_quantity', 0))
            is_rounded = item.get('is_rounded', False)
            sku_note = str(item.get('sku_note', '')).strip()
            
            # 从备注中提取价格位列（如果有）
            price_position = 0
            if sku_note and '价格位列' in sku_note:
                try:
                    pos_str = sku_note.replace('价格位列', '').strip()
                    price_position = int(pos_str) - 1  # 转为0索引
                except:
                    price_position = 0
            
            # 获取价格
            key = (po_num, po_sku)
            item_price = 0.0
            if key in price_map and price_map[key]:
                if price_position < len(price_map[key]):
                    item_price = price_map[key][price_position]['price']
                else:
                    item_price = price_map[key][0]['price']  # 默认取第一个（最高价）
            
            # 写入 in_send_list
            DBClient.execute_stmt("""
                INSERT INTO in_send_list 
                (date, logistic_num, po_num, sku, quantity, price, action, note, `by`, po_change, seq, created_at)
                VALUES 
                (:date, :logistic_num, :po_num, :sku, :quantity, :price, 'new', :note, :by, :po_change, 'L01', NOW())
            """, params={
                'date': today,
                'logistic_num': logistic_num,
                'po_num': po_num,
                'sku': po_sku,
                'quantity': send_quantity,
                'price': item_price,
                'note': '原始发货单',
                'by': username,
                'po_change': 'Y' if is_rounded else 'N'
            })
            
            # 只有发货量>0的才写入 in_send_final
            if send_quantity > 0:
                DBClient.execute_stmt("""
                    INSERT INTO in_send_final 
                    (sent_date, sent_update_date, sent_logistic_num, po_num, po_sku, sent_quantity, po_price, sent_note, sent_seq, sent_by)
                    VALUES 
                    (:sent_date, :sent_update_date, :sent_logistic_num, :po_num, :po_sku, :sent_quantity, :po_price, :sent_note, :sent_seq, :sent_by)
                """, params={
                    'sent_date': date_sent,
                    'sent_update_date': today,
                    'sent_logistic_num': logistic_num,
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'sent_quantity': send_quantity,
                    'po_price': item_price,
                    'sent_note': '原始发货单',
                    'sent_seq': 'L01',
                    'sent_by': username
                })
            
            # 记录需要规整的项
            if is_rounded:
                po_change_items.append({
                    'po_num': po_num,
                    'po_sku': po_sku,
                    'price': item_price
                })
        
        # =========================================================================
        # 4. 处理规整（po_change='Y'的项）
        # =========================================================================
        for change_item in po_change_items:
            po_num = change_item['po_num']
            sku = change_item['po_sku']
            price = change_item['price']
            
            # 步骤1: 从in_po中获取原始订单数量和其他信息
            original_df = DBClient.read_df("""
                SELECT po_quantity, supplier_code, currency, usd_rmb
                FROM in_po
                WHERE po_num = :po_num AND po_sku = :sku AND po_price = :price
                ORDER BY seq DESC
                LIMIT 1
            """, {'po_num': po_num, 'sku': sku, 'price': price})
            
            if original_df.empty:
                continue  # 找不到原始订单，跳过
            
            original_qty = int(original_df.iloc[0]['po_quantity'])
            supplier_code = original_df.iloc[0]['supplier_code']
            currency = original_df.iloc[0]['currency']
            original_usd_rmb = float(original_df.iloc[0]['usd_rmb'])
            
            # 步骤2: 从in_send_final中计算已发货总量
            sent_df = DBClient.read_df("""
                SELECT COALESCE(SUM(sent_quantity), 0) as total_sent
                FROM in_send_final
                WHERE po_num = :po_num AND po_sku = :sku AND po_price = :price
            """, {'po_num': po_num, 'sku': sku, 'price': price})
            
            total_sent = int(sent_df.iloc[0]['total_sent']) if not sent_df.empty else 0
            
            # 步骤3: diff = 已发货总量
            diff = total_sent
            
            # 步骤4: 获取当前最大seq
            max_seq_df = DBClient.read_df("""
                SELECT MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_num
                FROM in_po
                WHERE po_num = :po_num
            """, {'po_num': po_num})
            
            max_num = 1
            if not max_seq_df.empty and max_seq_df.iloc[0]['max_num']:
                max_num = int(max_seq_df.iloc[0]['max_num'])
            new_seq = f"L{str(max_num + 1).zfill(2)}"
            
            adjust_note = f'物流单据规整操作_{logistic_num}'
            
            # 写入in_po表（adjust）
            DBClient.execute_stmt("""
                INSERT INTO in_po 
                (update_date, supplier_code, po_num, po_sku, po_quantity, po_price, currency, usd_rmb, `by`, action, note, seq)
                VALUES 
                (:update_date, :supplier_code, :po_num, :po_sku, :po_quantity, :po_price, :currency, :usd_rmb, :by, 'adjust', :note, :seq)
            """, params={
                'update_date': today,
                'supplier_code': supplier_code,
                'po_num': po_num,
                'po_sku': sku,
                'po_quantity': diff,
                'po_price': price,
                'currency': currency,
                'usd_rmb': original_usd_rmb,
                'by': username,
                'note': adjust_note,
                'seq': new_seq
            })
            
            # 步骤5: 从in_po读取最新记录，更新in_po_final
            # 查询该(po_num, po_sku, po_price)组合的最新记录
            # 注意: in_po没有po_date字段，但in_po_final有
            latest_po_df = DBClient.read_df("""
                SELECT update_date, po_quantity, note, seq, `by`
                FROM in_po 
                WHERE po_num = :po_num 
                  AND po_sku = :po_sku 
                  AND po_price = :po_price
                ORDER BY CAST(SUBSTRING(seq, 2) AS UNSIGNED) DESC
                LIMIT 1
            """, {
                'po_num': po_num,
                'po_sku': sku,
                'po_price': price
            })
            
            if not latest_po_df.empty:
                latest = latest_po_df.iloc[0]
                DBClient.execute_stmt("""
                    UPDATE in_po_final 
                    SET po_update_date = :po_update_date,
                        po_quantity = :po_quantity,
                        po_note = :po_note,
                        po_seq = :po_seq,
                        po_by = :po_by
                    WHERE po_num = :po_num 
                      AND po_sku = :po_sku
                      AND po_price = :po_price
                    LIMIT 1
                """, params={
                    'po_update_date': str(latest['update_date']) if latest['update_date'] else today,
                    'po_num': po_num,
                    'po_sku': sku,
                    'po_quantity': int(latest['po_quantity']) if latest['po_quantity'] else 0,
                    'po_price': price,
                    'po_note': latest['note'] or '',
                    'po_seq': latest['seq'] or new_seq,
                    'po_by': latest['by'] or username
                })
        
        # =========================================================================
        # 5. 清理po_quantity=0的记录
        # =========================================================================
        DBClient.execute_stmt("""
            DELETE FROM in_po_final WHERE po_quantity = 0
        """)
        
        # 记录审计日志
        from core.sys.logger import get_audit_logger
        audit_logger = get_audit_logger()
        audit_logger.info(f"新建发货单: {logistic_num}", extra={
            "user": username,
            "func": "Purchase:SendCreate",
            "action": "CREATE_SEND",
            "target": logistic_num
        })
        
        return JsonResponse({
            'success': True,
            'logistic_num': logistic_num,
            'message': _('发货单创建成功')
        })
        
    except Exception as e:
        logger.exception("操作失败")
        return JsonResponse({'success': False, 'message': _('提交失败: {error}').format(error=str(e))}, status=500)
