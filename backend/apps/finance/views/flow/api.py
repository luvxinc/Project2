# File: backend/apps/finance/views/flow/api.py
"""
定发收总预览 API
URL: /dashboard/finance/flow/

列表字段:
- 订单号 (po_num)
- 订单总金额 (in_po_final + in_po_strategy)
- 定金状态 (in_pmt_deposit_final)
- 已付货款 (in_pmt_po_final)
- 货款剩余
- 订单实际支付金额
- 额外费用 (物流+定金+货款 摊销)
- 发货单号 (in_send_final)
- 订单物流重量 (in_send_final + Data_COGS)
- 订单物流摊销 (按重量比例)
- 订单总成本
- 订单状态 (发货/收货)
- 付款状态 (定金/货款/物流)
"""
import re
import logging
from decimal import Decimal
from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from django.utils.translation import gettext as _

from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


def _parse_po_date(po_num: str) -> str:
    """从 po_num 解析日期, 格式: XXYYYYMMDD... -> YYYY-MM-DD"""
    try:
        match = re.match(r'^[A-Za-z]{2}(\d{4})(\d{2})(\d{2})', po_num)
        if match:
            year, month, day = match.groups()
            return f"{year}-{month}-{day}"
        return '-'
    except Exception:
        return '-'


@login_required(login_url='web_ui:login')
def flow_page(request):
    """定发收总预览页面"""
    return render(request, 'finance/pages/flow.html')


