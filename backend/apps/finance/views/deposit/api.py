# File: backend/apps/finance/views/deposit/api.py
"""
定金付款管理 API
Features:
- 订单定金列表展示
- 付款状态显示
- 批量付款功能
"""
import re
import logging
from decimal import Decimal
import pandas as pd

from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _
from django.views.decorators.http import require_GET, require_POST
import json
from datetime import datetime
import os
from pathlib import Path
from django.conf import settings

from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
def deposit_page(request):
    """定金付款管理页面"""
    return render(request, 'finance/pages/deposit.html')


@login_required(login_url='web_ui:login')
@require_GET
def deposit_list_api(request):
    """
    获取定金付款列表
    URL: /dashboard/finance/deposit/api/list/
    
    列表显示字段:
    - 订货单号: in_po_final 表里的每一个唯一的 po_num
    - 订单日期: 从 po_num 中解析出来的 YYYY-MM-DD
    - 订单SKU数: 该 po_num 在 in_po_final 中所有 unique 的 po_sku 数量
    - 订单总金额: po_price * po_quantity 的总和
    - 结算货币: in_po_strategy 中 seq 最大的 cur_currency
    - 结算汇率: in_po_strategy 中 seq 最大的 cur_usd_rmb
    - 定金比例和费用: cur_deposit_par; 订单总金额 * 比例
    - 实际支付定金金额: in_pmt_deposit_final 中 dep_paid 的总和
    - 定金待付: 定金费用 - 实际支付定金金额
    - 尾款剩余: 订单总金额 - 实际支付定金金额
    """
    try:
        sort_by = request.GET.get('sort_by', 'po_date')
        sort_order = request.GET.get('sort_order', 'desc')
        
        # Step 1: 获取所有唯一 po_num 及其策略信息（只取 seq 最大的）
        # 过滤掉 cur_deposit = 0 的
        strategy_sql = """
        SELECT 
            s.po_num,
            s.cur_currency,
            s.cur_usd_rmb,
            s.cur_deposit_par,
            s.cur_deposit,
            s.cur_float,
            s.cur_mode,
            CAST(SUBSTRING(s.seq, 2) AS UNSIGNED) as seq_num
        FROM in_po_strategy s
        INNER JOIN (
            SELECT po_num, MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_seq
            FROM in_po_strategy
            GROUP BY po_num
        ) latest ON s.po_num = latest.po_num 
            AND CAST(SUBSTRING(s.seq, 2) AS UNSIGNED) = latest.max_seq
        WHERE s.cur_deposit > 0
        """
        strategy_df = DBClient.read_df(strategy_sql)
        
        if strategy_df.empty:
            return JsonResponse({'success': True, 'data': [], 'count': 0})
        
        po_nums = strategy_df['po_num'].tolist()
        
        # 获取供应商信息（通过订单号前2位匹配）
        supplier_codes = list(set([po[:2] for po in po_nums if len(po) >= 2]))
        supplier_map = {}
        if supplier_codes:
            supplier_sql = """
                SELECT supplier_code, supplier_name
                FROM in_supplier
                WHERE supplier_code IN :codes
            """
            supplier_df = DBClient.read_df(supplier_sql, {'codes': tuple(supplier_codes)})
            for _idx, row in supplier_df.iterrows():
                supplier_map[row['supplier_code']] = row['supplier_name']
        
        # 构建策略映射
        strategy_map = {}
        for _idx, row in strategy_df.iterrows():
            po_num = row['po_num']
            supplier_code = po_num[:2] if len(po_num) >= 2 else ''
            strategy_map[po_num] = {
                'cur_currency': row['cur_currency'],
                'cur_usd_rmb': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 7.0,
                'cur_deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0.0,
                'cur_float': bool(row['cur_float']) if row['cur_float'] else False,
                'cur_mode': row['cur_mode'] if row['cur_mode'] else 'M',
                'supplier_code': supplier_code,
                'supplier_name': supplier_map.get(supplier_code, supplier_code),
            }
        
        # Step 2: 获取订单明细统计（SKU数和总金额）
        order_stats_sql = """
        SELECT 
            po_num,
            COUNT(DISTINCT po_sku) as sku_count,
            SUM(po_price * po_quantity) as total_amount
        FROM in_po_final
        WHERE po_num IN :po_nums
        GROUP BY po_num
        """
        order_df = DBClient.read_df(order_stats_sql, {'po_nums': tuple(po_nums)})
        
        order_map = {}
        for _idx, row in order_df.iterrows():
            order_map[row['po_num']] = {
                'sku_count': int(row['sku_count']) if row['sku_count'] else 0,
                'total_amount': float(row['total_amount']) if row['total_amount'] else 0.0,
            }
        
        # Step 3: 获取实际支付定金信息（含抵扣金额）
        # Step 3: 获取实际支付定金信息（含抵扣金额）
        payment_sql = """
        SELECT 
            po_num,
            dep_cur,
            dep_paid,
            dep_paid_cur,

            pmt_no,
            dep_date,
            dep_cur_mode,
            dep_prepay_amount,
            dep_override,
            extra_amount,
            extra_cur
        FROM in_pmt_deposit_final
        WHERE po_num IN :po_nums
        ORDER BY dep_date DESC, pmt_no DESC
        """
        payment_df = DBClient.read_df(payment_sql, {'po_nums': tuple(po_nums)})
        
        # Step 3.5 获取最近支付日期
        latest_date_sql = """
        SELECT po_num, MAX(dep_date) as latest_date
        FROM in_pmt_deposit_final
        WHERE po_num IN :po_nums
        GROUP BY po_num
        """
        latest_date_df = DBClient.read_df(latest_date_sql, {'po_nums': tuple(po_nums)})
        latest_date_map = {}
        for _idx, row in latest_date_df.iterrows():
            if row['latest_date']:
                # Ensure date object is converted to string if it's not already
                d = row['latest_date']
                if hasattr(d, 'strftime'):
                    latest_date_map[row['po_num']] = d.strftime('%Y-%m-%d')
                else:
                    latest_date_map[row['po_num']] = str(d)
        
        # 按 po_num 分组计算实际支付总额（需要统一货币）
        payment_map = {}
        for _idx, row in payment_df.iterrows():
            po_num = row['po_num']
            dep_cur = row['dep_cur'] or 'RMB'
            dep_paid = float(row['dep_paid']) if row['dep_paid'] else 0.0
            dep_paid_cur = float(row['dep_paid_cur']) if row['dep_paid_cur'] else 7.0
            dep_prepay_amount = float(row['dep_prepay_amount']) if row['dep_prepay_amount'] else 0.0
            dep_override = int(row['dep_override']) if row['dep_override'] else 0
            
            if po_num not in payment_map:
                payment_map[po_num] = []
            
            # Format date
            dep_date_str = ''
            if row['dep_date']:
                d = row['dep_date']
                dep_date_str = d.strftime('%Y-%m-%d') if hasattr(d, 'strftime') else str(d)

            payment_map[po_num].append({
                'pmt_no': row['pmt_no'],
                'dep_date': dep_date_str,
                'dep_cur': dep_cur,
                'dep_paid': dep_paid,
                'dep_paid_cur': dep_paid_cur,
                'dep_cur_mode': row['dep_cur_mode'] or 'M',
                'dep_prepay_amount': dep_prepay_amount,  # 抵扣金额
                'dep_override': dep_override,  # 覆盖标志
                'extra_amount': float(row['extra_amount']) if row['extra_amount'] else 0.0,
                'extra_cur': row['extra_cur'] or ''
            })

        
        # Step 4: 构建返回数据
        orders = []
        for po_num in po_nums:
            strategy = strategy_map.get(po_num, {})
            order_stats = order_map.get(po_num, {})
            payments = payment_map.get(po_num, [])
            
            # 解析订单日期 (格式: AAYYYYMMDD-S##)
            po_date = parse_po_date(po_num)
            
            # 订单统计
            sku_count = order_stats.get('sku_count', 0)
            total_amount = order_stats.get('total_amount', 0.0)
            
            # 策略信息
            cur_currency = strategy.get('cur_currency', 'USD')
            cur_usd_rmb = strategy.get('cur_usd_rmb', 7.0)
            deposit_par = strategy.get('cur_deposit_par', 0.0)
            is_float = strategy.get('cur_float', False)
            cur_mode = strategy.get('cur_mode', 'M')
            
            rate_source = '自动' if cur_mode == 'A' else '手动'
            rate_source_code = 'AUTO' if cur_mode == 'A' else 'MANUAL'
            
            # 定金费用计算 (deposit_par 是百分比值，如 30 表示 30%，需要除以 100)
            deposit_amount = total_amount * (deposit_par / 100)
            
            # 如果结算货币是 RMB，需要折算 USD
            if cur_currency == 'RMB':
                deposit_amount_usd = deposit_amount / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
                deposit_amount_rmb = deposit_amount
                total_amount_usd = total_amount / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
                total_amount_rmb = total_amount
            else:
                deposit_amount_usd = deposit_amount
                deposit_amount_rmb = deposit_amount * cur_usd_rmb
                total_amount_usd = total_amount
                total_amount_rmb = total_amount * cur_usd_rmb
            
            # 计算实际支付定金总额（统一为结算货币）
            # 包括：现金支付 (dep_paid) + 预付款抵扣 (dep_prepay_amount)
            actual_paid = 0.0
            actual_paid_usd = 0.0
            total_prepay_deducted = 0.0  # 总抵扣金额（结算货币）
            total_prepay_deducted_usd = 0.0  # 总抵扣金额（USD）

            total_extra_fees_usd = 0.0 # 额外费用总和（USD）
            total_extra_fees_rmb = 0.0 # 额外费用总和（RMB）
            has_override = False

            for pmt in payments:
                pmt_cur = pmt['dep_cur']
                pmt_amount = pmt['dep_paid']  # 现金支付
                pmt_rate = pmt['dep_paid_cur']
                prepay_amount = pmt.get('dep_prepay_amount', 0.0)  # 抵扣金额
                extra_amt = pmt.get('extra_amount', 0.0)
                extra_cur = pmt.get('extra_cur', '')
                
                # --- Calculate Extra Fees in USD and RMB ---
                if extra_amt > 0:
                    if extra_cur == 'USD':
                        total_extra_fees_usd += extra_amt
                        # Convert partial to RMB
                        current_rate = pmt_rate if pmt_rate > 0 else cur_usd_rmb
                        total_extra_fees_rmb += extra_amt * current_rate
                    else:
                        # Extra fee is non-USD (presumably RMB)
                        total_extra_fees_rmb += extra_amt
                        
                        # Convert to USD using the payment's exchange rate (dep_paid_cur)
                        # Typically dep_paid_cur is RMB->USD rate (e.g. 7.0)
                        total_extra_fees_usd += extra_amt / pmt_rate if pmt_rate > 0 else 0.0

                # 检查是否存在 override 记录
                if pmt.get('dep_override', 0) == 1:
                    has_override = True

                # 现金支付部分
                if pmt_cur == cur_currency:
                    # 货币相同，直接累加
                    actual_paid += pmt_amount
                else:
                    # 货币不同，需要换算
                    if cur_currency == 'USD':
                        # 结算货币是 USD，付款是 RMB，需除以汇率
                        actual_paid += pmt_amount / pmt_rate if pmt_rate > 0 else 0.0
                    else:
                        # 结算货币是 RMB，付款是 USD，需乘以汇率
                        actual_paid += pmt_amount * pmt_rate
                
                # 统一计算 USD 金额（现金部分）
                if pmt_cur == 'USD':
                    actual_paid_usd += pmt_amount
                else:
                    actual_paid_usd += pmt_amount / pmt_rate if pmt_rate > 0 else 0.0
                
                # 抵扣金额（预付款余额抵扣，按结算货币计）
                # Note: 抵扣金额已按结算货币存储，直接累加
                actual_paid += prepay_amount
                total_prepay_deducted += prepay_amount
                
                # 抵扣金额折算为 USD
                if cur_currency == 'USD':
                    actual_paid_usd += prepay_amount
                    total_prepay_deducted_usd += prepay_amount
                else:
                    prepay_usd = prepay_amount / pmt_rate if pmt_rate > 0 else 0.0
                    actual_paid_usd += prepay_usd
                    total_prepay_deducted_usd += prepay_usd
            
            # 定金待付
            deposit_pending = deposit_amount - actual_paid
            deposit_pending_usd = deposit_amount_usd - actual_paid_usd
            
            # 尾款剩余
            balance_remaining = total_amount - actual_paid
            if cur_currency == 'RMB':
                balance_remaining_usd = balance_remaining / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
            else:
                balance_remaining_usd = balance_remaining
            
            # 付款状态判定
            # 条件1：定金待付 <= 0 (允许误差 0.01)
            # 条件2：存在 dep_override == 1 的记录
            if abs(deposit_pending) < 0.01 or has_override:
                payment_status = '已付款'
                is_paid = True
            elif actual_paid == 0:
                payment_status = '未付款'
                is_paid = False
            else:
                payment_status = '部分付款'
                is_paid = False
            
            orders.append({
                'po_num': po_num,
                'po_date': po_date,
                'sku_count': sku_count,
                'total_amount': round(total_amount, 5),
                'total_amount_usd': round(total_amount_usd, 5),
                'total_amount_rmb': round(total_amount_rmb, 5),
                'cur_currency': cur_currency,
                'cur_usd_rmb': round(cur_usd_rmb, 4),
                'rate_source': rate_source,
                'rate_source_code': rate_source_code,
                'deposit_par': round(deposit_par, 1),  # 已经是百分比值
                'deposit_amount': round(deposit_amount, 5),
                'deposit_amount_usd': round(deposit_amount_usd, 5),
                'deposit_amount_rmb': round(deposit_amount_rmb, 5),
                'actual_paid': round(actual_paid, 5),  # 已付总额（现金+抵扣）
                'actual_paid_usd': round(actual_paid_usd, 5),
                'prepay_deducted': round(total_prepay_deducted, 5),  # 抵扣金额（结算货币）
                'prepay_deducted_usd': round(total_prepay_deducted_usd, 5),  # 抵扣金额（USD）
                'deposit_pending': round(deposit_pending, 5),
                'deposit_pending_usd': round(deposit_pending_usd, 5),
                'balance_remaining': round(balance_remaining, 5),
                'balance_remaining_usd': round(balance_remaining_usd, 5),
                'payment_status': payment_status,
                'is_paid': is_paid,
                'supplier_code': strategy.get('supplier_code', ''),
                'supplier_name': strategy.get('supplier_name', ''),
                'latest_payment_date': latest_date_map.get(po_num, '-'),
                'extra_fees_usd': round(total_extra_fees_usd, 5),
                'extra_fees_rmb': round(total_extra_fees_rmb, 5),
                'payment_details': payments, # List of detailed payment records
            })

        
        # Step 5: 排序
        sort_key_map = {
            'po_num': lambda x: x['po_num'],
            'po_date': lambda x: x['po_date'] or '',
        }
        if sort_by in sort_key_map:
            orders.sort(key=sort_key_map[sort_by], reverse=(sort_order == 'desc'))
        
        return JsonResponse({
            'success': True,
            'data': orders,
            'count': len(orders)
        })
        
    except Exception as e:
        logger.exception("获取定金付款列表失败")
        return JsonResponse({
            'success': False,
            'message': _('获取定金付款列表失败: {error}').format(error=str(e))
        }, status=500)


