# File: backend/apps/finance/views/po/api.py
"""
订单付款管理 API
Features:
- 订单付款列表展示
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
import urllib.request
import ssl
import json

from core.components.db.client import DBClient
from core.services.security.policy_manager import SecurityPolicyManager

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
def po_page(request):
    """订单付款管理页面"""
    return render(request, 'finance/pages/po.html')


@login_required(login_url='web_ui:login')
@require_GET
def po_list_api(request):
    """
    获取订单付款列表
    URL: /dashboard/finance/po/api/list/
    
    列表显示字段:
    - 订货单号: in_po_final 表里的每一个唯一的 po_num
    - 订单日期: 从 po_num 中解析出来的 YYYY-MM-DD
    - 订单SKU数: 该 po_num 在 in_po_final 中所有 unique 的 po_sku 数量
    - 订单总金额: po_price * po_quantity 的总和
    - 结算货币: in_po_strategy 中 seq 最大的 cur_currency
    - 结算汇率: in_po_strategy 中 seq 最大的 cur_usd_rmb
    - 定金比例和费用: cur_deposit_par; 订单总金额 * 比例
    - 实际支付金额: in_pmt_po_final 中 pmt_paid 的总和
    - 待付金额: 订单总金额 - 实际支付金额
    - 尾款剩余: 订单总金额 - 实际支付金额
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
            s.cur_ex_float,
            s.cur_mode,
            CAST(SUBSTRING(s.seq, 2) AS UNSIGNED) as seq_num
        FROM in_po_strategy s
        INNER JOIN (
            SELECT po_num, MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_seq
            FROM in_po_strategy
            GROUP BY po_num
        ) latest ON s.po_num = latest.po_num 
            AND CAST(SUBSTRING(s.seq, 2) AS UNSIGNED) = latest.max_seq
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
        
        # 获取当前汇率 (从 in_rate 表)
        # 简化版：这里假设每个币种今天只有一条记录；实际可以根据 currency, effective_date 降序取最新
        # Note: Or use a utility function if available. Here we do ad-hoc query for simplicity.
        today_rate = 0
        try:
            # Multi-source Fallback Strategy
            sources = [
                ("https://open.er-api.com/v6/latest/USD", lambda d: d['rates']['CNY']),
                ("https://api.exchangerate-api.com/v4/latest/USD", lambda d: d['rates']['CNY']),
                ("https://api.frankfurter.app/latest?from=USD&to=CNY", lambda d: d['rates']['CNY']),
            ]
            
            import urllib.request
            import ssl
            import json
            
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE

            for url, parser in sources:
                try:
                    with urllib.request.urlopen(url, context=ctx, timeout=3) as response:
                        if response.getcode() == 200:
                            data = json.loads(response.read().decode('utf-8'))
                            rate = parser(data)
                            if rate and float(rate) > 0:
                                today_rate = float(rate)
                                logger.info(f"[PORateFetch] Successfully acquired rate {today_rate} from {url}")
                                break
                except Exception as e:
                    logger.warning(f"[PORateFetch] Failed to fetch from {url}: {e}")
                    continue
            
            if today_rate == 0:
                logger.error("[PORateFetch] All sources failed to return a valid rate.")
                
        except Exception as e:
            logger.error(f"[PORateFetch] Critical error during rate fetch: {e}")
            pass # Fallback to 0 if all fail

        # 构建策略映射
        strategy_map = {}
        for _idx, row in strategy_df.iterrows():
            po_num = row['po_num']
            supplier_code = po_num[:2] if len(po_num) >= 2 else ''
            cur_currency = row['cur_currency']
            
            # Use rate from in_rate if available, fallback to 7.0 for RMB->USD context if needed, though strictly it's currency dependent
            # logic: if currency is 'RMB', rate is 1.0? Or is it USD/RMB pair?
            # Assuming in_rate stores X -> RMB rate or USD -> X.
            # Based on previous context, cur_usd_rmb is typically expected.
            # Let's assume rate_map provides the USD->RMB rate if currency='USD', or relevant rate.
            # If the strategy currency is RMB, the rate might be 1.0 or N/A.
            # ADJUSTMENT: The prompt asks for "today's rate". We'll map fetching the rate for the strategy's currency.
            # today_rate is now fetched globally above
            
            strategy_map[po_num] = {
                'cur_currency': row['cur_currency'],
                'cur_usd_rmb': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 7.0,
                'cur_deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0.0,
                'cur_float': bool(row['cur_float']) if row['cur_float'] else False,
                'cur_ex_float': float(row['cur_ex_float']) if row['cur_ex_float'] else 0.0,
                'cur_mode': row['cur_mode'] if row['cur_mode'] else 'M',
                'supplier_code': supplier_code,
                'supplier_name': supplier_map.get(supplier_code, supplier_code),
                'today_rate': today_rate
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
        
        # Step 3: 获取已付款记录 (PO Payment)
        # 查询 in_pmt_po_final 表
        payment_map = {}
        sql = """
        SELECT 
            po_num,
            pmt_currency AS pmt_cur,
            pmt_cash_amount AS pmt_paid,
            pmt_fe_rate AS pmt_rate,

            pmt_no,
            pmt_date,
            pmt_fe_mode AS pmt_mode,
            pmt_prepay_amount,
            pmt_override,
            extra_amount,
            extra_currency AS extra_cur
        FROM in_pmt_po_final
        WHERE po_num IN :po_nums
        ORDER BY pmt_date DESC, pmt_no DESC
        """
        payment_df = DBClient.read_df(sql, {'po_nums': tuple(po_nums)})
        
        # Step 3.5 获取最近支付日期
        latest_date_sql = """
        SELECT po_num, MAX(pmt_date) as latest_date
        FROM in_pmt_po_final
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
            pmt_cur = row['pmt_cur'] or 'RMB'
            pmt_paid = float(row['pmt_paid']) if row['pmt_paid'] else 0.0
            pmt_rate = float(row['pmt_rate']) if row['pmt_rate'] else 7.0
            pmt_prepay_amount = float(row['pmt_prepay_amount']) if row['pmt_prepay_amount'] else 0.0
            pmt_override = int(row['pmt_override']) if row['pmt_override'] else 0
            
            if po_num not in payment_map:
                payment_map[po_num] = []
            
            # Format date
            pmt_date_str = ''
            if row['pmt_date']:
                d = row['pmt_date']
                pmt_date_str = d.strftime('%Y-%m-%d') if hasattr(d, 'strftime') else str(d)

            payment_map[po_num].append({
                'pmt_no': row['pmt_no'],
                'pmt_date': pmt_date_str,
                'pmt_cur': pmt_cur,
                'pmt_paid': pmt_paid,
                'pmt_rate': pmt_rate,
                'pmt_mode': row['pmt_mode'] or 'M',
                'pmt_prepay_amount': pmt_prepay_amount,  # 抵扣金额
                'pmt_override': pmt_override,  # 覆盖标志
                'extra_amount': float(row['extra_amount']) if row['extra_amount'] else 0.0,
                'extra_cur': row['extra_cur'] or ''
            })

        # Step 3.6 获取已付定金 (from in_pmt_deposit_final)
        deposit_payment_map = {}
        deposit_sql = """
        SELECT 
            po_num,
            dep_cur,
            dep_paid,
            dep_paid_cur AS dep_rate,
            dep_prepay_amount,
            dep_override
        FROM in_pmt_deposit_final
        WHERE po_num IN :po_nums
        """
        deposit_df = DBClient.read_df(deposit_sql, {'po_nums': tuple(po_nums)})
        
        for _idx, row in deposit_df.iterrows():
            po_num = row['po_num']
            dep_cur = row['dep_cur'] or 'RMB'
            dep_paid = float(row['dep_paid']) if row['dep_paid'] else 0.0
            dep_rate = float(row['dep_rate']) if row['dep_rate'] else 7.0
            dep_prepay = float(row['dep_prepay_amount']) if row['dep_prepay_amount'] else 0.0
            dep_override = int(row['dep_override']) if row['dep_override'] else 0
            
            if po_num not in deposit_payment_map:
                deposit_payment_map[po_num] = []
            
            deposit_payment_map[po_num].append({
                'dep_cur': dep_cur,
                'dep_paid': dep_paid,
                'dep_rate': dep_rate,
                'dep_prepay': dep_prepay,
                'dep_override': dep_override
            })
        
        # Step 3.7: 获取差异状态 (from in_diff_final)
        # 有未解决差异的订单不允许进行尾款付款
        diff_map = {}  # {po_num: {'has_unresolved_diff': bool, 'diff_count': int}}
        diff_sql = """
        SELECT po_num, COUNT(*) as diff_count, SUM(ABS(diff_quantity)) as total_diff
        FROM in_diff_final
        WHERE po_num IN :po_nums AND diff_quantity != 0
        GROUP BY po_num
        """
        diff_df = DBClient.read_df(diff_sql, {'po_nums': tuple(po_nums)})
        
        for _idx, row in diff_df.iterrows():
            diff_map[row['po_num']] = {
                'has_unresolved_diff': True,
                'diff_count': int(row['diff_count']) if row['diff_count'] else 0,
                'total_diff': int(row['total_diff']) if row['total_diff'] else 0
            }
        
        # Step 4: 构建返回数据
        orders = []
        for po_num in po_nums:
            strategy = strategy_map.get(po_num, {})
            order_stats = order_map.get(po_num, {})
            payments = payment_map.get(po_num, [])  # PO payments
            deposit_payments = deposit_payment_map.get(po_num, [])  # Deposit payments
            diff_info = diff_map.get(po_num, {'has_unresolved_diff': False, 'diff_count': 0, 'total_diff': 0})  # Diff status
            
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
            float_threshold = strategy.get('cur_ex_float', 0.0)  # 浮动阈值 (百分比)
            cur_mode = strategy.get('cur_mode', 'M')
            today_rate = strategy.get('today_rate', 7.0)
            
            # ========== 计算汇率浮动百分比 ==========
            rate_fluctuation_pct = 0.0
            adjustment_factor = 1.0
            fluctuation_triggered = False
            
            if cur_currency == 'USD' and is_float and cur_usd_rmb > 0 and today_rate > 0:
                rate_fluctuation_pct = ((today_rate - cur_usd_rmb) / cur_usd_rmb) * 100
                # 检查是否超过阈值 (用绝对值)
                if abs(rate_fluctuation_pct) > float_threshold:
                    fluctuation_triggered = True
                    adjustment_factor = 1 + (rate_fluctuation_pct / 100)
            
            rate_source = '自动' if cur_mode == 'A' else '手动'
            rate_source_code = 'AUTO' if cur_mode == 'A' else 'MANUAL'
            
            # 定金金额计算 (deposit_par 是百分比值，如 30 表示 30%，需要除以 100)
            deposit_required = total_amount * (deposit_par / 100)
            
            # 如果结算货币是 RMB，需要折算 USD
            if cur_currency == 'RMB':
                deposit_required_usd = deposit_required / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
                deposit_required_rmb = deposit_required
                total_amount_usd = total_amount / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
                total_amount_rmb = total_amount
            else:
                deposit_required_usd = deposit_required
                deposit_required_rmb = deposit_required * cur_usd_rmb
                total_amount_usd = total_amount
                total_amount_rmb = total_amount * cur_usd_rmb
            
            # ========== 计算已付定金 (from in_pmt_deposit_final) ==========
            deposit_paid = 0.0  # 结算货币
            deposit_paid_usd = 0.0
            has_deposit_override = False  # 是否有定金减免标记
            
            for dep in deposit_payments:
                dep_cur = dep['dep_cur']
                dep_amount = dep['dep_paid']  # 现金支付
                dep_rate = dep['dep_rate']
                dep_prepay = dep['dep_prepay']  # 抵扣金额
                
                # 检查是否有 override
                if dep.get('dep_override', 0) == 1:
                    has_deposit_override = True
                
                # 现金支付部分
                if dep_cur == cur_currency:
                    deposit_paid += dep_amount
                else:
                    if cur_currency == 'USD':
                        deposit_paid += dep_amount / dep_rate if dep_rate > 0 else 0.0
                    else:
                        deposit_paid += dep_amount * dep_rate
                
                # 统一计算 USD 金额（现金部分）
                if dep_cur == 'USD':
                    deposit_paid_usd += dep_amount
                else:
                    deposit_paid_usd += dep_amount / dep_rate if dep_rate > 0 else 0.0
                
                # 抵扣金额（按结算货币计，直接累加）
                deposit_paid += dep_prepay
                if cur_currency == 'USD':
                    deposit_paid_usd += dep_prepay
                else:
                    deposit_paid_usd += dep_prepay / dep_rate if dep_rate > 0 else 0.0
            
            # ========== 定金状态判断 ==========
            # deposit_par = 0 表示不需要定金
            deposit_required_flag = deposit_par > 0
            
            if not deposit_required_flag:
                deposit_status = 'not_required'  # 无需定金
                deposit_status_text = '无需定金'
            elif deposit_paid <= 0.01:
                deposit_status = 'unpaid'  # 尚未支付
                deposit_status_text = '定金尚未支付'
            elif deposit_paid >= deposit_required - 0.01 or has_deposit_override:
                # 已付 >= 应付 或 有减免标记
                deposit_status = 'paid'  # 已支付完成
                if has_deposit_override and deposit_paid < deposit_required - 0.01:
                    deposit_status_text = '定金已支付(减免)'
                else:
                    deposit_status_text = '定金已支付'
            else:
                # 部分支付
                deposit_status = 'partial'
                deposit_status_text = '部分支付'
            
            # ========== 计算已付货款 (from in_pmt_po_final) ==========
            po_paid = 0.0  # 结算货币
            po_paid_usd = 0.0
            total_prepay_deducted = 0.0  # 总抵扣金额（结算货币）
            total_prepay_deducted_usd = 0.0  # 总抵扣金额（USD）

            total_extra_fees_usd = 0.0 # 额外费用总和（USD）
            total_extra_fees_rmb = 0.0 # 额外费用总和（RMB）
            has_override = False

            for pmt in payments:
                pmt_cur = pmt['pmt_cur']
                pmt_amount = pmt['pmt_paid']  # 现金支付
                pmt_rate = pmt['pmt_rate']
                prepay_amount = pmt.get('pmt_prepay_amount', 0.0)  # 抵扣金额
                extra_amt = pmt.get('extra_amount', 0.0)
                extra_cur = pmt.get('extra_cur', '')
                
                # --- Calculate Extra Fees in USD and RMB ---
                if extra_amt > 0:
                    if extra_cur == 'USD':
                        total_extra_fees_usd += extra_amt
                        current_rate = pmt_rate if pmt_rate > 0 else cur_usd_rmb
                        total_extra_fees_rmb += extra_amt * current_rate
                    else:
                        total_extra_fees_rmb += extra_amt
                        total_extra_fees_usd += extra_amt / pmt_rate if pmt_rate > 0 else 0.0

                # 检查是否存在 override 记录
                if pmt.get('pmt_override', 0) == 1:
                    has_override = True

                # 现金支付部分
                if pmt_cur == cur_currency:
                    po_paid += pmt_amount
                else:
                    if cur_currency == 'USD':
                        po_paid += pmt_amount / pmt_rate if pmt_rate > 0 else 0.0
                    else:
                        po_paid += pmt_amount * pmt_rate
                
                # 统一计算 USD 金额（现金部分）
                if pmt_cur == 'USD':
                    po_paid_usd += pmt_amount
                else:
                    po_paid_usd += pmt_amount / pmt_rate if pmt_rate > 0 else 0.0
                
                # 抵扣金额（预付款余额抵扣，按结算货币计）
                po_paid += prepay_amount
                total_prepay_deducted += prepay_amount
                
                # 抵扣金额折算为 USD
                if cur_currency == 'USD':
                    po_paid_usd += prepay_amount
                    total_prepay_deducted_usd += prepay_amount
                else:
                    prepay_usd = prepay_amount / pmt_rate if pmt_rate > 0 else 0.0
                    po_paid_usd += prepay_usd
                    total_prepay_deducted_usd += prepay_usd
            
            # ========== 尾款剩余计算 ==========
            # 基础尾款 (无浮动调整)
            base_balance = total_amount - deposit_paid - po_paid
            
            # 浮动调整后尾款: (原订单总金额 - 已付定金) × 调整系数 - 已付货款
            if fluctuation_triggered:
                adjusted_unpaid = (total_amount - deposit_paid) * adjustment_factor
                balance_remaining = adjusted_unpaid - po_paid
            else:
                balance_remaining = base_balance
            
            if cur_currency == 'RMB':
                balance_remaining_usd = balance_remaining / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
            else:
                balance_remaining_usd = balance_remaining
            
            # 付款状态判定
            # 条件1：尾款剩余 <= 0 (允许误差 0.01)
            # 条件2：存在 pmt_override == 1 的记录
            if abs(balance_remaining) < 0.01 or balance_remaining <= 0 or has_override:
                payment_status = '已付款'
                is_paid = True
            elif (deposit_paid + po_paid) == 0:
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
                'today_rate': round(today_rate, 4),
                'rate_source': rate_source,
                'rate_source_code': rate_source_code,
                'deposit_par': round(deposit_par, 1),  # 已经是百分比值
                'deposit_amount': round(deposit_required, 5),  # 应付定金
                'deposit_amount_usd': round(deposit_required_usd, 5),
                'deposit_amount_rmb': round(deposit_required_rmb, 5),
                'deposit_paid': round(deposit_paid, 5),  # 已付定金（结算货币）
                'deposit_paid_usd': round(deposit_paid_usd, 5),  # 已付定金（USD）
                'deposit_status': deposit_status,  # 定金状态: not_required/unpaid/partial/paid
                'deposit_status_text': deposit_status_text,  # 定金状态文字
                'deposit_required_flag': deposit_required_flag,  # 是否需要定金
                'po_paid': round(po_paid, 5),  # 已付货款（结算货币）
                'po_paid_usd': round(po_paid_usd, 5),  # 已付货款（USD）
                'prepay_deducted': round(total_prepay_deducted, 5),  # 抵扣金额（结算货币）
                'prepay_deducted_usd': round(total_prepay_deducted_usd, 5),  # 抵扣金额（USD）
                'balance_remaining': round(balance_remaining, 5),  # 尾款剩余 (浮动调整后)
                'balance_remaining_usd': round(balance_remaining_usd, 5),
                # ===== 汇率浮动相关 =====
                'is_float_enabled': is_float,  # 是否开启浮动
                'float_threshold': round(float_threshold, 2),  # 浮动阈值 (%)
                'rate_fluctuation_pct': round(rate_fluctuation_pct, 2),  # 汇率浮动百分比
                'fluctuation_triggered': fluctuation_triggered,  # 是否触发浮动调整
                'adjustment_factor': round(adjustment_factor, 4),  # 调整系数
                # ===== 状态相关 =====
                'payment_status': payment_status,
                'is_paid': is_paid,
                'supplier_code': strategy.get('supplier_code', ''),
                'supplier_name': strategy.get('supplier_name', ''),
                'latest_payment_date': latest_date_map.get(po_num, '-'),
                'extra_fees_usd': round(total_extra_fees_usd, 5),
                'extra_fees_rmb': round(total_extra_fees_rmb, 5),
                'payment_details': payments, # List of detailed payment records
                # ===== 差异状态相关 =====
                'has_unresolved_diff': diff_info.get('has_unresolved_diff', False),  # 是否有未解决差异
                'diff_count': diff_info.get('diff_count', 0),  # 差异项数量
                'payment_blocked': diff_info.get('has_unresolved_diff', False),  # 是否禁止付款
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
        logger.exception("获取订单付款列表失败")
        return JsonResponse({
            'success': False,
            'message': _('获取订单付款列表失败: {error}').format(error=str(e))
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
def po_payment_submit(request):
    """
    提交订单付款
    URL: /dashboard/finance/po/api/submit/
    
    写入规则:
    1. in_pmt_po: 每个 po_num 一行，pmt_no = PPMT_{pmt_date}_N##
    2. in_pmt_prepay: 仅在 pmt_prepay_amount > 0 时写入
    """
    try:
        # --- Parse Request Body FIRST ---
        data = json.loads(request.body)
        
        # --- Security Gating (per 密码策略.md V5.3) ---
        # Standard pattern: inject security codes from JSON body to request.POST
        # This is required because SecurityPolicyManager reads from request.POST
        from apps.purchase.utils import inject_security_codes_to_post
        inject_security_codes_to_post(request, data)
        
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'po_payment_submit')
        if not is_valid:
            logger.warning(f"[POPayment] Security check failed: {msg}")
            return JsonResponse({'status': 'error', 'success': False, 'message': msg}, status=403)
        logger.info(f"[POPayment] Received request data keys: {data.keys()}")
        logger.info(f"[POPayment] po_nums: {data.get('po_nums', [])}")
        logger.info(f"[POPayment] items count: {len(data.get('items', []))}")
        
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
            logger.warning("[POPayment] No po_nums in request!")
            return JsonResponse({
                'success': False,
                'message': _('请选择至少一个订单')
            }, status=400)
        
        # 获取操作用户名
        username = request.user.username if request.user.is_authenticated else 'system'

        
        # 查询每个订单的策略信息
        print(f"🔍 [POPayment] po_nums: {po_nums}")
        
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
        print(f"🔍 [POPayment] Executing SQL")
        orders_df = DBClient.read_df(orders_sql)
        print(f"🔍 [POPayment] Result: empty={orders_df.empty}")
        orders = orders_df.to_dict('records') if not orders_df.empty else []
        
        if not orders:
            debug_info = f"po_nums={po_nums}, df_empty={orders_df.empty}"
            logger.error(f"[POPayment] No orders found. Debug: {debug_info}")
            return JsonResponse({
                'success': False,
                'message': _('未找到订单信息 (DEBUG: {debug_info})').format(debug_info=debug_info)
            }, status=404)
        
        # 付款日期格式 (用于文件路径)
        tran_date_str = payment_date.replace('-', '')  # YYYYMMDD
        
        insert_count = 0
        prepay_insert_count = 0
        
        # --- 计算平均额外费用（按订单数平分） ---
        order_count = len(orders)
        
        # 解析额外费用（支持两种格式）
        # 格式1: extra_fee 是字典 {amount, currency, note}
        # 格式2: extra_fee, extra_fee_currency, extra_fee_note 是分开的字段
        extra_fee_data = data.get('extra_fee')
        if extra_fee_data and isinstance(extra_fee_data, dict):
            extra_fee_amount = float(extra_fee_data.get('amount', 0) or 0)
            extra_fee_currency = extra_fee_data.get('currency', '') or ''
            extra_fee_note = extra_fee_data.get('note', '') or ''
        elif extra_fee_data and (isinstance(extra_fee_data, (int, float)) or str(extra_fee_data).replace('.', '').isdigit()):
            # 格式2: extra_fee 是数字
            extra_fee_amount = float(extra_fee_data or 0)
            extra_fee_currency = data.get('extra_fee_currency', '') or ''
            extra_fee_note = data.get('extra_fee_note', '') or ''
        else:
            extra_fee_amount = 0
            extra_fee_currency = ''
            extra_fee_note = ''
        
        logger.info(f"[POPayment] Extra fee parsed: amount={extra_fee_amount}, currency={extra_fee_currency}, note={extra_fee_note}")
        
        if extra_fee_amount > 0 and order_count > 0:
            avg_extra_fee = extra_fee_amount / order_count
        else:
            avg_extra_fee = 0
        
        # --- 生成批次 pmt_no: PPMT_{YYYYMMDD}_N## (整个批次共享一个) ---
        pmt_date_str = payment_date.replace('-', '')  # YYYYMMDD
        pmt_count_sql = """
            SELECT pmt_no FROM in_pmt_po
            WHERE pmt_no LIKE :pattern
            ORDER BY pmt_no DESC
            LIMIT 1
        """
        pmt_pattern = f'PPMT_{pmt_date_str}_N%'
        existing_df = DBClient.read_df(pmt_count_sql, {'pattern': pmt_pattern})
        if existing_df.empty:
            pmt_seq_num = 1
        else:
            # 解析最大的序号
            max_pmt_no = existing_df.iloc[0]['pmt_no']
            try:
                last_seq = int(max_pmt_no.split('_N')[-1])
                pmt_seq_num = last_seq + 1
            except:
                pmt_seq_num = 1
        pmt_no = f"PPMT_{pmt_date_str}_N{pmt_seq_num:02d}"
        logger.info(f"[POPayment] Generated batch pmt_no: {pmt_no}")
        
        for order in orders:
            po_num = order['po_num']
            supplier_code = order['supplier_code'] or (po_num[:2] if len(po_num) >= 2 else 'XX')
            order_currency = order['cur_currency'] or 'RMB'
            
            # 获取用户输入
            u_item = item_map.get(str(po_num), {})
            logger.info(f"[POPayment] Processing {po_num}: u_item={u_item}")
            
            # --- 1. 生成 seq: P## 跟着 po_num 走 ---
            seq_count_sql = """
                SELECT COUNT(*) as cnt FROM in_pmt_po
                WHERE po_num = :po_num
            """
            seq_df = DBClient.read_df(seq_count_sql, {'po_num': po_num})
            seq_num = (int(seq_df.iloc[0]['cnt']) if not seq_df.empty else 0) + 1
            seq = f"P{seq_num:02d}"
            
            # --- 3. 确定汇率和获取方式 ---
            # 付款必须使用结算日汇率（不能用订单原始汇率）
            rate_source = u_item.get('_rateSource', 'auto')  # 'auto' 或 'manual'
            pmt_fe_mode = 'M' if rate_source == 'manual' else 'A'
            
            # 汇率优先使用前端传来的结算汇率
            if settlement_rate and float(settlement_rate) > 0:
                rate = float(settlement_rate)
            else:
                # 兜底：使用订单汇率（理论上不应该走到这里）
                rate = float(order['cur_usd_rmb'] or 7.0)
                logger.warning(f"[POPayment] Missing settlement_rate for {po_num}, using order rate: {rate}")
            
            # --- 4. 确定支付货币和金额 ---
            payment_mode = u_item.get('payment_mode', 'original')
            if payment_mode == 'custom':
                pmt_currency = u_item.get('custom_currency', order_currency)
                pmt_cash_amount = float(u_item.get('custom_amount') or 0)
            else:
                # 原额模式：计算待付金额
                pmt_currency = order_currency
                
                # 优先使用前端传递的值
                pmt_cash_amount = float(u_item.get('_payAmount', 0) or 0)
                
                # 如果前端没传值，后端自己计算: 订单总额 - 已付定金 - 已付货款
                if pmt_cash_amount <= 0:
                    total = float(order['total_amount'] or 0)
                    
                    # 查询已付定金
                    deposit_sql = """
                        SELECT COALESCE(SUM(dep_paid), 0) as paid 
                        FROM in_pmt_deposit 
                        WHERE po_num = :po_num AND ops != 'delete'
                    """
                    dep_df = DBClient.read_df(deposit_sql, {'po_num': po_num})
                    deposit_paid = float(dep_df.iloc[0]['paid']) if not dep_df.empty else 0
                    
                    # 查询已付货款
                    po_paid_sql = """
                        SELECT COALESCE(SUM(pmt_cash_amount + pmt_prepay_amount), 0) as paid 
                        FROM in_pmt_po 
                        WHERE po_num = :po_num AND ops != 'delete'
                    """
                    po_df = DBClient.read_df(po_paid_sql, {'po_num': po_num})
                    po_paid = float(po_df.iloc[0]['paid']) if not po_df.empty else 0
                    
                    pmt_cash_amount = max(0, total - deposit_paid - po_paid)
                    logger.info(f"[POPayment] {po_num}: Calculated pmt_cash_amount = {pmt_cash_amount} (total={total}, deposit={deposit_paid}, po_paid={po_paid})")
            
            # --- 5. 确定预付款抵扣金额 ---
            pmt_prepay_amount = float(u_item.get('prepay_amount', 0) or 0)
            
            # --- 6. 确定减免标志 ---
            cover_std = u_item.get('cover_standard', False)
            pmt_override = 1 if cover_std else 0
            
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
            if pmt_cash_amount <= 0.001 and pmt_prepay_amount <= 0.001 and cf_extra_amount <= 0 and pmt_override == 0:
                logger.info(f"[POPayment] Skipping {po_num}: cash={pmt_cash_amount}, prepay={pmt_prepay_amount}, extra={cf_extra_amount}, override={pmt_override}")
                continue
            
            # --- 9. 写入 in_pmt_po ---
            pmt_sql = """
                INSERT INTO in_pmt_po (
                    pmt_no, po_num, pmt_date, pmt_currency, pmt_cash_amount,
                    pmt_fe_rate, pmt_fe_mode, pmt_prepay_amount, pmt_override,
                    extra_note, extra_amount, extra_currency,
                    ops, seq, `by`, note, created_at
                ) VALUES (
                    :pmt_no, :po_num, :pmt_date, :pmt_currency, :pmt_cash_amount,
                    :pmt_fe_rate, :pmt_fe_mode, :pmt_prepay_amount, :pmt_override,
                    :extra_note, :extra_amount, :extra_currency,
                    'new', :seq, :by, '原始货款单', NOW()
                )
            """
            DBClient.execute_stmt(pmt_sql, {
                'pmt_no': pmt_no,
                'po_num': po_num,
                'pmt_date': payment_date,
                'pmt_currency': pmt_currency,
                'pmt_cash_amount': pmt_cash_amount,
                'pmt_fe_rate': rate,
                'pmt_fe_mode': pmt_fe_mode,
                'pmt_prepay_amount': pmt_prepay_amount,
                'pmt_override': pmt_override,
                'extra_note': cf_extra_note,
                'extra_amount': cf_extra_amount,
                'extra_currency': cf_extra_cur,
                'seq': seq,
                'by': username
            })
            insert_count += 1
            logger.info(f"[POPayment] Created payment record {pmt_no} for {po_num}, seq={seq}")
            
            # --- 10. 写入 in_pmt_prepay (仅当 pmt_prepay_amount > 0) ---
            if pmt_prepay_amount > 0.001:
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
                    'tran_amount': pmt_prepay_amount,
                    'tran_note': f'POPAY_{pmt_no}_原始记录',
                    'tran_curr_type': pmt_fe_mode,
                    'tran_by': username
                })
                prepay_insert_count += 1
                logger.info(f"[POPayment] Created prepay record {tran_num} for {pmt_no}")
        
        if insert_count == 0:
            return JsonResponse({
                'success': True,
                'message': _('没有产生付款记录 (金额为0)')
            })
        
        logger.info(f"[POPayment] Created {insert_count} payment records, {prepay_insert_count} prepay records")
        
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
                'pmt_no': pmt_no,  # 批次共享一个 pmt_no
                'pmt_nos': [pmt_no],  # 保持兼容性，但只返回一个
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
        logger.exception(f"[POPayment] Submit failed: {e}")
        return JsonResponse({
            'success': False,
            'message': _('付款失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def po_receipt_upload_api(request):
    """
    上传订单付款回执
    URL: /dashboard/finance/po/api/upload_receipt/
    Params: pmt_no
    File: payment_receipt
    """
    try:
        # 安全验证
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'po_receipt_upload')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
        
        pmt_no = request.POST.get('pmt_no')
        file_obj = request.FILES.get('file')
        
        if not pmt_no:
            return JsonResponse({'success': False, 'message': _('缺少付款单号')}, status=400)
        if not file_obj:
            return JsonResponse({'success': False, 'message': _('未选择文件')}, status=400)
            
        # Parse Year from pmt_no: PPMT_{YYYYMMDD}_N## (e.g. PPMT_20260110_N01)
        year_match = re.search(r'PPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        # Directory
        save_dir = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'po' / year / pmt_no
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
                
        logger.info(f"[POPayment] Uploaded receipt {new_filename} for {pmt_no}")
        
        return JsonResponse({'success': True, 'message': _('上传成功'), 'data': {'filename': new_filename}})
        
    except Exception as e:
        logger.exception(f"上传失败: {e}")
        return JsonResponse({'success': False, 'message': _('上传失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_vendor_balance_api(request):
    """
    获取指定供应商的预付款余额 (PO Payment Wizard 使用)
    
    URL: /dashboard/finance/po/api/vendor_balance/
    Query: supplier_code, payment_date (YYYY-MM-DD)
    """
    try:
        supplier_code = request.GET.get('supplier_code', '').strip()
        payment_date_str = request.GET.get('payment_date', '').strip()
        
        logger.info(f"[PO] get_vendor_balance_api called for code: {supplier_code}, date: {payment_date_str}")
        
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
        logger.info(f"[PO] Found {len(df)} prepay records for {supplier_code} before {payment_date_str}")
        
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
                
        logger.info(f"[PO] Calculated Balance: Base={balance_base} ({supplier_currency}), USD={balance_usd}")

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
        logger.exception(f"[PO] get_vendor_balance_api failed: {e}")
        return JsonResponse({'success': False, 'error': _('获取余额失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def po_file_list_api(request):
    """
    获取订单付款文件列表
    URL: /dashboard/finance/po/api/files/
    """
    try:
        pmt_no = request.GET.get('pmt_no', '').strip() or request.GET.get('identifier', '').strip()
        if not pmt_no:
            return JsonResponse({'success': False, 'message': _('缺少参数: pmt_no or identifier')}, status=400)
            
        # Parse Year from pmt_no: PPMT_{YYYYMMDD}_N## (e.g. PPMT_20260110_N01)
        year_match = re.search(r'PPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        # Directory
        save_dir = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'po' / year / pmt_no
        
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
        logger.exception(f"[PO] File list failed: {e}")
        return JsonResponse({'success': False, 'message': _('获取文件列表失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def po_file_serve_api(request):
    """
    下载/预览订单付款文件
    URL: /dashboard/finance/po/api/serve_file/
    Query: identifier (pmt_no), filename
    """
    try:
        pmt_no = request.GET.get('identifier', '').strip()
        filename = request.GET.get('filename', '').strip()
        
        if not pmt_no or not filename:
            return JsonResponse({'success': False, 'message': _('缺少参数')}, status=400)
            
        # Security check
        if not filename.startswith(pmt_no):
             return JsonResponse({'success': False, 'message': _('无效的文件名')}, status=403)
            
        # Parse Year from pmt_no: PPMT_{YYYYMMDD}_N## (e.g. PPMT_20260110_N01)
        year_match = re.search(r'PPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        file_path = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'po' / year / pmt_no / filename
        
        if not file_path.exists():
            return JsonResponse({'success': False, 'message': _('文件不存在')}, status=404)
            
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
        logger.exception(f"[PO] Serve file failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_POST
def po_file_delete_api(request):
    """
    删除订单付款文件
    URL: /dashboard/finance/po/api/delete_file/
    Body: { pmt_no, filename }
    """
    try:
        data = json.loads(request.body)
        
        # 安全验证
        from apps.purchase.utils import inject_security_codes_to_post
        inject_security_codes_to_post(request, data)
        
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'po_receipt_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'error': msg or _('密码验证失败')}, status=403)
        
        pmt_no = data.get('pmt_no', '').strip()
        filename = data.get('filename', '').strip()
        
        if not pmt_no or not filename:
            return JsonResponse({'success': False, 'error': _('缺少参数')}, status=400)
        
        # Security check - filename must start with pmt_no
        if not filename.startswith(pmt_no):
            return JsonResponse({'success': False, 'error': _('非法文件名')}, status=403)
        
        # Parse Year from pmt_no: PPMT_{YYYYMMDD}_N## (e.g. PPMT_20260110_N01)
        year_match = re.search(r'PPMT_(\d{4})\d{4}_N\d+', pmt_no)
        year = year_match.group(1) if year_match else datetime.now().strftime('%Y')
        
        # Build file path
        file_path = Path(settings.BASE_DIR).parent / 'data' / 'records' / 'finance' / 'po' / year / pmt_no / filename
        
        if not file_path.exists():
            return JsonResponse({'success': False, 'error': _('文件不存在')}, status=404)
        
        # Path traversal check
        base_dir = Path(settings.BASE_DIR).parent / 'data' / 'records'
        if '..' in str(file_path) or not str(file_path.resolve()).startswith(str(base_dir.resolve())):
            return JsonResponse({'success': False, 'error': _('非法文件路径')}, status=403)
        
        # Delete file
        file_path.unlink()
        
        logger.info(f"[PO] Deleted file {filename} for {pmt_no}")
        
        return JsonResponse({
            'success': True,
            'message': _('文件删除成功')
        })
        
    except Exception as e:
        logger.exception(f"[PO] Delete file failed: {e}")
        return JsonResponse({'success': False, 'error': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def po_orders_api(request):
    """
    获取付款批次关联的订单详情
    URL: /dashboard/finance/po/api/orders/
    Params: pmt_no
    """
    pmt_no = request.GET.get('pmt_no', '').strip()
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少付款单号')}, status=400)
    
    try:
        # 查询该付款批次的所有订单
        # 表: in_pmt_po_final
        # 字段: pmt_no, po_num, pmt_date, pmt_currency, pmt_cash_amount, pmt_fe_rate, pmt_prepay_amount
        query = """
            SELECT 
                pp.po_num,
                pp.pmt_date as payment_date,
                pp.pmt_currency,
                pp.pmt_cash_amount,
                pp.pmt_fe_rate,
                pp.pmt_prepay_amount,
                pp.extra_amount,
                pp.extra_currency
            FROM in_pmt_po_final pp
            WHERE pp.pmt_no = :pmt_no
            ORDER BY pp.po_num
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
            
            pmt_paid = float(row['pmt_cash_amount'] or 0)
            rate = float(row['pmt_fe_rate'] or 1)
            prepay_used = float(row['pmt_prepay_amount'] or 0)
            extra_fee = float(row['extra_amount'] or 0)
            
            # Fetch currency and deposit percent from in_po_strategy (max seq)
            strategy_df = DBClient.read_df(
                "SELECT cur_currency, cur_deposit_par FROM in_po_strategy WHERE po_num = :po_num ORDER BY seq DESC LIMIT 1",
                {'po_num': po_num}
            )
            strategy_currency = strategy_df.iloc[0]['cur_currency'] if not strategy_df.empty else (row['pmt_cur'] or 'RMB')
            strategy_percent = float(strategy_df.iloc[0]['cur_deposit_par']) if not strategy_df.empty and strategy_df.iloc[0]['cur_deposit_par'] else 0
            
            # Use strategy currency for display and logic
            currency = strategy_currency
            
            total_payment = pmt_paid + prepay_used
            
            if currency == 'USD':
                payment_usd = total_payment
                payment_rmb = total_payment * rate
            else:
                payment_rmb = total_payment
                payment_usd = total_payment / rate if rate > 0 else 0
            
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
                
                # Use same rate as payment for consistency in display
                item_rate = rate if rate > 0 else 7.0
                
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
            payment_currency = row['pmt_currency'] or 'RMB'
            if payment_currency == 'USD':
                real_paid_rmb = pmt_paid * rate
                extra_fee_rmb = extra_fee * rate
            else:
                real_paid_rmb = pmt_paid
                extra_fee_rmb = extra_fee

            orders.append({
                'po_num': po_num,
                'supplier_code': supplier_code,
                'po_date': po_date,
                'payment_rmb': payment_rmb,
                'payment_usd': payment_usd,
                'deposit_percent': strategy_percent, # Still using deposit_percent from strategy
                'currency': currency,
                'payment_date': row['payment_date'].strftime('%Y-%m-%d') if row['payment_date'] else '-',
                'exchange_rate': rate,
                'prepay_used_rmb': prepay_used,
                'cash_paid_rmb': real_paid_rmb,
                'extra_fee_rmb': extra_fee_rmb,
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
        logger.exception(f"[PO] Get orders failed: {e}")
        return JsonResponse({'success': False, 'message': _('获取订单详情失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def po_history_api(request):
    """
    获取订单付全流程历史修订记录 (3栏: 策略、定金、订单付款)
    URL: /dashboard/finance/po/api/history/
    Params: po_num (必须), pmt_no (可选, 用于过滤订单付款)
    """
    po_num = request.GET.get('po_num', '').strip()
    pmt_no = request.GET.get('pmt_no', '').strip()
    
    if not po_num:
        return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
    
    try:
        data = {
            'strategy_versions': [],
            'deposit_versions': [],
            'payment_versions': []
        }
        
        # --- 1. 策略修订记录 (in_po_strategy) ---
        # 字段: cur_currency, cur_deposit_par
        s_sql = """
            SELECT * FROM in_po_strategy 
            WHERE po_num = :po_num 
            ORDER BY created_at ASC
        """
        logger.info(f"[POHistory] Querying strategy for po_num: '{po_num}'")
        s_df = DBClient.read_df(s_sql, {'po_num': po_num})
        logger.info(f"[POHistory] Found {len(s_df)} strategy records")
        
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
                        'field': _('结算货币'),
                        'old': prev_s['cur_currency'],
                        'new': curr_data['cur_currency']
                    })
                
                # Price Float (cur_float + cur_ex_float)
                if curr_data['cur_float'] != prev_s['cur_float']:
                     item['changes'].append({
                        'field': _('价格浮动'),
                        'old': '是' if prev_s['cur_float'] else '否',
                        'new': '是' if curr_data['cur_float'] else '否'
                    })
                elif curr_data['cur_float'] and abs(curr_data['cur_ex_float'] - prev_s['cur_ex_float']) > 0.01:
                     item['changes'].append({
                        'field': _('价格浮动比例'),
                        'old': f"{prev_s['cur_ex_float']}%",
                        'new': f"{curr_data['cur_ex_float']}%"
                    })

                # Rate Float / Deposit (cur_deposit + cur_deposit_par)
                if curr_data['cur_deposit'] != prev_s['cur_deposit']:
                     item['changes'].append({
                        'field': _('汇率浮动'), # As requested
                        'old': '是' if prev_s['cur_deposit'] else '否',
                        'new': '是' if curr_data['cur_deposit'] else '否'
                    })
                elif curr_data['cur_deposit'] and abs(curr_data['cur_deposit_par'] - prev_s['cur_deposit_par']) > 0.01:
                     item['changes'].append({
                        'field': _('汇率浮动比例'),
                        'old': f"{prev_s['cur_deposit_par']}%",
                        'new': f"{curr_data['cur_deposit_par']}%"
                    })

                # Settlement Rate (cur_usd_rmb)
                if abs(curr_data['cur_usd_rmb'] - prev_s['cur_usd_rmb']) > 0.0001:
                    item['changes'].append({
                        'field': _('结算汇率'),
                        'old': f"{prev_s['cur_usd_rmb']}",
                        'new': f"{curr_data['cur_usd_rmb']}"
                    })
            
            strategy_history.append(item)
            prev_s = curr_data
            
        data['strategy_versions'] = list(reversed(strategy_history)) # Show newest first
        
        # --- 2. 定金付款记录 (in_pmt_deposit) ---
        d_sql = """
            SELECT * FROM in_pmt_deposit
            WHERE po_num = :po_num
            ORDER BY seq ASC, created_at ASC
        """
        d_df = DBClient.read_df(d_sql, {'po_num': po_num})
        
        deposit_history = []
        prev_d = None
        
        for _idx, row in d_df.iterrows():
            item = {
                'seq': row['seq'],
                'pmt_no': row.get('pmt_no', ''),
                'date_record': str(row.get('created_at', '-')),
                'by_user': row.get('by', 'system'),
                'note': row.get('note', ''),
                'ops': row.get('ops', 'new'),
                'is_initial': prev_d is None,
                'changes': []
            }
            
            curr_data = {
                'dep_date': str(row.get('dep_date', '-')),
                'dep_cur': row.get('dep_cur') or 'RMB',
                'dep_paid': float(row.get('dep_paid') or 0),
                'dep_paid_cur': float(row.get('dep_paid_cur') or 1),
                'dep_prepay_amount': float(row.get('dep_prepay_amount') or 0),
                'dep_override': int(row.get('dep_override') or 0),
                'extra_note': row.get('extra_note') or '',
                'extra_amount': float(row.get('extra_amount') or 0),
                'extra_cur': row.get('extra_cur') or '',
                'dep_cur_mode': row.get('dep_cur_mode') or 'A'
            }
            item['data'] = curr_data
            
            if prev_d:
                # 计算变更
                if abs(curr_data['dep_prepay_amount'] - prev_d['dep_prepay_amount']) > 0.01:
                    item['changes'].append({
                        'field': '预付款抵扣',
                        'old': f"¥{prev_d['dep_prepay_amount']}",
                        'new': f"¥{curr_data['dep_prepay_amount']}"
                    })
                
                if abs(curr_data['dep_paid'] - prev_d['dep_paid']) > 0.01:
                    item['changes'].append({
                        'field': f"定金支付({curr_data['dep_cur']})",
                        'old': f"{prev_d['dep_paid']}",
                        'new': f"{curr_data['dep_paid']}"
                    })
                
                if abs(curr_data['dep_paid_cur'] - prev_d['dep_paid_cur']) > 0.0001:
                    item['changes'].append({
                        'field': '定金汇率',
                        'old': f"{prev_d['dep_paid_cur']}",
                        'new': f"{curr_data['dep_paid_cur']}"
                    })
                
                if curr_data['dep_override'] != prev_d['dep_override']:
                    item['changes'].append({
                        'field': '覆盖定金标准',
                        'old': '是' if prev_d['dep_override'] else '否',
                        'new': '是' if curr_data['dep_override'] else '否'
                    })
                
                if abs(curr_data['extra_amount'] - prev_d['extra_amount']) > 0.01:
                    item['changes'].append({
                        'field': '额外费用',
                        'old': f"{prev_d['extra_amount']} {prev_d['extra_cur']}",
                        'new': f"{curr_data['extra_amount']} {curr_data['extra_cur']}"
                    })
            
            deposit_history.append(item)
            prev_d = curr_data
        
        data['deposit_versions'] = list(reversed(deposit_history))
        
        # --- 3. 订单支付记录 (in_pmt_po) ---
        # 如果提供了 pmt_no 就过滤，否则查询该 po_num 的所有付款
        if pmt_no:
            p_sql = """
                SELECT * FROM in_pmt_po
                WHERE pmt_no = :pmt_no AND po_num = :po_num
                ORDER BY seq ASC, created_at ASC
            """
            p_df = DBClient.read_df(p_sql, {'pmt_no': pmt_no, 'po_num': po_num})
        else:
            p_sql = """
                SELECT * FROM in_pmt_po
                WHERE po_num = :po_num
                ORDER BY seq ASC, created_at ASC
            """
            p_df = DBClient.read_df(p_sql, {'po_num': po_num})
        
        payment_history = []
        prev_p = None
        
        # Need strategy currency for prepay display currency label
        # Get the MAX strategy currency for the PO
        max_strat_sql = "SELECT cur_currency FROM in_po_strategy WHERE po_num = :po_num ORDER BY seq DESC LIMIT 1"
        max_strat_df = DBClient.read_df(max_strat_sql, {'po_num': po_num})
        strategy_currency = max_strat_df.iloc[0]['cur_currency'] if not max_strat_df.empty else 'RMB'
        
        for _idx, row in p_df.iterrows():
            # In in_pmt_po: 
            # pmt_cur -> payment currency
            # pmt_rate -> exchange rate
            
            item = {
                'seq': row['seq'],
                'date_record': str(row.get('created_at', '-')),
                'by_user': row.get('by', 'system'),
                'note': row.get('note', ''),
                'is_initial': prev_p is None,
                'changes': []
            }
            
            curr_data = {
                'pmt_prepay_amount': float(row.get('pmt_prepay_amount') or 0),
                'pmt_paid': float(row.get('pmt_cash_amount') or 0),  # 实际字段是 pmt_cash_amount
                'pmt_cur': row.get('pmt_currency') or 'RMB',  # 实际字段是 pmt_currency
                'pmt_rate': float(row.get('pmt_fe_rate') or 1),  # 实际字段是 pmt_fe_rate
                'pmt_override': int(row.get('pmt_override') or 0),
                'extra_note': row.get('extra_note') or '',
                'extra_amount': float(row.get('extra_amount') or 0),
                'extra_cur': row.get('extra_currency') or '',  # 实际字段是 extra_currency
                'strategy_currency': strategy_currency # For prepay display
            }
            item['data'] = curr_data
            
            if prev_p:
                # Calculate diffs
                # Prepay
                if abs(curr_data['pmt_prepay_amount'] - prev_p['pmt_prepay_amount']) > 0.01:
                    item['changes'].append({
                        'field': f'预付款抵扣({strategy_currency})',
                        'old': f"{prev_p['pmt_prepay_amount']}",
                        'new': f"{curr_data['pmt_prepay_amount']}"
                    })
                
                # Payment
                # Check Amount
                if abs(curr_data['pmt_paid'] - prev_p['pmt_paid']) > 0.01:
                     item['changes'].append({
                        'field': f"订单支付({curr_data['pmt_cur']})", # Use label as per request
                        'old': f"{prev_p['pmt_paid']}",
                        'new': f"{curr_data['pmt_paid']}"
                    })
                
                # Check Rate (pmt_rate)
                if abs(curr_data['pmt_rate'] - prev_p['pmt_rate']) > 0.0001:
                    item['changes'].append({
                        'field': '订单结算汇率',
                        'old': f"{prev_p['pmt_rate']}",
                        'new': f"{curr_data['pmt_rate']}"
                    })

                # Override
                if curr_data['pmt_override'] != prev_p['pmt_override']:
                     item['changes'].append({
                        'field': '覆盖订单标准',
                        'old': '是' if prev_p['pmt_override'] else '否',
                        'new': '是' if curr_data['pmt_override'] else '否'
                    })
                
                # Extra Fee
                # If note changed or amount changed
                if curr_data['extra_note'] != prev_p['extra_note']:
                     item['changes'].append({
                        'field': '额外费用说明',
                        'old': prev_p['extra_note'],
                        'new': curr_data['extra_note']
                    })
                
                if abs(curr_data['extra_amount'] - prev_p['extra_amount']) > 0.01 or curr_data['extra_cur'] != prev_p['extra_cur']:
                     # Combine amount and currency
                     old_str = f"{prev_p['extra_amount']} {prev_p['extra_cur']}"
                     new_str = f"{curr_data['extra_amount']} {curr_data['extra_cur']}"
                     item['changes'].append({
                        'field': '额外费用',
                        'old': old_str,
                        'new': new_str
                    })
            
            payment_history.append(item)
            prev_p = curr_data
            
        data['payment_versions'] = list(reversed(payment_history))
        
        return JsonResponse({'success': True, 'data': data})
        
    except Exception as e:
        logger.exception(f"[PO] History failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)

@login_required(login_url='web_ui:login')
@require_POST
def po_payment_delete_api(request):
    """
    删除订单付款记录 (in_pmt_po 表)
    URL: /dashboard/finance/po/api/delete/
    Params (JSON): pmt_no, sec_code_user
    """
    try:
        data = json.loads(request.body)
        pmt_no = data.get('pmt_no')
        
        if not pmt_no:
            return JsonResponse({'success': False, 'message': 'Missing pmt_no'}, status=400)
            
        # 1. Security Check (GlobalModal L0)
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, 'po_payment_delete')
        if not is_valid:
            return JsonResponse({'success': False, 'message': msg}, status=403)
        
        with DBClient.atomic_transaction():
            # 2. Find all POs in this payment batch from in_pmt_po
            rows = DBClient.read_df(
                "SELECT * FROM in_pmt_po WHERE pmt_no = :pmt_no AND ops != 'delete'",
                {'pmt_no': pmt_no}
            )
            
            if rows.empty:
                return JsonResponse({'success': False, 'message': _('付款记录不存在或已删除')}, status=404)
            
            po_nums = rows['po_num'].unique().tolist()
            user = request.user.username
            
            # 3. For each PO in this batch, insert a delete record
            for po_num in po_nums:
                # Fetch latest record for this (pmt_no, po_num)
                latest_sql = """
                    SELECT * FROM in_pmt_po 
                    WHERE pmt_no = :pmt_no AND po_num = :po_num 
                    ORDER BY seq DESC LIMIT 1
                """
                latest_df = DBClient.read_df(latest_sql, {'pmt_no': pmt_no, 'po_num': po_num})
                
                if latest_df.empty:
                    continue
                    
                row = latest_df.iloc[0].to_dict()
                
                # Generate new seq (P01 -> P02)
                last_seq_str = row['seq']  # e.g. "P01"
                try:
                    seq_num = int(last_seq_str[1:]) + 1
                    new_seq = f"P{seq_num:02d}"
                except:
                    new_seq = "P99"  # Fallback
                
                # 4. Insert delete record into in_pmt_po
                insert_sql = """
                    INSERT INTO in_pmt_po (
                        created_at, pmt_no, po_num, pmt_date, pmt_currency, pmt_cash_amount,
                        pmt_fe_rate, pmt_fe_mode, pmt_prepay_amount, pmt_override,
                        extra_note, extra_amount, extra_currency,
                        ops, seq, note, `by`
                    ) VALUES (
                        NOW(), :pmt_no, :po_num, :pmt_date, :pmt_currency, :pmt_cash_amount,
                        :pmt_fe_rate, :pmt_fe_mode, :pmt_prepay_amount, :pmt_override,
                        :extra_note, :extra_amount, :extra_currency,
                        'delete', :seq, :note, :by
                    )
                """
                
                params = {
                    'pmt_no': pmt_no,
                    'po_num': po_num,
                    'pmt_date': row.get('pmt_date'),
                    'pmt_currency': row.get('pmt_currency'),
                    'pmt_cash_amount': row.get('pmt_cash_amount') if pd.notna(row.get('pmt_cash_amount')) else None,
                    'pmt_fe_rate': row.get('pmt_fe_rate') if pd.notna(row.get('pmt_fe_rate')) else None,
                    'pmt_fe_mode': row.get('pmt_fe_mode'),
                    'pmt_prepay_amount': row.get('pmt_prepay_amount') if pd.notna(row.get('pmt_prepay_amount')) else None,
                    'pmt_override': int(row.get('pmt_override')) if pd.notna(row.get('pmt_override')) else 0,
                    'extra_note': row.get('extra_note'),
                    'extra_amount': row.get('extra_amount') if pd.notna(row.get('extra_amount')) else None,
                    'extra_currency': row.get('extra_currency'),
                    'seq': new_seq,
                    'note': '删除订单付款',
                    'by': user
                }
                
                DBClient.execute_stmt(insert_sql, params)
            
            # 5. Handle Prepayments Restoration (汇总后写入一条)
            # 计算该 pmt_no 下所有 pmt_prepay_amount 的总和
            total_prepay = 0.0
            for po_num in po_nums:
                latest_sql = """
                    SELECT pmt_prepay_amount FROM in_pmt_po 
                    WHERE pmt_no = :pmt_no AND po_num = :po_num AND ops != 'delete'
                    ORDER BY seq DESC LIMIT 1
                """
                latest_df = DBClient.read_df(latest_sql, {'pmt_no': pmt_no, 'po_num': po_num})
                if not latest_df.empty:
                    amt = latest_df.iloc[0]['pmt_prepay_amount']
                    if pd.notna(amt):
                        total_prepay += float(amt)
            
            if total_prepay > 0.001:
                # 查找任意一条 POPAY_{pmt_no}% 记录获取 supplier 信息
                prepay_find_sql = """
                    SELECT * FROM in_pmt_prepay 
                    WHERE tran_note LIKE :note_pattern 
                    ORDER BY id DESC LIMIT 1
                """
                note_pattern = f"POPAY_{pmt_no}%"
                prepay_df = DBClient.read_df(prepay_find_sql, {'note_pattern': note_pattern})
                
                if not prepay_df.empty:
                    orig_prepay = prepay_df.iloc[0].to_dict()
                    supplier_code = orig_prepay['supplier_code']
                    
                    # Generate new tran_num using orig tran_date
                    orig_tran_date = orig_prepay['tran_date']
                    if hasattr(orig_tran_date, 'strftime'):
                        date_str = orig_tran_date.strftime('%Y%m%d')
                    else:
                        date_str = str(orig_tran_date).replace('-', '')
                    
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
                            tran_by, tran_note, tran_curr_type
                        ) VALUES (
                            :tran_num, :supplier_code, :tran_date,
                            :tran_curr_req, :tran_curr_use, :usd_rmb,
                            :tran_amount, 'in', 'new', 'T01',
                            :tran_by, :tran_note, :tran_curr_type
                        )
                    """
                    
                    p_params = {
                        'tran_num': tran_num,
                        'supplier_code': supplier_code,
                        'tran_date': orig_prepay['tran_date'],
                        'tran_curr_req': orig_prepay['tran_curr_req'],
                        'tran_curr_use': orig_prepay['tran_curr_use'],
                        'usd_rmb': orig_prepay['usd_rmb'],
                        'tran_amount': total_prepay,  # 使用汇总金额
                        'tran_by': user,
                        'tran_note': f"删除订单付款_{pmt_no}",
                        'tran_curr_type': orig_prepay.get('tran_curr_type', '')
                    }
                    
                    DBClient.execute_stmt(prepay_restore_sql, p_params)

        # 更新 FIFO 入库单价记录
        from apps.finance.utils.landed_price import recalculate_landed_prices
        for po_num in po_nums:
            try:
                recalculate_landed_prices(po_num=po_num)
            except Exception as price_err:
                logger.warning(f"更新入库单价记录失败 ({po_num}): {price_err}")

        return JsonResponse({'success': True, 'message': _('订单付款已删除')})
        
    except Exception as e:
        logger.exception(f"[PO] Delete failed: {e}")
        return JsonResponse({'success': False, 'message': str(e)}, status=500)