@login_required(login_url='web_ui:login')
@require_GET
def flow_list_api(request):
    """
    获取订单流览列表
    URL: /dashboard/finance/flow/api/list/
    """
    try:
        # ========== Step 1: 获取所有订单及策略信息 ==========
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
        
        # 构建策略映射
        strategy_map = {}
        for _idx, row in strategy_df.iterrows():
            po_num = row['po_num']
            strategy_map[po_num] = {
                'cur_currency': row['cur_currency'] or 'USD',
                'cur_usd_rmb': float(row['cur_usd_rmb']) if row['cur_usd_rmb'] else 7.0,
                'cur_deposit_par': float(row['cur_deposit_par']) if row['cur_deposit_par'] else 0.0,
                'cur_deposit': bool(row['cur_deposit']) if row['cur_deposit'] else False,
                'cur_float': bool(row['cur_float']) if row['cur_float'] else False,
                'cur_ex_float': float(row['cur_ex_float']) if row['cur_ex_float'] else 0.0,
                'cur_mode': row['cur_mode'] or 'M',
            }
        
        # 获取今日汇率（用于浮动判断）
        today_rate = 7.0
        try:
            import urllib.request
            import ssl
            import json as json_lib
            
            sources = [
                ("https://open.er-api.com/v6/latest/USD", lambda d: d['rates']['CNY']),
                ("https://api.exchangerate-api.com/v4/latest/USD", lambda d: d['rates']['CNY']),
            ]
            
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            
            for url, parser in sources:
                try:
                    with urllib.request.urlopen(url, context=ctx, timeout=2) as response:
                        if response.getcode() == 200:
                            data = json_lib.loads(response.read().decode('utf-8'))
                            rate = parser(data)
                            if rate and float(rate) > 0:
                                today_rate = float(rate)
                                break
                except:
                    continue
        except:
            pass
        
        # ========== Step 2: 获取订单总金额 ==========
        order_sql = """
        SELECT 
            po_num,
            COUNT(DISTINCT po_sku) as sku_count,
            SUM(po_price * po_quantity) as total_amount
        FROM in_po_final
        WHERE po_num IN :po_nums
        GROUP BY po_num
        """
        order_df = DBClient.read_df(order_sql, {'po_nums': tuple(po_nums)})
        
        order_map = {}
        for _idx, row in order_df.iterrows():
            order_map[row['po_num']] = {
                'sku_count': int(row['sku_count']) if row['sku_count'] else 0,
                'total_amount': float(row['total_amount']) if row['total_amount'] else 0.0,
            }
        
        # ========== Step 3: 获取定金支付信息（逐条，与po/api.py一致）==========
        deposit_sql = """
        SELECT 
            po_num,
            dep_cur,
            dep_paid,
            dep_paid_cur AS dep_rate,
            dep_prepay_amount,
            dep_override,
            extra_amount
        FROM in_pmt_deposit_final
        WHERE po_num IN :po_nums
        """
        deposit_df = DBClient.read_df(deposit_sql, {'po_nums': tuple(po_nums)})
        
        # 存储原始数据，稍后根据订单结算货币转换
        deposit_raw_map = {}  # { po_num: [list of deposit records] }
        for _idx, row in deposit_df.iterrows():
            po_num = row['po_num']
            if po_num not in deposit_raw_map:
                deposit_raw_map[po_num] = []
            deposit_raw_map[po_num].append({
                'dep_cur': row['dep_cur'] or 'RMB',
                'dep_paid': float(row['dep_paid']) if row['dep_paid'] else 0.0,
                'dep_rate': float(row['dep_rate']) if row['dep_rate'] else 7.0,
                'dep_prepay': float(row['dep_prepay_amount']) if row['dep_prepay_amount'] else 0.0,
                'dep_override': int(row['dep_override']) if row['dep_override'] else 0,
                'extra_amount': float(row['extra_amount']) if row['extra_amount'] else 0.0
            })
        
        # ========== Step 4: 获取货款支付信息（逐条，与po/api.py一致）==========
        po_pmt_sql = """
        SELECT 
            po_num,
            pmt_currency,
            pmt_cash_amount,
            pmt_fe_rate,
            pmt_prepay_amount,
            pmt_override,
            extra_amount
        FROM in_pmt_po_final
        WHERE po_num IN :po_nums
        """
        po_pmt_df = DBClient.read_df(po_pmt_sql, {'po_nums': tuple(po_nums)})
        
        # 存储原始数据
        pmt_raw_map = {}  # { po_num: [list of pmt records] }
        for _idx, row in po_pmt_df.iterrows():
            po_num = row['po_num']
            if po_num not in pmt_raw_map:
                pmt_raw_map[po_num] = []
            pmt_raw_map[po_num].append({
                'pmt_cur': row['pmt_currency'] or 'RMB',
                'pmt_paid': float(row['pmt_cash_amount']) if row['pmt_cash_amount'] else 0.0,
                'pmt_rate': float(row['pmt_fe_rate']) if row['pmt_fe_rate'] else 7.0,
                'pmt_prepay': float(row['pmt_prepay_amount']) if row['pmt_prepay_amount'] else 0.0,
                'pmt_override': int(row['pmt_override']) if row['pmt_override'] else 0,
                'extra_amount': float(row['extra_amount']) if row['extra_amount'] else 0.0
            })
        
        # ========== Step 5: 获取发货信息 ==========
        # 5.1 获取订单关联的物流单号
        send_final_sql = """
        SELECT DISTINCT po_num, sent_logistic_num
        FROM in_send_final
        WHERE po_num IN :po_nums
        """
        send_final_df = DBClient.read_df(send_final_sql, {'po_nums': tuple(po_nums)})
        
        # 订单 -> 物流单号列表
        po_logistics_map = {}
        all_logistics = set()
        for _idx, row in send_final_df.iterrows():
            po_num = row['po_num']
            logistic_num = row['sent_logistic_num']
            if po_num not in po_logistics_map:
                po_logistics_map[po_num] = []
            if logistic_num not in po_logistics_map[po_num]:
                po_logistics_map[po_num].append(logistic_num)
            all_logistics.add(logistic_num)
        
        # 5.1.1 子物流单合并到父物流单
        # 规则: XXX_delay_V## 或 XXX_V## 等子单合并到父单 XXX
        def get_parent_logistics(logistic_num):
            """获取父物流单号，如果是子单则返回父单号，否则返回自身"""
            if '_delay_' in logistic_num or '_V' in logistic_num:
                # 提取父单号 (第一个下划线之前的部分)
                parts = logistic_num.split('_')
                return parts[0]
            return logistic_num
        
        # 建立子单->父单映射
        logistics_parent_map = {}  # { 子单: 父单 }
        parent_logistics_set = set()  # 所有父物流单
        for logistic_num in all_logistics:
            parent = get_parent_logistics(logistic_num)
            logistics_parent_map[logistic_num] = parent
            parent_logistics_set.add(parent)
        
        # 5.2 获取每个物流单的信息 (in_send 最新版本)
        logistics_info_map = {}
        if all_logistics:
            logistics_sql = """
            SELECT 
                s.logistic_num,
                s.total_weight,
                s.total_price,
                s.usd_rmb
            FROM in_send s
            INNER JOIN (
                SELECT logistic_num, MAX(CAST(SUBSTRING(seq, 2) AS UNSIGNED)) as max_seq
                FROM in_send
                GROUP BY logistic_num
            ) latest ON s.logistic_num = latest.logistic_num 
                AND CAST(SUBSTRING(s.seq, 2) AS UNSIGNED) = latest.max_seq
            WHERE s.logistic_num IN :logistics
            """
            logistics_df = DBClient.read_df(logistics_sql, {'logistics': tuple(all_logistics)})
            
            for _idx, row in logistics_df.iterrows():
                logistic_num = row['logistic_num']
                total_weight = float(row['total_weight']) if row['total_weight'] else 0.0  # KG
                total_price_rmb = float(row['total_price']) if row['total_price'] else 0.0
                usd_rmb = float(row['usd_rmb']) if row['usd_rmb'] else 7.0
                total_price_usd = total_price_rmb / usd_rmb if usd_rmb > 0 else 0.0
                
                logistics_info_map[logistic_num] = {
                    'total_weight': total_weight,
                    'total_price_rmb': total_price_rmb,
                    'total_price_usd': total_price_usd,
                    'usd_rmb': usd_rmb
                }
        
        # 5.3 统计每个父物流单下的订单数量 (用于额外费用摊销)
        # 子单的订单也计入父单
        logistics_order_count = {}
        for po_num, logistics_list in po_logistics_map.items():
            # 去重父物流单，避免同一订单被重复计数
            parent_set = set()
            for logistic_num in logistics_list:
                parent = logistics_parent_map.get(logistic_num, logistic_num)
                parent_set.add(parent)
            for parent in parent_set:
                if parent not in logistics_order_count:
                    logistics_order_count[parent] = 0
                logistics_order_count[parent] += 1
        
        # 5.4 计算每个物流单下所有订单的总重量 (用于重量比例摊销)
        # 这样可以避免 in_send 表的 total_weight 和 SKU 计算重量不一致的问题
        logistics_total_weight_by_sku = {}  # { logistic_num: total_weight_kg }
        
        # ========== Step 6: 获取物流额外费用 ==========
        logistics_extra_map = {}
        if all_logistics:
            log_extra_sql = """
            SELECT logistic_num, extra_paid, extra_currency, usd_rmb
            FROM in_pmt_logistic_final
            WHERE logistic_num IN :logistics
            """
            log_extra_df = DBClient.read_df(log_extra_sql, {'logistics': tuple(all_logistics)})
            
            for _idx, row in log_extra_df.iterrows():
                logistic_num = row['logistic_num']
                extra_paid = float(row['extra_paid']) if row['extra_paid'] else 0.0
                extra_cur = row['extra_currency'] or 'RMB'
                usd_rmb = float(row['usd_rmb']) if row['usd_rmb'] else 7.0
                
                if extra_cur == 'USD':
                    extra_usd = extra_paid
                else:
                    extra_usd = extra_paid / usd_rmb if usd_rmb > 0 else 0.0
                
                logistics_extra_map[logistic_num] = extra_usd
        
        # ========== Step 7: 计算订单物流重量 ==========
        # 7.1 获取发货明细
        send_detail_sql = """
        SELECT po_num, sent_logistic_num, po_sku, SUM(sent_quantity) as total_qty
        FROM in_send_final
        WHERE po_num IN :po_nums
        GROUP BY po_num, sent_logistic_num, po_sku
        """
        send_detail_df = DBClient.read_df(send_detail_sql, {'po_nums': tuple(po_nums)})
        
        # 7.2 获取 SKU 重量
        sku_weight_sql = "SELECT SKU, Weight FROM Data_COGS"
        sku_weight_df = DBClient.read_df(sku_weight_sql)
        sku_weight_map = {}
        for _idx, row in sku_weight_df.iterrows():
            sku = str(row['SKU']).strip().upper() if row['SKU'] else ''
            weight = float(row['Weight']) if row['Weight'] else 0.0  # 克
            sku_weight_map[sku] = weight
        
        # 7.3 计算每个订单在每个物流单的重量
        # { po_num: { logistic_num: weight_kg } }
        po_logistics_weight = {}
        for _idx, row in send_detail_df.iterrows():
            po_num = row['po_num']
            logistic_num = row['sent_logistic_num']
            sku = str(row['po_sku']).strip().upper() if row['po_sku'] else ''
            qty = int(row['total_qty']) if row['total_qty'] else 0
            
            weight_g = sku_weight_map.get(sku, 0.0)
            weight_kg = (weight_g * qty) / 1000.0
            
            # 子单合并到父单
            parent_logistic = logistics_parent_map.get(logistic_num, logistic_num)
            
            if po_num not in po_logistics_weight:
                po_logistics_weight[po_num] = {}
            if parent_logistic not in po_logistics_weight[po_num]:
                po_logistics_weight[po_num][parent_logistic] = 0.0
            po_logistics_weight[po_num][parent_logistic] += weight_kg
        
        # 7.4 计算每个父物流单下所有订单的总重量 (用于重量比例摊销)
        # 子单的重量已经在 7.3 合并到父单了
        for po_num, log_weights in po_logistics_weight.items():
            for parent_logistic, weight in log_weights.items():
                if parent_logistic not in logistics_total_weight_by_sku:
                    logistics_total_weight_by_sku[parent_logistic] = 0.0
                logistics_total_weight_by_sku[parent_logistic] += weight
        
        # ========== Step 8: 获取收货状态 ==========
        receive_sql = """
        SELECT DISTINCT logistic_num, po_num
        FROM in_receive_final
        WHERE po_num IN :po_nums
        """
        receive_df = DBClient.read_df(receive_sql, {'po_nums': tuple(po_nums)})
        
        # { po_num: set(received_logistics) }
        po_received_logistics = {}
        for _idx, row in receive_df.iterrows():
            po_num = row['po_num']
            logistic_num = row['logistic_num']
            if po_num not in po_received_logistics:
                po_received_logistics[po_num] = set()
            po_received_logistics[po_num].add(logistic_num)
        
        # ========== Step 9: 获取差异状态 ==========
        diff_sql = """
        SELECT po_num, SUM(ABS(diff_quantity)) as total_diff
        FROM in_diff_final
        WHERE po_num IN :po_nums AND diff_quantity != 0
        GROUP BY po_num
        """
        diff_df = DBClient.read_df(diff_sql, {'po_nums': tuple(po_nums)})
        
        diff_map = {}
        for _idx, row in diff_df.iterrows():
            diff_map[row['po_num']] = int(row['total_diff']) if row['total_diff'] else 0
        
        # ========== Step 10: 获取物流付款状态和货币信息 ==========
        logistics_paid_map = {}
        logistics_currency_map = {}  # 物流汇率信息
        if all_logistics:
            log_paid_sql = """
            SELECT logistic_num, logistic_paid, usd_rmb
            FROM in_pmt_logistic_final
            WHERE logistic_num IN :logistics
            """
            log_paid_df = DBClient.read_df(log_paid_sql, {'logistics': tuple(all_logistics)})
            
            for _idx, row in log_paid_df.iterrows():
                logistic_num = row['logistic_num']
                paid = float(row['logistic_paid']) if row['logistic_paid'] else 0.0
                log_rate = float(row['usd_rmb']) if row['usd_rmb'] else 7.0
                logistics_paid_map[logistic_num] = paid
                logistics_currency_map[logistic_num] = {
                    'currency': 'RMB',  # 物流付款固定 RMB
                    'usd_rmb': log_rate
                }
        
        # ========== Step 11: 构建返回数据 ==========
        orders = []
        for po_num in po_nums:
            strategy = strategy_map.get(po_num, {})
            order_info = order_map.get(po_num, {})
            
            # 基础信息
            cur_currency = strategy.get('cur_currency', 'USD')
            cur_usd_rmb = strategy.get('cur_usd_rmb', 7.0)
            total_amount = order_info.get('total_amount', 0.0)  # 结算货币
            sku_count = order_info.get('sku_count', 0)
            
            # 订单总金额 (转 USD)
            if cur_currency == 'USD':
                total_amount_usd = total_amount
            else:
                total_amount_usd = total_amount / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
            
            # ========== 计算已付定金（与 po/api.py 一致）==========
            deposit_paid = 0.0  # 结算货币
            deposit_paid_usd = 0.0
            dep_extra_usd = 0.0
            dep_override = 0
            
            deposit_payments = deposit_raw_map.get(po_num, [])
            for dep in deposit_payments:
                dep_cur = dep['dep_cur']
                dep_amount = dep['dep_paid']
                dep_rate = dep['dep_rate']
                dep_prepay = dep['dep_prepay']
                dep_extra = dep['extra_amount']
                
                if dep['dep_override'] == 1:
                    dep_override = 1
                
                # 现金支付部分 - 转换为结算货币
                if dep_cur == cur_currency:
                    deposit_paid += dep_amount
                else:
                    if cur_currency == 'USD':
                        deposit_paid += dep_amount / dep_rate if dep_rate > 0 else 0.0
                    else:
                        deposit_paid += dep_amount * dep_rate
                
                # 统一计算 USD 金额
                if dep_cur == 'USD':
                    deposit_paid_usd += dep_amount
                else:
                    deposit_paid_usd += dep_amount / dep_rate if dep_rate > 0 else 0.0
                
                # 抵扣金额（按结算货币直接累加）
                deposit_paid += dep_prepay
                if cur_currency == 'USD':
                    deposit_paid_usd += dep_prepay
                else:
                    deposit_paid_usd += dep_prepay / dep_rate if dep_rate > 0 else 0.0
                
                # 额外费用
                if dep_cur == 'USD':
                    dep_extra_usd += dep_extra
                else:
                    dep_extra_usd += dep_extra / dep_rate if dep_rate > 0 else 0.0
            
            # ========== 计算已付货款（与 po/api.py 一致）==========
            po_paid = 0.0  # 结算货币
            po_paid_usd = 0.0
            pmt_extra_usd = 0.0
            pmt_override = 0
            
            pmt_payments = pmt_raw_map.get(po_num, [])
            for pmt in pmt_payments:
                pmt_cur = pmt['pmt_cur']
                pmt_amount = pmt['pmt_paid']
                pmt_rate = pmt['pmt_rate']
                pmt_prepay = pmt['pmt_prepay']
                pmt_extra = pmt['extra_amount']
                
                if pmt['pmt_override'] == 1:
                    pmt_override = 1
                
                # 现金支付部分 - 转换为结算货币
                if pmt_cur == cur_currency:
                    po_paid += pmt_amount
                else:
                    if cur_currency == 'USD':
                        po_paid += pmt_amount / pmt_rate if pmt_rate > 0 else 0.0
                    else:
                        po_paid += pmt_amount * pmt_rate
                
                # 统一计算 USD 金额
                if pmt_cur == 'USD':
                    po_paid_usd += pmt_amount
                else:
                    po_paid_usd += pmt_amount / pmt_rate if pmt_rate > 0 else 0.0
                
                # 抵扣金额（按结算货币直接累加）
                po_paid += pmt_prepay
                if cur_currency == 'USD':
                    po_paid_usd += pmt_prepay
                else:
                    po_paid_usd += pmt_prepay / pmt_rate if pmt_rate > 0 else 0.0
                
                # 额外费用
                if pmt_cur == 'USD':
                    pmt_extra_usd += pmt_extra
                else:
                    pmt_extra_usd += pmt_extra / pmt_rate if pmt_rate > 0 else 0.0
            
            # 定金信息
            cur_deposit = strategy.get('cur_deposit', False)
            cur_deposit_par = strategy.get('cur_deposit_par', 0.0)
            cur_float = strategy.get('cur_float', False)
            cur_ex_float = strategy.get('cur_ex_float', 0.0)
            
            # 计算浮动是否触发及调整系数
            fluctuation_triggered = False
            adjustment_factor = 1.0
            rate_fluctuation_pct = 0.0
            if cur_currency == 'USD' and cur_float and cur_ex_float > 0 and cur_usd_rmb > 0 and today_rate > 0:
                rate_fluctuation_pct = ((today_rate - cur_usd_rmb) / cur_usd_rmb) * 100
                if abs(rate_fluctuation_pct) > cur_ex_float:
                    fluctuation_triggered = True
                    adjustment_factor = 1 + (rate_fluctuation_pct / 100)
            
            # 如果浮动触发，调整订单总金额用于计算尾款
            if fluctuation_triggered:
                adjusted_total_for_balance = total_amount * adjustment_factor
            else:
                adjusted_total_for_balance = total_amount
            
            deposit_required_usd = total_amount_usd * (cur_deposit_par / 100) if cur_deposit else 0.0
            dep_paid_usd = deposit_paid_usd  # 重命名以保持后续代码兼容
            
            # 定金状态
            if not cur_deposit or cur_deposit_par <= 0:
                deposit_status = 'not_required'
                deposit_status_text = _('无定金需求')
            elif dep_override:
                deposit_status = 'override'
                deposit_status_text = _('已减免')
            elif dep_paid_usd >= deposit_required_usd - 0.01:
                deposit_status = 'paid'
                deposit_status_text = _('已付清')
            elif dep_paid_usd > 0:
                deposit_status = 'partial'
                deposit_status_text = _('部分付款')
            else:
                deposit_status = 'unpaid'
                deposit_status_text = _('待付款')
            
            # 货款信息（已在上面逐条计算）
            pmt_paid_usd = po_paid_usd  # 重命名以保持兼容
            pmt_paid = po_paid  # 使用结算货币的值
            
            # 货款剩余计算（与 po/api.py 完全一致）
            # 如果订单被减免，则货款剩余为0，视为已付清
            if pmt_override:
                balance_remaining_usd = 0.0
                balance_remaining = 0.0
                is_fully_paid = True
            else:
                # 直接使用结算货币的 deposit_paid 和 po_paid
                # 基础尾款 = 订单总金额 - 已付定金 - 已付货款 (全用结算货币)
                base_balance = total_amount - deposit_paid - po_paid
                
                # 浮动调整后尾款
                if fluctuation_triggered:
                    adjusted_unpaid = (total_amount - deposit_paid) * adjustment_factor
                    balance_remaining = adjusted_unpaid - po_paid
                else:
                    balance_remaining = base_balance
                
                # 转换为 USD
                if cur_currency == 'USD':
                    balance_remaining_usd = balance_remaining
                else:
                    balance_remaining_usd = balance_remaining / cur_usd_rmb if cur_usd_rmb > 0 else 0.0
                
                # 判断是否付清
                is_fully_paid = abs(balance_remaining) < 0.01 or balance_remaining <= 0
                
                # 负值归零用于显示
                if balance_remaining_usd < 0.01:
                    balance_remaining_usd = 0.0
                if balance_remaining < 0.01:
                    balance_remaining = 0.0
            
            # 订单实际支付金额 (USD)
            actual_paid_usd = dep_paid_usd + pmt_paid_usd
            
            # 订单实际支付金额 (结算货币)
            if cur_currency == 'USD':
                actual_paid = actual_paid_usd
            else:
                actual_paid = actual_paid_usd * cur_usd_rmb
            
            # 物流单列表
            logistics_list = po_logistics_map.get(po_num, [])
            
            # 订单物流重量
            order_weight_kg = 0.0
            po_weight_detail = po_logistics_weight.get(po_num, {})
            for logistic_num in logistics_list:
                parent_logistic = logistics_parent_map.get(logistic_num, logistic_num)
                order_weight_kg += po_weight_detail.get(parent_logistic, 0.0)
            
            # 订单物流摊销 - 按物流自己的货币计算
            logistics_apportioned_usd = 0.0
            logistics_apportioned = 0.0  # 原始货币
            logistics_currency = 'RMB'  # 默认货币
            logistics_usd_rmb = 7.0  # 默认汇率
            logistics_extra_apportioned_usd = 0.0
            
            # 获取该订单关联的所有父物流单（去重）
            parent_logistics_for_order = set()
            for logistic_num in logistics_list:
                parent = logistics_parent_map.get(logistic_num, logistic_num)
                parent_logistics_for_order.add(parent)
            
            for parent_logistic in parent_logistics_for_order:
                # 使用父物流单的信息（费用在父单上）
                log_info = logistics_info_map.get(parent_logistic, {})
                log_total_weight = log_info.get('total_weight', 0.0)
                log_total_price_rmb = log_info.get('total_price_rmb', 0.0)
                log_send_usd_rmb = log_info.get('usd_rmb', 7.0)  # in_send 的汇率
                
                # 检查父物流单是否已付款，选择对应汇率
                log_pmt_info = logistics_currency_map.get(parent_logistic, {})
                log_paid = logistics_paid_map.get(parent_logistic, 0.0)
                
                # 若已付款用 in_pmt_logistic 的汇率，否则用 in_send 的汇率
                if log_paid > 0:
                    log_usd_rmb = log_pmt_info.get('usd_rmb', log_send_usd_rmb)
                else:
                    log_usd_rmb = log_send_usd_rmb
                
                # 该订单在父物流单的重量（已包含子单的货物）
                order_weight_in_log = po_weight_detail.get(parent_logistic, 0.0)
                
                # 父物流单的总重量（已包含所有子单的货物）
                total_weight_for_ratio = logistics_total_weight_by_sku.get(parent_logistic, 0.0)
                
                # 按重量比例摊销物流费
                if total_weight_for_ratio > 0:
                    weight_ratio = order_weight_in_log / total_weight_for_ratio
                    
                    # 摊销金额 (RMB) - 固定
                    apportioned_rmb = log_total_price_rmb * weight_ratio
                    logistics_apportioned += apportioned_rmb
                    
                    # 摊销金额 (USD) - 根据付款状态选汇率
                    apportioned_usd = apportioned_rmb / log_usd_rmb if log_usd_rmb > 0 else 0.0
                    logistics_apportioned_usd += apportioned_usd
                    
                    # 保存物流货币信息 (物流费用是RMB)
                    logistics_currency = 'RMB'
                    logistics_usd_rmb = log_usd_rmb
                
                # 额外费用按订单数量摊销（使用父物流单）
                order_count = logistics_order_count.get(parent_logistic, 1)
                log_extra = logistics_extra_map.get(parent_logistic, 0.0)
                logistics_extra_apportioned_usd += log_extra / order_count
            
            # 额外费用总计 (定金 + 货款 + 物流) - USD
            total_extra_usd = dep_extra_usd + pmt_extra_usd + logistics_extra_apportioned_usd
            
            # 额外费用转换为结算货币
            if cur_currency == 'USD':
                total_extra = total_extra_usd
            else:
                total_extra = total_extra_usd * cur_usd_rmb
            
            # 订单总成本计算规则:
            # 未付完: 订单总金额 + 额外费用 + 物流摊销
            # 已付完: 实际支付金额 + 额外费用 + 物流摊销
            if is_fully_paid:
                # 已付完: 用实际支付金额
                base_cost_usd = actual_paid_usd
                base_cost = actual_paid
            else:
                # 未付完: 用订单总金额
                base_cost_usd = total_amount_usd
                base_cost = total_amount
            
            # 物流摊销转换为订单结算货币
            if cur_currency == 'USD':
                logistics_apportioned_in_order_cur = logistics_apportioned_usd
            else:
                logistics_apportioned_in_order_cur = logistics_apportioned  # RMB
            
            total_cost_usd = base_cost_usd + total_extra_usd + logistics_apportioned_usd
            total_cost = base_cost + total_extra + logistics_apportioned_in_order_cur
            
            # 订单状态 (发货/收货)
            sent_logistics = set(logistics_list)
            received_logistics = po_received_logistics.get(po_num, set())
            has_diff = diff_map.get(po_num, 0) > 0
            
            if not sent_logistics:
                order_status = 'pending'
                order_status_text = _('待发货')
            elif received_logistics >= sent_logistics:
                if has_diff:
                    order_status = 'received_diff'
                    order_status_text = _('已收货(有差异)')
                else:
                    order_status = 'received'
                    order_status_text = _('已收货')
            elif received_logistics:
                order_status = 'partial_received'
                order_status_text = _('部分收货')
            else:
                order_status = 'sent'
                order_status_text = _('已发货')
            
            # 物流状态 (用于前端显示卡车图标)
            # none: 没有物流, in_transit: 在路上, arrived: 已到达
            if not logistics_list or len(logistics_list) == 0:
                logistics_status = 'none'
            elif received_logistics >= sent_logistics:
                logistics_status = 'arrived'
            else:
                logistics_status = 'in_transit'
            
            # 物流费用付款状态 - 使用父物流单判断
            # 获取该订单关联的父物流单（与摊销计算一致）
            parent_logistics_for_status = set()
            for logistic_num in logistics_list:
                parent = logistics_parent_map.get(logistic_num, logistic_num)
                parent_logistics_for_status.add(parent)
            
            total_log_price = 0.0
            total_log_paid = 0.0
            for parent_logistic in parent_logistics_for_status:
                log_info = logistics_info_map.get(parent_logistic, {})
                log_price = log_info.get('total_price_rmb', 0.0)
                log_paid = logistics_paid_map.get(parent_logistic, 0.0)
                total_log_price += log_price
                total_log_paid += log_paid
            
            if not logistics_list or len(logistics_list) == 0:
                logistics_payment_status = 'unpaid'  # 没有发货也是未付
            elif total_log_price <= 0 or total_log_paid >= total_log_price - 0.01:
                logistics_payment_status = 'paid'
            elif total_log_paid > 0:
                logistics_payment_status = 'partial'
            else:
                logistics_payment_status = 'unpaid'
            
            # 付款状态
            # 定金
            dep_status_icon = '✅' if deposit_status in ['paid', 'override', 'not_required'] else ('🟡' if deposit_status == 'partial' else '❌')
            # 货款
            if pmt_override or balance_remaining_usd <= 0:
                pmt_status_icon = '✅'
            elif pmt_paid_usd > 0:
                pmt_status_icon = '🟡'
            else:
                pmt_status_icon = '❌'
            # 物流
            log_status_icon = '✅' if logistics_payment_status == 'paid' else ('🟡' if logistics_payment_status == 'partial' else '❌')
            
            payment_status_text = _("定金") + f"{dep_status_icon} " + _("货款") + f"{pmt_status_icon} " + _("物流") + f"{log_status_icon}"
            
            orders.append({
                'po_num': po_num,
                'po_date': _parse_po_date(po_num),
                'sku_count': sku_count,
                'cur_currency': cur_currency,
                'cur_usd_rmb': round(cur_usd_rmb, 4),
                'total_amount': round(total_amount, 5),
                'total_amount_usd': round(total_amount_usd, 5),
                'deposit_required_usd': round(deposit_required_usd, 5),
                'deposit_par': round(cur_deposit_par, 1),
                'deposit_status': deposit_status,
                'deposit_status_text': deposit_status_text,
                'dep_paid_usd': round(dep_paid_usd, 5),
                'pmt_paid': round(pmt_paid, 5),
                'pmt_paid_usd': round(pmt_paid_usd, 5),
                'balance_remaining': round(balance_remaining, 5),
                'balance_remaining_usd': round(balance_remaining_usd, 5),
                'actual_paid': round(actual_paid, 5),
                'actual_paid_usd': round(actual_paid_usd, 5),
                'dep_extra_usd': round(dep_extra_usd, 5),
                'pmt_extra_usd': round(pmt_extra_usd, 5),
                'logistics_extra_usd': round(logistics_extra_apportioned_usd, 5),
                'total_extra': round(total_extra, 5),
                'total_extra_usd': round(total_extra_usd, 5),
                'logistics_list': logistics_list,
                'order_weight_kg': round(order_weight_kg, 2),
                'logistics_apportioned': round(logistics_apportioned, 5),
                'logistics_apportioned_usd': round(logistics_apportioned_usd, 5),
                'logistics_currency': logistics_currency,
                'logistics_usd_rmb': round(logistics_usd_rmb, 4),
                'total_cost': round(total_cost, 5),
                'total_cost_usd': round(total_cost_usd, 5),
                'order_status': order_status,
                'order_status_text': order_status_text,
                'has_diff': has_diff,
                'logistics_status': logistics_status,
                'logistics_payment_status': logistics_payment_status,
                'payment_status_text': payment_status_text,
                'cur_float': cur_float,
                'cur_ex_float': cur_ex_float,
                'fluctuation_triggered': fluctuation_triggered,
            })
        
        # 按订单号倒序排列
        orders.sort(key=lambda x: x['po_num'], reverse=True)
        
        return JsonResponse({
            'success': True,
            'data': orders,
            'count': len(orders)
        })
        
    except Exception as e:
        logger.exception("获取订单流览列表失败")
        return JsonResponse({
            'success': False,
            'message': _('获取订单流览列表失败: {error}').format(error=str(e))
        }, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def flow_detail_api(request):
    """
    获取订单在各物流单中的SKU明细
    URL: /dashboard/finance/flow/api/detail/
    Params: po_num
    
    返回按物流单分块的SKU明细，包括：
    - 理论单价、实际单价、费用摊销、入库单价、数量、总价
    - delay单合并到母单
    
    [重构 2026-01-10] 使用共享组件 calculate_landed_prices_for_display
    """
    try:
        from apps.finance.utils.landed_price import calculate_landed_prices_for_display
        
        po_num = request.GET.get('po_num')
        if not po_num:
            return JsonResponse({'success': False, 'message': _('缺少订单号')}, status=400)
        
        # 使用共享组件计算
        result = calculate_landed_prices_for_display(po_num)
        
        return JsonResponse({
            'success': True,
            'data': result['data'],
            'count': len(result['data']),
            'meta': result['meta']
        })
        
    except Exception as e:
        logger.exception("获取订单详情失败")
        return JsonResponse({
            'success': False,
            'message': _('获取订单详情失败: {error}').format(error=str(e))
        }, status=500)