def parse_po_date(po_num: str) -> str:
    """
    从 po_num 中解析日期
    格式: AAYYYYMMDD-S## (A为字母, ##为数字)
    返回: YYYY-MM-DD
    """
    try:
        # 匹配: 2个字母 + 8位日期 + 可选的后缀
        match = re.match(r'^[A-Za-z]{2}(\d{4})(\d{2})(\d{2})', po_num)
        if match:
            year, month, day = match.groups()
            return f"{year}-{month}-{day}"
        return ''
    except Exception:
        return ''


@login_required(login_url='web_ui:login')
@require_POST
def deposit_payment_submit(request):
    """
    提交定金付款
    URL: /dashboard/finance/deposit/api/submit/
    
    写入规则:
    1. in_pmt_deposit: 每个 po_num 一行，pmt_no = DPMT_{dep_date}_N##
    2. in_pmt_prepay: 仅在 dep_prepay_amount > 0 时写入
    """
    try:
        # --- Parse Request Body FIRST ---
        data = json.loads(request.body)
        
        # --- Security Gating (per 密码策略.md V5.3) ---
        # Standard pattern: inject security codes from JSON body to request.POST
        # This is required because SecurityPolicyManager reads from request.POST
        from apps.purchase.utils import inject_security_codes_to_post
        inject_security_codes_to_post(request, data)
        
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'deposit_payment_submit')
        if not is_valid:
            logger.warning(f"[DepositPayment] Security check failed: {msg}")
            return JsonResponse({'status': 'error', 'success': False, 'message': msg}, status=403)
        logger.info(f"[DepositPayment] Received request data keys: {data.keys()}")
        logger.info(f"[DepositPayment] po_nums: {data.get('po_nums', [])}")
        logger.info(f"[DepositPayment] items count: {len(data.get('items', []))}")
        
        po_nums = data.get('po_nums', [])
        payment_date = data.get('payment_date', datetime.now().strftime('%Y-%m-%d'))
        use_payment_date_rate = data.get('use_payment_date_rate', False)
        settlement_rate = data.get('settlement_rate', 0)
        
        # Items Payload (Custom Amounts & Prepay Usage)
        items_payload = data.get('items', [])
        item_map = { str(i.get('po_num')): i for i in items_payload }
        
        # Extra Fee Data (仅附加到第一条记录)
        extra_fee = float(data.get('extra_fee', 0) or 0)
        extra_fee_currency = data.get('extra_fee_currency', '')
        extra_fee_note = data.get('extra_fee_note', '')
        
        if not po_nums:
            logger.warning("[DepositPayment] No po_nums in request!")
            return JsonResponse({
                'success': False,
                'message': _('请选择至少一个订单')
            }, status=400)
        
        # 获取操作用户名
        username = request.user.username if request.user.is_authenticated else 'system'

        
        # 查询每个订单的策略信息
        print(f"🔍 [DepositPayment] po_nums: {po_nums}")
        
        # 安全地构建 IN 子句
        po_nums_quoted = ", ".join([f"'{p}'" for p in po_nums])
        
        # Note: in_po_strategy 表没有 supplier_code 字段，从 po_num 前两位提取
        orders_sql = f"""
            SELECT 
                s.po_num,
                s.cur_currency,
                s.cur_usd_rmb,
                s.cur_deposit_par,
                LEFT(s.po_num, 2) as supplier_code,
                COALESCE(po_totals.total_amount, 0) as total_amount
            FROM (
                SELECT po_num, cur_currency, cur_usd_rmb, cur_deposit_par,
                       ROW_NUMBER() OVER (PARTITION BY po_num ORDER BY seq DESC) as rn
                FROM in_po_strategy
            ) s
            LEFT JOIN (
                SELECT po_num, SUM(po_price * po_quantity) as total_amount
                FROM in_po_final
                GROUP BY po_num
            ) po_totals ON po_totals.po_num = s.po_num
            WHERE s.rn = 1 AND s.po_num IN ({po_nums_quoted})
        """
        print(f"🔍 [DepositPayment] Executing SQL")
        orders_df = DBClient.read_df(orders_sql)
        print(f"🔍 [DepositPayment] Result: empty={orders_df.empty}")
        orders = orders_df.to_dict('records') if not orders_df.empty else []
        
        if not orders:
            debug_info = f"po_nums={po_nums}, df_empty={orders_df.empty}"
            logger.error(f"[DepositPayment] No orders found. Debug: {debug_info}")
            return JsonResponse({
                'success': False,
                'message': _('未找到订单信息 (DEBUG: {debug_info})').format(debug_info=debug_info)
            }, status=404)
        
        # 付款日期格式 (用于 tran_num 和 pmt_no)
        tran_date_str = payment_date.replace('-', '')  # YYYYMMDD
        
        # --- 生成 pmt_no: DPMT_{dep_date}_N## (批量共享) ---
        pmt_count_sql = """
            SELECT COUNT(*) as cnt FROM in_pmt_deposit 
            WHERE pmt_no LIKE :pattern
        """
        pmt_count_df = DBClient.read_df(pmt_count_sql, {'pattern': f'DPMT_{tran_date_str}_N%'})
        pmt_seq = (int(pmt_count_df.iloc[0]['cnt']) if not pmt_count_df.empty else 0) + 1
        pmt_no = f"DPMT_{tran_date_str}_N{pmt_seq:02d}"
        
        insert_count = 0
        prepay_insert_count = 0
        generated_pmt_nos = []
        
        # --- 计算平均额外费用（按订单数平分） ---
        order_count = len(orders)
        if extra_fee > 0 and order_count > 0:
            avg_extra_fee = extra_fee / order_count
        else:
            avg_extra_fee = 0
        
        for order in orders:
            po_num = order['po_num']
            supplier_code = order['supplier_code'] or (po_num[:2] if len(po_num) >= 2 else 'XX')
            order_currency = order['cur_currency'] or 'RMB'
            
            # 获取用户输入
            u_item = item_map.get(str(po_num), {})
            
            # --- 2. 确定汇率 ---
            rate = float(order['cur_usd_rmb'] or 7.0)
            if use_payment_date_rate and settlement_rate > 0:
                rate = float(settlement_rate)
            
            # --- 3. 确定汇率获取方式 ---
            dep_cur_mode = 'A' if use_payment_date_rate else 'M'
            
            # --- 4. 确定支付货币和金额 ---
            payment_mode = u_item.get('payment_mode', 'original')
            if payment_mode == 'custom':
                dep_cur = u_item.get('custom_currency', order_currency)
                dep_paid = float(u_item.get('custom_amount') or 0)
            else:
                # 原额模式：使用订单货币
                dep_cur = order_currency
                # 金额需要从前端传递的计算值获取（本次支付）
                # 这里先计算待付金额作为默认值
                total = float(order['total_amount'] or 0)
                deposit_par = float(order['cur_deposit_par'] or 30)
                deposit_amount = total * deposit_par / 100
                # 查询已付金额
                paid_sql = """
                    SELECT COALESCE(SUM(dep_paid), 0) as paid 
                    FROM in_pmt_deposit_final 
                    WHERE po_num = :po_num
                """
                paid_df = DBClient.read_df(paid_sql, {'po_num': po_num})
                actual_paid = float(paid_df.iloc[0]['paid']) if not paid_df.empty else 0
                dep_paid = max(0, deposit_amount - actual_paid)
            
            # --- 5. 确定抵扣金额 ---
            # 从前端传递的 allocated_deduction（使用订单货币）
            dep_prepay_amount = float(u_item.get('prepay_amount', 0) or 0)
            
            # --- 6. 确定覆盖标志 ---
            cover_std = u_item.get('cover_standard', False)
            dep_override = 1 if cover_std else 0
            
            # --- 7. 处理额外费用（平均分配到每个订单行） ---
            if avg_extra_fee > 0:
                cf_extra_note = extra_fee_note
                cf_extra_amount = avg_extra_fee
                cf_extra_cur = extra_fee_currency
            else:
                cf_extra_note = ''
                cf_extra_amount = 0
                cf_extra_cur = ''
            
            # --- 8. 跳过无效记录 ---
            if dep_paid <= 0.001 and dep_prepay_amount <= 0.001 and cf_extra_amount <= 0:
                continue
            
            # --- 9. 写入 in_pmt_deposit ---
            dep_sql = """
                INSERT INTO in_pmt_deposit (
                    pmt_no, po_num, dep_date, dep_cur, dep_paid_cur, dep_cur_mode,
                    dep_paid, dep_prepay_amount, dep_override,
                    extra_note, extra_amount, extra_cur, ops, seq, `by`, note, created_at
                ) VALUES (
                    :pmt_no, :po_num, :dep_date, :dep_cur, :dep_paid_cur, :dep_cur_mode,
                    :dep_paid, :dep_prepay_amount, :dep_override,
                    :extra_note, :extra_amount, :extra_cur, 'new', 'D01', :by, :note, NOW()
                )
            """
            DBClient.execute_stmt(dep_sql, {
                'pmt_no': pmt_no,
                'po_num': po_num,
                'dep_date': payment_date,
                'dep_cur': dep_cur,
                'dep_paid_cur': rate,
                'dep_cur_mode': dep_cur_mode,
                'dep_paid': dep_paid,
                'dep_prepay_amount': dep_prepay_amount,
                'dep_override': dep_override,
                'extra_note': cf_extra_note,
                'extra_amount': cf_extra_amount,
                'extra_cur': cf_extra_cur,
                'by': username,
                'note': '原始定金支付'
            })
            insert_count += 1
            if pmt_no not in generated_pmt_nos:
                generated_pmt_nos.append(pmt_no)
            
            # --- 10. 写入 in_pmt_prepay (仅当 dep_prepay_amount > 0) ---
            if dep_prepay_amount > 0.001:
                # 生成 tran_num: {supplier_code}_{YYYYMMDD}_{tran_type}_##
                tran_count_sql = """
                    SELECT COUNT(*) as cnt FROM in_pmt_prepay 
                    WHERE tran_num LIKE :pattern
                """
                tran_pattern = f"{supplier_code}_{tran_date_str}_out_%"
                tran_count_df = DBClient.read_df(tran_count_sql, {'pattern': tran_pattern})
                tran_seq = (int(tran_count_df.iloc[0]['cnt']) if not tran_count_df.empty else 0) + 1
                tran_num = f"{supplier_code}_{tran_date_str}_out_{tran_seq:02d}"
                
                # 获取供应商要求货币 (tran_curr_req)
                # 从 in_supplier_strategy 中查询 effective_date <= tran_date 且最近的一条
                curr_req_sql = """
                    SELECT currency 
                    FROM in_supplier_strategy 
                    WHERE supplier_code = :supplier_code 
                      AND effective_date <= :tran_date
                    ORDER BY effective_date DESC 
                    LIMIT 1
                """
                curr_req_df = DBClient.read_df(curr_req_sql, {
                    'supplier_code': supplier_code,
                    'tran_date': payment_date
                })
                tran_curr_req = curr_req_df.iloc[0]['currency'] if not curr_req_df.empty else 'RMB'
                
                # 写入 in_pmt_prepay
                prepay_sql = """
                    INSERT INTO in_pmt_prepay (
                        tran_num, supplier_code, tran_date, 
                        tran_curr_req, tran_curr_use, usd_rmb, tran_amount,
                        tran_type, tran_ops, tran_seq, tran_note, tran_curr_type, tran_by,
                        created_at
                    ) VALUES (
                        :tran_num, :supplier_code, :tran_date,
                        :tran_curr_req, :tran_curr_use, :usd_rmb, :tran_amount,
                        'out', 'new', 'T01', :tran_note, :tran_curr_type, :tran_by,
                        NOW()
                    )
                """
                DBClient.execute_stmt(prepay_sql, {
                    'tran_num': tran_num,
                    'supplier_code': supplier_code,
                    'tran_date': payment_date,
                    'tran_curr_req': tran_curr_req,
                    'tran_curr_use': order_currency,  # 订单结算货币
                    'usd_rmb': rate,
                    'tran_amount': dep_prepay_amount,
                    'tran_note': f'Deposit_{pmt_no}_原始支付单',
                    'tran_curr_type': dep_cur_mode,
                    'tran_by': username
                })
                prepay_insert_count += 1
                logger.info(f"[DepositPayment] Created prepay record {tran_num} for {pmt_no}")
        
        if insert_count == 0:
            return JsonResponse({
                'success': True,
                'message': _('没有产生付款记录 (金额为0)')
            })
        
        logger.info(f"[DepositPayment] Created {insert_count} deposit records, {prepay_insert_count} prepay records")
        
        # 更新 FIFO 入库单价记录
        from apps.finance.utils.landed_price import recalculate_landed_prices
        for po_num in po_nums:
            try:
                recalculate_landed_prices(po_num=po_num)
            except Exception as price_err:
                logger.warning(f"更新入库单价记录失败 ({po_num}): {price_err}")
        
        return JsonResponse({
            'success': True,
            'status': 'success',
            'message': _('付款成功，共 {count} 条记录').format(count=insert_count),
            'data': {
                'pmt_nos': generated_pmt_nos,
                'count': insert_count,
                'prepay_count': prepay_insert_count
            }
        })
        
    except json.JSONDecodeError:
        return JsonResponse({
            'success': False,
            'message': _('无效的请求数据')
        }, status=400)
    except Exception as e:
        logger.exception(f"[DepositPayment] Submit failed: {e}")
        return JsonResponse({
            'success': False,
            'message': _('付款失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def deposit_receipt_upload_api(request):
    """
    上传定金付款回执
    URL: /dashboard/finance/deposit/api/upload_receipt/
    Params: pmt_no
    File: payment_receipt
    """
    try:
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'deposit_receipt_upload')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)
        
        pmt_no = request.POST.get('pmt_no')
        file_obj = request.FILES.get('file')
        
        if not pmt_no:
            return JsonResponse({'success': False, 'message': _('缺少付款单号')}, status=400)
        if not file_obj:
            return JsonResponse({'success': False, 'message': _('未选择文件')}, status=400)
            
        # Parse Year from pmt_no 
        # pmt_no format: DPMT_YYYYMMDD_N## (e.g. DPMT_20260109_N01)
        # Try to extract YYYY from DPMT_YYYYMMDD pattern
        year_match = re.search(r'DPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        # Directory
        save_dir = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'deposit' / year / pmt_no
        save_dir.mkdir(parents=True, exist_ok=True)
        
        # Filename {pmt_no}_V##.{ext}
        ext = os.path.splitext(file_obj.name)[1].lower()
        allowed_exts = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.heic', '.heif', '.xls', '.xlsx', '.doc', '.docx', '.csv']
        if ext not in allowed_exts:
             return JsonResponse({'success': False, 'message': _('不支持的文件格式')}, status=400)
             
        # Versioning
        existing_files = list(save_dir.glob(f"*{ext}"))
        max_ver = 0
        for f in existing_files:
            v_match = re.search(r'_V(\d+)', f.name)
            if v_match:
                max_ver = max(max_ver, int(v_match.group(1)))
        
        next_ver = max_ver + 1
        new_filename = f"{pmt_no}_V{next_ver:02d}{ext}"
        
        save_path = save_dir / new_filename
        
        with open(save_path, 'wb+') as destination:
            for chunk in file_obj.chunks():
                destination.write(chunk)
                
        logger.info(f"[DepositPayment] Uploaded receipt {new_filename} for {pmt_no}")
        
        return JsonResponse({'success': True, 'message': _('上传成功'), 'data': {'filename': new_filename}})
        
    except Exception as e:
        logger.exception(f"上传失败: {e}")
        return JsonResponse({'success': False, 'message': _('上传失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_vendor_balance_api(request):
    """
    获取指定供应商的预付款余额 (Deposit Wizard 使用)
    
    URL: /dashboard/finance/deposit/api/vendor_balance/
    Query: supplier_code, payment_date (YYYY-MM-DD)
    """
    try:
        supplier_code = request.GET.get('supplier_code', '').strip()
        payment_date_str = request.GET.get('payment_date', '').strip()
        
        logger.info(f"[Deposit] get_vendor_balance_api called for code: {supplier_code}, date: {payment_date_str}")
        
        if not supplier_code:
            return JsonResponse({'success': False, 'error': _('缺少供应商代码')}, status=400)
            
        # 1. 获取供应商名称
        supp_sql = "SELECT supplier_name FROM in_supplier WHERE supplier_code = :code"
        supp_df = DBClient.read_df(supp_sql, {'code': supplier_code})
        supplier_name = supp_df.iloc[0]['supplier_name'] if not supp_df.empty else 'Unknown'
        
        # 2. 获取供应商结算货币 (Strategy) - 用于最终的 Display Tag
        curr_sql = """
            SELECT currency 
            FROM in_supplier_strategy 
            WHERE supplier_code = :code 
            ORDER BY effective_date DESC, id DESC 
            LIMIT 1
        """
        curr_df = DBClient.read_df(curr_sql, {'code': supplier_code})
        supplier_currency = curr_df.iloc[0]['currency'] if not curr_df.empty else 'RMB'
        
        # 3. 获取交易记录 (Include tran_date for filtering)
        # Note: We filter by date in Python (Post-Processing) or SQL? 
        # SQL is better. But DBClient uses string dict param.
        # SQLite/MySQL date comparison works on strings if format YYYY-MM-DD.
        
        sql = """
            SELECT tran_amount, tran_curr_use, tran_curr_req, usd_rmb, tran_type, tran_date
            FROM in_pmt_prepay_final
            WHERE supplier_code = :code
        """
        params = {'code': supplier_code}
        
        # Apply Date Filter Logic
        if payment_date_str:
            sql += " AND tran_date <= :pdate"
            params['pdate'] = payment_date_str
            
        df = DBClient.read_df(sql, params)
        logger.info(f"[Deposit] Found {len(df)} prepay records for {supplier_code} before {payment_date_str}")
        
        balance_base = Decimal('0.00') # Base currency (supplier_currency)
        balance_usd = Decimal('0.00')  # USD
        
        for index, row in df.iterrows():
            amount = Decimal(str(row['tran_amount']))
            curr_use = row['tran_curr_use']
            # Safeguard: Use row's req currency, fallback to current strategy
            curr_req = row['tran_curr_req'] if row['tran_curr_req'] else supplier_currency
            
            try:
                rate = Decimal(str(row['usd_rmb']))
            except:
                rate = Decimal('0.00')
                
            tran_type = row['tran_type']
            
            # --- Logic: Strict Double-Normalization ---
            # 1. Normalize Use -> Req (Establish Obligation Value)
            val_debt = Decimal('0.00')
            if curr_use == curr_req:
                val_debt = amount
            else:
                if curr_req == 'RMB': # Use=USD, Req=RMB
                    val_debt = amount * rate
                else: # Req=USD, Use=RMB
                    val_debt = amount / rate if rate > 0 else amount
            
            # 2. Normalize Req -> Base/Strategy (Establish Unified Display Balance)
            val_final_base = Decimal('0.00')
            if curr_req == supplier_currency:
                val_final_base = val_debt
            else:
                if supplier_currency == 'RMB': # Req=USD, Base=RMB
                    val_final_base = val_debt * rate
                else: # Req=RMB, Base=USD
                    val_final_base = val_debt / rate if rate > 0 else val_debt
            
            # 3. Calculate USD Equivalent (for secondary display)
            val_usd = Decimal('0.00')
            if curr_req == 'USD':
                val_usd = val_debt
            elif curr_req == 'RMB':
                val_usd = val_debt / rate if rate > 0 else amount # Default fallback

            # Apply +/- 
            if tran_type == 'in':
                balance_base += val_final_base
                balance_usd += val_usd
            elif tran_type == 'out':
                balance_base -= val_final_base
                balance_usd -= val_usd
                
        logger.info(f"[Deposit] Calculated Balance: Base={balance_base} ({supplier_currency}), USD={balance_usd}")

        return JsonResponse({
            'success': True,
            'data': {
                'supplier_code': supplier_code,
                'supplier_name': supplier_name,
                'currency': supplier_currency, 
                'balance_base': float(round(balance_base, 5)),
                'balance_usd': float(round(balance_usd, 5))
            }
        })

    except Exception as e:
        logger.exception(f"[Deposit] get_vendor_balance_api failed: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def deposit_file_list_api(request):
    """
    获取定金付款文件列表
    URL: /dashboard/finance/deposit/api/files/
    Query: identifier (pmt_no)
    """
    try:
        pmt_no = request.GET.get('identifier', '').strip()
        if not pmt_no:
            return JsonResponse({'success': False, 'message': 'Missing identifier'}, status=400)
            
        # Parse Year
        year_match = re.search(r'DPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        # Directory
        save_dir = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'deposit' / year / pmt_no
        
        files = []
        has_file = False
        latest_file = ''
        
        if save_dir.exists():
            # Get all files including versions
            # Naming: {pmt_no}_V##.{ext}
            all_files = sorted([f for f in save_dir.iterdir() if f.is_file()], key=lambda x: x.stat().st_mtime, reverse=True)
            
            for f in all_files:
                if not f.name.startswith(pmt_no):
                    continue
                    
                files.append({
                    'filename': f.name,
                    'size': f.stat().st_size,
                    'modified': datetime.fromtimestamp(f.stat().st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                })
            
            if files:
                has_file = True
                latest_file = files[0]['filename']
        
        return JsonResponse({
            'success': True,
            'data': {
                'has_file': has_file,
                'latest_file': latest_file,
                'files': files
            }
        })
        
    except Exception as e:
        logger.exception(f"[Deposit] File list failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def deposit_file_serve_api(request):
    """
    下载/预览定金付款文件
    URL: /dashboard/finance/deposit/api/serve_file/
    Query: identifier (pmt_no), filename
    """
    try:
        pmt_no = request.GET.get('identifier', '').strip()
        filename = request.GET.get('filename', '').strip()
        
        if not pmt_no or not filename:
            return JsonResponse({'success': False, 'message': 'Missing params'}, status=400)
            
        # Security check
        if not filename.startswith(pmt_no):
             return JsonResponse({'success': False, 'message': 'Invalid filename'}, status=403)
            
        # Parse Year
        year_match = re.search(r'DPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        file_path = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'deposit' / year / pmt_no / filename
        
        if not file_path.exists():
            return JsonResponse({'success': False, 'message': 'File not found'}, status=404)
            
        from django.http import FileResponse
        import mimetypes
        
        content_type, _ = mimetypes.guess_type(file_path)
        if not content_type:
            content_type = 'application/octet-stream'
            
        response = FileResponse(open(file_path, 'rb'), content_type=content_type)
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        response['X-Frame-Options'] = 'SAMEORIGIN'
        return response
        
    except Exception as e:
        logger.exception(f"[Deposit] Serve file failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def deposit_file_delete_api(request):
    """
    删除定金付款文件
    URL: /dashboard/finance/deposit/api/delete_file/
    Body: { pmt_no, filename }
    """
    try:
        data = json.loads(request.body)
        
        # 安全验证
        from apps.purchase.utils import inject_security_codes_to_post
        inject_security_codes_to_post(request, data)
        
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'deposit_receipt_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg}, status=403)
        
        pmt_no = data.get('pmt_no', '').strip()
        filename = data.get('filename', '').strip()
        
        if not pmt_no or not filename:
            return JsonResponse({'success': False, 'error': _('缺少参数')}, status=400)
        
        # Security check - filename must start with pmt_no
        if not filename.startswith(pmt_no):
            return JsonResponse({'success': False, 'error': _('非法文件名')}, status=403)
        
        # Parse Year from pmt_no (DPMT_YYYYMMDD_N##)
        year_match = re.search(r'DPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        # Build file path
        file_path = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'deposit' / year / pmt_no / filename
        
        if not file_path.exists():
            return JsonResponse({'success': False, 'error': _('文件不存在')}, status=404)
        
        # Path traversal check
        base_dir = Path(settings.BASE_DIR).parent / 'data' / 'records'
        if '..' in str(file_path) or not str(file_path.resolve()).startswith(str(base_dir.resolve())):
            return JsonResponse({'success': False, 'error': _('非法文件路径')}, status=403)
        
        # Delete file
        file_path.unlink()
        
        logger.info(f"[Deposit] Deleted file {filename} for {pmt_no}")
        
        return JsonResponse({
            'success': True,
            'message': _('文件删除成功')
        })
        
    except Exception as e:
        logger.exception(f"[Deposit] Delete file failed: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def deposit_orders_api(request):
    """
    获取付款批次关联的订单详情
    URL: /dashboard/finance/deposit/api/orders/
    Params: pmt_no
    """
    pmt_no = request.GET.get('pmt_no', '').strip()
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少付款单号')}, status=400)
    
    try:
        # 查询该付款批次的所有订单
        # 表: in_pmt_deposit_final
        # 字段: pmt_no, po_num, dep_date, dep_cur (定金总额), dep_paid (实付), dep_paid_cur (汇率), dep_prepay_amount (预付抵扣)
        query = """
            SELECT 
                dp.po_num,
                dp.dep_date as payment_date,
                dp.dep_cur,
                dp.dep_paid,
                dp.dep_paid_cur,
                dp.dep_prepay_amount
            FROM in_pmt_deposit_final dp
            WHERE dp.pmt_no = :pmt_no
            ORDER BY dp.po_num
        """
        df = DBClient.read_df(query, {'pmt_no': pmt_no})
        
        orders = []
        for _idx, row in df.iterrows():
            po_num = row['po_num']
            
            # 从 po_num 解析 supplier_code 和日期 (格式: XX20260103-S01)
            supplier_code = po_num[:2] if len(po_num) >= 2 else ''
            po_date = ''
            if len(po_num) >= 10:
                try:
                    ds = po_num[2:10]
                    po_date = f"{ds[:4]}-{ds[4:6]}-{ds[6:8]}"
                except:
                    pass
            
            dep_paid = float(row['dep_paid'] or 0)
            rate = float(row['dep_paid_cur'] or 1)
            prepay_used = float(row['dep_prepay_amount'] or 0)
            
            # Fetch currency and deposit percent from in_po_strategy (max seq)
            strategy_df = DBClient.read_df(
                "SELECT cur_currency, cur_deposit_par FROM in_po_strategy WHERE po_num = :po_num ORDER BY seq DESC LIMIT 1",
                {'po_num': po_num}
            )
            strategy_currency = strategy_df.iloc[0]['cur_currency'] if not strategy_df.empty else (row['dep_cur'] or 'RMB')
            strategy_percent = float(strategy_df.iloc[0]['cur_deposit_par']) if not strategy_df.empty and strategy_df.iloc[0]['cur_deposit_par'] else 0
            
            # Use strategy currency for display and logic
            currency = strategy_currency
            
            total_deposit = dep_paid + prepay_used
            
            if currency == 'USD':
                deposit_usd = total_deposit
                deposit_rmb = total_deposit * rate
            else:
                deposit_rmb = total_deposit
                deposit_usd = total_deposit / rate if rate > 0 else 0
            
            # Fetch order items
            detail_df = DBClient.read_df(
                "SELECT po_sku as sku, po_quantity as qty, po_price as unit_price FROM in_po_final WHERE po_num = :po_num",
                {'po_num': po_num}
            )
            
            items = []
            order_total_rmb = 0
            order_total_usd = 0
            
            for _idx, item_row in detail_df.iterrows():
                qty = int(item_row['qty']) if item_row['qty'] else 0
                unit_price = float(item_row['unit_price']) if item_row['unit_price'] else 0
                
                # Use same rate as deposit payment for consistency in display
                # or should we fetch strategy rate? Logistic uses strategy rate. 
                # But here we are viewing "Deposit Orders", maybe we should use the rate from the payment?
                # Actually, in Logistic, it fetches strategy rate for the item valuation. 
                # Let's simple use the payment rate here for now to avoid extra queries, or default if 0.
                item_rate = rate if rate > 0 else 7.0
                
                # Determine item currency - usually same as PO currency but allows mixed?
                # in_po_final has just price. in_po_strategy defines currency.
                # Assuming item currency matches 'currency' variable derived from in_pmt_deposit_final (dep_cur)
                
                if currency == 'USD':
                    val_usd = qty * unit_price
                    val_rmb = val_usd * item_rate
                else:
                    val_rmb = qty * unit_price
                    val_usd = val_rmb / item_rate
                
                order_total_rmb += val_rmb
                order_total_usd += val_usd
                
                items.append({
                    'sku': item_row['sku'],
                    'qty': qty,
                    'unit_price': unit_price,
                    'currency': currency,
                    'value_rmb': val_rmb,
                    'value_usd': val_usd
                })

            # Correctly calculate actual paid RMB based on payment currency context
            payment_currency = row['dep_cur'] or 'RMB'
            if payment_currency == 'USD':
                real_paid_rmb = dep_paid * rate
            else:
                real_paid_rmb = dep_paid

            orders.append({
                'po_num': po_num,
                'supplier_code': supplier_code,
                'po_date': po_date,
                'deposit_rmb': deposit_rmb,
                'deposit_usd': deposit_usd,
                'deposit_percent': strategy_percent,
                'currency': currency,
                'payment_date': row['payment_date'].strftime('%Y-%m-%d') if row['payment_date'] else '-',
                'exchange_rate': rate,
                'prepay_used_rmb': prepay_used,
                'actual_paid_rmb': real_paid_rmb,
                'items': items,
                'total_rmb': order_total_rmb,
                'total_usd': order_total_usd
            })
        
        return JsonResponse({
            'success': True,
            'data': {
                'orders': orders
            }
        })
        
    except Exception as e:
        logger.exception(f"[Deposit] Get orders failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def deposit_history_api(request):
    """
    获取定金历史修订记录
    URL: /dashboard/finance/deposit/api/history/
    Params: pmt_no, po_num (Required for context)
    """
    pmt_no = request.GET.get('pmt_no', '').strip()
    po_num = request.GET.get('po_num', '').strip()
    
    if not pmt_no or not po_num:
        return JsonResponse({'success': False, 'message': _('缺少付款单号或订单号')}, status=400)
    
    try:
        data = {
            'strategy_versions': [],
            'payment_versions': []
        }
        
        # --- 1. 策略修订记录 (in_po_strategy) ---
        # 字段: cur_currency, cur_deposit_par
        s_sql = """
            SELECT * FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY created_at ASC
        """
        logger.info(f"[DepositHistory] Querying strategy for po_num: '{po_num}'")
        s_df = DBClient.read_df(s_sql, {'po_num': po_num})
        logger.info(f"[DepositHistory] Found {len(s_df)} strategy records")
        
        strategy_history = []
        prev_s = None
        
        for _idx, row in s_df.iterrows():
            item = {
                'seq': row['seq'],
                'date_record': str(row.get('created_at', '-')), 
                'by_user': row.get('created_by', 'system'),
                'note': row.get('note', ''),
                'is_initial': prev_s is None,
                'changes': []
            }
            
            # Data snapshot for initial or changes
            curr_data = {
                'cur_currency': row.get('cur_currency'),
                'cur_float': int(row.get('cur_float') or 0),
                'cur_ex_float': float(row.get('cur_ex_float') or 0),
                'cur_deposit': int(row.get('cur_deposit') or 0),
                'cur_deposit_par': float(row.get('cur_deposit_par') or 0),
                'cur_usd_rmb': float(row.get('cur_usd_rmb') or 0),
                'cur_mode': row.get('cur_mode', 'A') # Default Auto
            }
            item['data'] = curr_data
            
            if prev_s:
                # Calculate diffs
                if curr_data['cur_currency'] != prev_s['cur_currency']:
                    item['changes'].append({
                        'field': '结算货币',
                        'old': prev_s['cur_currency'],
                        'new': curr_data['cur_currency']
                    })
                
                # Price Float (cur_float + cur_ex_float)
                if curr_data['cur_float'] != prev_s['cur_float']:
                     item['changes'].append({
                        'field': '价格浮动',
                        'old': '是' if prev_s['cur_float'] else '否',
                        'new': '是' if curr_data['cur_float'] else '否'
                    })
                elif curr_data['cur_float'] and abs(curr_data['cur_ex_float'] - prev_s['cur_ex_float']) > 0.01:
                     item['changes'].append({
                        'field': '价格浮动比例',
                        'old': f"{prev_s['cur_ex_float']}%",
                        'new': f"{curr_data['cur_ex_float']}%"
                    })

                # Rate Float / Deposit (cur_deposit + cur_deposit_par)
                if curr_data['cur_deposit'] != prev_s['cur_deposit']:
                     item['changes'].append({
                        'field': '汇率浮动', # As requested
                        'old': '是' if prev_s['cur_deposit'] else '否',
                        'new': '是' if curr_data['cur_deposit'] else '否'
                    })
                elif curr_data['cur_deposit'] and abs(curr_data['cur_deposit_par'] - prev_s['cur_deposit_par']) > 0.01:
                     item['changes'].append({
                        'field': '汇率浮动比例',
                        'old': f"{prev_s['cur_deposit_par']}%",
                        'new': f"{curr_data['cur_deposit_par']}%"
                    })

                # Settlement Rate (cur_usd_rmb)
                if abs(curr_data['cur_usd_rmb'] - prev_s['cur_usd_rmb']) > 0.0001:
                    item['changes'].append({
                        'field': '结算汇率',
                        'old': f"{prev_s['cur_usd_rmb']}",
                        'new': f"{curr_data['cur_usd_rmb']}"
                    })
            
            strategy_history.append(item)
            prev_s = curr_data
            
        data['strategy_versions'] = list(reversed(strategy_history)) # Show newest first
        
        # --- 2. 定金支付记录 (in_pmt_deposit) ---
        # 字段: dep_prepay_amount, dep_paid, dep_paid_cur (rate), dep_override, extra_note, extra_amount, extra_cur
        p_sql = """
            SELECT * FROM in_pmt_deposit
            WHERE pmt_no = :pmt_no AND po_num = :po_num
            ORDER BY seq ASC, created_at ASC
        """
        p_df = DBClient.read_df(p_sql, {'pmt_no': pmt_no, 'po_num': po_num})
        
        payment_history = []
        prev_p = None
        
        # Need strategy currency for prepay display currency label
        # Get the MAX strategy currency for the PO
        max_strat_sql = "SELECT cur_currency FROM in_po_strategy WHERE po_num = :po_num ORDER BY seq DESC LIMIT 1"
        max_strat_df = DBClient.read_df(max_strat_sql, {'po_num': po_num})
        strategy_currency = max_strat_df.iloc[0]['cur_currency'] if not max_strat_df.empty else 'RMB'
        
        for _idx, row in p_df.iterrows():
            # In in_pmt_deposit: 
            # dep_cur -> payment currency
            # dep_paid_cur -> exchange rate
            
            item = {
                'seq': row['seq'],
                'date_record': str(row.get('created_at', '-')),
                'by_user': row.get('by', 'system'),
                'note': row.get('note', ''),
                'is_initial': prev_p is None,
                'changes': []
            }
            
            curr_data = {
                'dep_prepay_amount': float(row.get('dep_prepay_amount') or 0),
                'dep_paid': float(row.get('dep_paid') or 0),
                'dep_cur': row.get('dep_cur') or 'RMB', # Payment Currency
                'dep_paid_cur': float(row.get('dep_paid_cur') or 1), # Exchange Rate
                'dep_override': int(row.get('dep_override') or 0),
                'extra_note': row.get('extra_note') or '',
                'extra_amount': float(row.get('extra_amount') or 0),
                'extra_cur': row.get('extra_cur') or '',
                'strategy_currency': strategy_currency # For prepay display
            }
            item['data'] = curr_data
            
            if prev_p:
                # Calculate diffs
                # Prepay
                if abs(curr_data['dep_prepay_amount'] - prev_p['dep_prepay_amount']) > 0.01:
                    item['changes'].append({
                        'field': f'预付款抵扣({strategy_currency})',
                        'old': f"{prev_p['dep_prepay_amount']}",
                        'new': f"{curr_data['dep_prepay_amount']}"
                    })
                
                # Payment
                # Check Amount
                if abs(curr_data['dep_paid'] - prev_p['dep_paid']) > 0.01:
                     item['changes'].append({
                        'field': f"定金支付({curr_data['dep_cur']})", # Use label as per request
                        'old': f"{prev_p['dep_paid']}",
                        'new': f"{curr_data['dep_paid']}"
                    })
                
                # Check Rate (dep_paid_cur)
                if abs(curr_data['dep_paid_cur'] - prev_p['dep_paid_cur']) > 0.0001:
                    item['changes'].append({
                        'field': '定金结算汇率',
                        'old': f"{prev_p['dep_paid_cur']}",
                        'new': f"{curr_data['dep_paid_cur']}"
                    })

                # Override
                if curr_data['dep_override'] != prev_p['dep_override']:
                     item['changes'].append({
                        'field': _('覆盖定金标准'),
                        'old': '是' if prev_p['dep_override'] else '否',
                        'new': '是' if curr_data['dep_override'] else '否'
                    })
                
                # Extra Fee
                # If note changed or amount changed
                if curr_data['extra_note'] != prev_p['extra_note']:
                     item['changes'].append({
                        'field': _('额外费用说明'),
                        'old': prev_p['extra_note'],
                        'new': curr_data['extra_note']
                    })
                
                if abs(curr_data['extra_amount'] - prev_p['extra_amount']) > 0.01 or curr_data['extra_cur'] != prev_p['extra_cur']:
                     # Combine amount and currency
                     old_str = f"{prev_p['extra_amount']} {prev_p['extra_cur']}"
                     new_str = f"{curr_data['extra_amount']} {curr_data['extra_cur']}"
                     item['changes'].append({
                        'field': _('额外费用'),
                        'old': old_str,
                        'new': new_str
                    })
            
            payment_history.append(item)
            prev_p = curr_data
            
        data['payment_versions'] = list(reversed(payment_history))
        
        return JsonResponse({'success': True, 'data': data})
        
    except Exception as e:
        logger.exception(f"[Deposit] History failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)

@login_required(login_url='web_ui:login')
@require_POST
def deposit_payment_delete_api(request):
    """
    删除定金付款记录
    URL: /dashboard/finance/deposit/api/delete/
    Params (JSON): pmt_no, sec_code_user
    """
    try:
        data = json.loads(request.body)
        pmt_no = data.get('pmt_no')
        
        if not pmt_no:
            return JsonResponse({'success': False, 'message': _('Missing pmt_no')}, status=400)
            
        # 1. Security Check (GlobalModal L0)
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'deposit_payment_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
            
        # 2. Check Impact Scope
        # Get all POs related to this pmt_no to verify consistent deletion scope if UI didn't prompt correctly
        # But actually backend just deletes ALL for this pmt_no as per request "该付款单号下所有po_num"
        
        with DBClient.atomic_transaction():
            # 3. Get current max records for each PO in this pmt_no
            # We need to logically delete them by inserting a new record with ops='delete'
            
            # Find all POs in this payment batch
            rows = DBClient.read_df(
                "SELECT * FROM in_pmt_deposit WHERE pmt_no = :pmt_no AND ops != 'delete'",
                {'pmt_no': pmt_no}
            )
            
            if rows.empty:
                 return JsonResponse({'success': False, 'message': _('Payments not found or already deleted')}, status=404)
            
            po_nums = rows['po_num'].unique().tolist()
            user = request.user.username
            
            # For each PO in this batch
            for po_num in po_nums:
                # Find the latest record for this (pmt_no, po_num) to clone
                # Use seq+1
                
                # Fetch latest record
                latest_sql = """
                    SELECT * FROM in_pmt_deposit 
                    WHERE pmt_no = :pmt_no AND po_num = :po_num 
                    ORDER BY seq DESC LIMIT 1
                """
                latest_df = DBClient.read_df(latest_sql, {'pmt_no': pmt_no, 'po_num': po_num})
                
                if latest_df.empty:
                    continue
                    
                row = latest_df.iloc[0].to_dict()
                
                # Generate new seq
                # Assuming seq is numeric int or formatted string?
                # Based on previous code: seq is likely "D01", "D02". Let's check format.
                # If int, just +1. If string, parse.
                # Looking at deposit_payment_submit: "seq": "D01"
                # So we need a helper or just assume D## format.
                
                last_seq_str = row['seq'] # e.g. "D01"
                try:
                    seq_num = int(last_seq_str[1:]) + 1
                    new_seq = f"D{seq_num:02d}"
                except:
                    new_seq = "D99" # Fallback
                
                # Prepare insert params
                # 复制改pmt_no下每个po_num在其seq数字最大的那行信息, 改ops为delete
                # seq+1, note写入 删除订单 by写入当前操作用户名, 其他保持不变
                
                insert_sql = """
                    INSERT INTO in_pmt_deposit (
                        created_at, pmt_no, po_num, dep_date, dep_prepay_amount, dep_paid, 
                        dep_cur, dep_paid_cur, dep_override, extra_note, extra_amount, extra_cur,
                        ops, seq, note, `by`
                    ) VALUES (
                        NOW(), :pmt_no, :po_num, :dep_date, :dep_prepay_amount, :dep_paid,
                        :dep_cur, :dep_paid_cur, :dep_override, :extra_note, :extra_amount, :extra_cur,
                        'delete', :seq, :note, :by
                    )
                """
                
                params = {
                    'pmt_no': pmt_no,
                    'po_num': po_num,
                    'dep_date': row.get('dep_date'),  # Use original date, can be None (will be NULL in DB)
                    'dep_prepay_amount': row.get('dep_prepay_amount') if pd.notna(row.get('dep_prepay_amount')) else None,
                    'dep_paid': row.get('dep_paid') if pd.notna(row.get('dep_paid')) else None,
                    'dep_cur': row.get('dep_cur'),
                    'dep_paid_cur': row.get('dep_paid_cur') if pd.notna(row.get('dep_paid_cur')) else None,
                    'dep_override': int(row.get('dep_override')) if pd.notna(row.get('dep_override')) else 0,
                    'extra_note': row.get('extra_note'),
                    'extra_amount': row.get('extra_amount') if pd.notna(row.get('extra_amount')) else None,
                    'extra_cur': row.get('extra_cur'),
                    'seq': new_seq,
                    'note': f"删除订单",
                    'by': user
                }
                
                DBClient.execute_stmt(insert_sql, params)
                
                # Handle Prepayments Restoration by Cloning
                if float(row.get('dep_prepay_amount') if pd.notna(row.get('dep_prepay_amount')) else 0) > 0:
                    # Find the original 'out' transaction for this pmt_no
                    # Note pattern: Deposit_{pmt_no}_...
                    prepay_find_sql = """
                        SELECT * FROM in_pmt_prepay 
                        WHERE tran_note LIKE :note_pattern 
                        ORDER BY id DESC LIMIT 1
                    """
                    note_pattern = f"Deposit_{pmt_no}%"
                    prepay_df = DBClient.read_df(prepay_find_sql, {'note_pattern': note_pattern})
                    
                    if not prepay_df.empty:
                        orig_prepay = prepay_df.iloc[0].to_dict()
                        supplier_code = orig_prepay['supplier_code']
                        
                        # Generate new tran_num
                        date_str = datetime.now().strftime('%Y%m%d')
                        seq_sql = f"""
                            SELECT tran_num FROM in_pmt_prepay 
                            WHERE tran_num LIKE '{supplier_code}_{date_str}_in_%'
                            ORDER BY id DESC LIMIT 1
                        """
                        seq_df = DBClient.read_df(seq_sql)
                        if not seq_df.empty:
                            last_tran = seq_df.iloc[0]['tran_num']
                            try:
                                last_seq = int(last_tran.split('_')[-1])
                                new_tran_seq = f"{last_seq + 1:02d}"
                            except:
                                new_tran_seq = "01"
                        else:
                            new_tran_seq = "01"
                            
                        tran_num = f"{supplier_code}_{date_str}_in_{new_tran_seq}"
                        
                        prepay_restore_sql = """
                            INSERT INTO in_pmt_prepay (
                                tran_num, supplier_code, tran_date, 
                                tran_curr_req, tran_curr_use, usd_rmb, 
                                tran_amount, tran_type, tran_ops, tran_seq, 
                                tran_by, tran_note
                            ) VALUES (
                                :tran_num, :supplier_code, :tran_date,
                                :tran_curr_req, :tran_curr_use, :usd_rmb,
                                :tran_amount, 'in', 'new', 'T01',
                                :tran_by, :tran_note
                            )
                        """
                        
                        p_params = {
                            'tran_num': tran_num,
                            'supplier_code': supplier_code,
                            'tran_date': orig_prepay['tran_date'], # Use original date per instruction "其他不变"
                            'tran_curr_req': orig_prepay['tran_curr_req'],
                            'tran_curr_use': orig_prepay['tran_curr_use'],
                            'usd_rmb': orig_prepay['usd_rmb'],
                            'tran_amount': orig_prepay['tran_amount'], # Same amount reverse
                            'tran_by': user,
                            'tran_note': f"删除定金付款_{orig_prepay.get('tran_note', '')}"
                        }
                        
                        DBClient.execute_stmt(prepay_restore_sql, p_params)

        # 更新 FIFO 入库单价记录
        from apps.finance.utils.landed_price import recalculate_landed_prices
        for po_num in po_nums:
            try:
                recalculate_landed_prices(po_num=po_num)
            except Exception as price_err:
                logger.warning(f"更新入库单价记录失败 ({po_num}): {price_err}")

        return JsonResponse({'success': True, 'message': _('Payment deleted successfully')})
        
    except Exception as e:
        logger.exception(f"[Deposit] Delete failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)
