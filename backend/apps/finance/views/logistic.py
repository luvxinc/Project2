# File: backend/apps/finance/views/logistic.py
"""
物流财务管理 - 物流费用管理
Features:
- 物流单列表展示 (复刻发货单管理)
- 付款状态显示
- 批量付款功能
"""
import logging
from datetime import date

from django.shortcuts import render
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from django.utils.translation import gettext as _

from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
def logistic_page(request):
    """物流财务管理页面"""
    return render(request, 'finance/pages/logistic.html')


@login_required(login_url='web_ui:login')
@require_GET
def logistic_list_api(request):
    """
    获取物流财务列表
    URL: /dashboard/finance/logistic/api/list/
    Query Params:
      - sort_by: 排序字段 (logistic_num/date_sent)
      - sort_order: 排序方向 (asc/desc)
    
    列表显示字段:
    - 物流单号: in_send.logistic_num
    - 付款状态: 通过 in_send.total_price (成本) 与 in_pmt_logistic.logistic_paid (付款) 对比判定
    - 发货日期: in_send.date_sent
    - 预计到达日期: in_send.date_eta
    - 实际入库日期: in_receive_final.receive_date
    - 托盘数: in_send.pallets
    - 物流单价: in_send.price_kg
    - 结算汇率: in_send.usd_rmb
    - 总费用: in_send.total_price
    - 物流费用: 同 total_price (RMB + USD 双显示)
    """
    try:
        sort_by = request.GET.get('sort_by', 'date_sent')
        sort_order = request.GET.get('sort_order', 'desc')
        
        # 验证排序参数
        allowed_sort_fields = ['logistic_num', 'date_sent']
        if sort_by not in allowed_sort_fields:
            sort_by = 'date_sent'
        if sort_order not in ['asc', 'desc']:
            sort_order = 'desc'
        
        # Step 1: 获取所有唯一物流单号
        logistic_nums_sql = "SELECT DISTINCT logistic_num FROM in_send"
        logistic_df = DBClient.read_df(logistic_nums_sql)
        
        if logistic_df.empty:
            return JsonResponse({'success': True, 'data': [], 'count': 0})
        
        logistic_nums = logistic_df['logistic_num'].tolist()
        
        # Step 2: 获取每个物流单号的最大seq及其相关信息（物流成本）
        send_info_sql = """
        SELECT 
            logistic_num,
            date_sent,
            date_eta,
            pallets,
            price_kg,
            total_weight,
            total_price,
            usd_rmb,
            mode,
            seq,
            CAST(SUBSTRING(seq, 2) AS UNSIGNED) as seq_num
        FROM in_send
        WHERE logistic_num IN :logistic_nums
        ORDER BY logistic_num, seq_num DESC
        """
        send_df = DBClient.read_df(send_info_sql, {'logistic_nums': tuple(logistic_nums)})
        
        # 按logistic_num分组，取seq_num最大的记录
        send_info_map = {}
        for _idx, row in send_df.iterrows():
            logistic_num = row['logistic_num']
            if logistic_num not in send_info_map:
                send_info_map[logistic_num] = {
                    'date_sent': str(row['date_sent']) if row['date_sent'] else '-',
                    'date_eta': str(row['date_eta']) if row['date_eta'] else '-',
                    'pallets': int(row['pallets']) if row['pallets'] else 0,
                    'price_kg': float(row['price_kg']) if row['price_kg'] else 0.0,
                    'total_weight': float(row['total_weight']) if row['total_weight'] else 0.0,
                    'total_price': float(row['total_price']) if row['total_price'] else 0.0,
                    'usd_rmb': float(row['usd_rmb']) if row.get('usd_rmb') else 7.0,
                    'mode': row['mode'] if row['mode'] else 'M',
                    'seq': row['seq'] or 'S01'
                }
        
        # Step 3: 获取付款信息 (从 in_pmt_logistic_final 获取最终状态)
        payment_info_map = {}
        if logistic_nums:
            payment_sql = """
            SELECT 
                logistic_num,
                logistic_paid,
                payment_date,
                pmt_no,
                extra_paid,
                extra_currency,
                usd_rmb,
                mode,
                note
            FROM in_pmt_logistic_final
            WHERE logistic_num IN :logistic_nums
            """
            payment_df = DBClient.read_df(payment_sql, {'logistic_nums': tuple(logistic_nums)})
            if not payment_df.empty:
                for _idx, row in payment_df.iterrows():
                    logistic_num = row['logistic_num']
                    note = row.get('note') or ''
                    is_deleted = note == '删除订单'
                    # in_pmt_logistic_final 每个 pmt_no 只有一行，直接使用
                    if logistic_num not in payment_info_map:
                        payment_info_map[logistic_num] = {
                            'logistic_paid': float(row['logistic_paid']) if row['logistic_paid'] else 0.0,
                            'payment_date': str(row['payment_date']) if row['payment_date'] else None,
                            'pmt_no': row['pmt_no'] if row['pmt_no'] else None,
                            'extra_paid': float(row['extra_paid']) if row['extra_paid'] else 0.0,
                            'extra_currency': row['extra_currency'] if row['extra_currency'] else '',
                            'usd_rmb': float(row['usd_rmb']) if row.get('usd_rmb') else 7.0,
                            'mode': row['mode'] if row.get('mode') else 'M',
                            'is_deleted': is_deleted
                        }
        
        # Step 4: 获取实际入库日期 (in_receive_final)
        receive_date_map = {}
        if logistic_nums:
            receive_sql = """
            SELECT logistic_num, receive_date
            FROM in_receive_final
            WHERE logistic_num IN :logistic_nums
            GROUP BY logistic_num
            """
            receive_df = DBClient.read_df(receive_sql, {'logistic_nums': tuple(logistic_nums)})
            if not receive_df.empty:
                receive_date_map = dict(zip(receive_df['logistic_num'], receive_df['receive_date']))
        
        # Step 5: 识别父子单关系
        # 延迟子单格式: {parent_logistic_num}_delay_V##
        import re
        parent_child_map = {}  # { parent_num: [child_nums] }
        child_to_parent = {}   # { child_num: parent_num }
        
        for logistic_num in logistic_nums:
            match = re.match(r'^(.+)_delay_V\d+$', logistic_num)
            if match:
                parent_num = match.group(1)
                if parent_num in logistic_nums or parent_num in send_info_map:
                    # 是有效的子单
                    child_to_parent[logistic_num] = parent_num
                    if parent_num not in parent_child_map:
                        parent_child_map[parent_num] = []
                    parent_child_map[parent_num].append(logistic_num)
        
        # Step 6: 构建返回数据（只包含非子单，子单附加在父单下）
        def build_order_item(logistic_num, is_child=False):
            info = send_info_map.get(logistic_num, {})
            
            # 物流费用双货币
            total_price_rmb = info.get('total_price', 0.0)
            usd_rmb = info.get('usd_rmb', 7.0)
            total_price_usd = round(total_price_rmb / usd_rmb, 5) if usd_rmb > 0 else 0
            
            # 付款状态判定
            payment_info = payment_info_map.get(logistic_num, {})
            logistic_paid = payment_info.get('logistic_paid', 0.0) if isinstance(payment_info, dict) else 0.0
            payment_date = payment_info.get('payment_date') if isinstance(payment_info, dict) else None
            pmt_no = payment_info.get('pmt_no') if isinstance(payment_info, dict) else None
            is_deleted = payment_info.get('is_deleted', False) if isinstance(payment_info, dict) else False
            diff = abs(total_price_rmb - logistic_paid)
            
            if is_deleted:
                payment_status = _('已删除')
                is_paid = False
            elif logistic_paid == 0:
                payment_status = _('未付款')
                is_paid = False
            elif diff < 0.01:
                payment_status = _('已付款')
                is_paid = True
            else:
                payment_status = _('部分付款')
                is_paid = False
            
            # 实际入库日期
            receive_date = receive_date_map.get(logistic_num)
            receive_date_str = str(receive_date) if receive_date else '-'
            
            # 日期字符串
            date_sent_str = info.get('date_sent', '-')
            date_eta_str = info.get('date_eta', '-')
            
            # 计算天数
            eta_days = None
            actual_days = None
            
            try:
                from datetime import datetime
                if date_sent_str != '-' and date_eta_str != '-':
                    sent_dt = datetime.strptime(date_sent_str, '%Y-%m-%d')
                    eta_dt = datetime.strptime(date_eta_str, '%Y-%m-%d')
                    eta_days = (eta_dt - sent_dt).days
                
                if date_sent_str != '-' and receive_date:
                    sent_dt = datetime.strptime(date_sent_str, '%Y-%m-%d')
                    if isinstance(receive_date, str):
                        recv_dt = datetime.strptime(receive_date, '%Y-%m-%d')
                    else:
                        recv_dt = datetime.combine(receive_date, datetime.min.time())
                    actual_days = (recv_dt - sent_dt).days
            except Exception:
                pass
            
            # 额外费用处理（以 USD 为 base）
            extra_paid = payment_info.get('extra_paid', 0.0) if isinstance(payment_info, dict) else 0.0
            extra_currency = payment_info.get('extra_currency', '') if isinstance(payment_info, dict) else ''
            
            # 将额外费用转为 USD
            if extra_currency == 'RMB' and usd_rmb > 0:
                extra_paid_usd = round(extra_paid / usd_rmb, 5)
            elif extra_currency == 'USD':
                extra_paid_usd = round(extra_paid, 5)
            else:
                extra_paid_usd = 0.0
            
            # 总费用 = 物流费用 + 额外费用 (USD)
            total_with_extra_usd = round(total_price_usd + extra_paid_usd, 5)
            total_with_extra_rmb = round(total_with_extra_usd * usd_rmb, 5)
            
            return {
                'logistic_num': logistic_num,
                'is_paid': is_paid,
                'payment_status': payment_status,
                'date_sent': date_sent_str,
                'date_eta': date_eta_str,
                'receive_date': receive_date_str,
                'eta_days': eta_days,
                'actual_days': actual_days,
                'pallets': info.get('pallets', 0),
                'price_kg': round(info.get('price_kg', 0.0), 5),
                'total_weight': round(info.get('total_weight', 0.0), 5),
                'usd_rmb': round(usd_rmb, 4),
                # Rate Source: Prefer in_send.mode as requested by user ("来源于 in_send")
                'rate_mode': info.get('mode', 'M'),
                'payment_mode': payment_info.get('mode', '') if isinstance(payment_info, dict) else '',
                'total_price_rmb': round(total_price_rmb, 5),
                'total_price_usd': total_price_usd,
                'logistic_paid': round(logistic_paid, 5),
                'payment_date': payment_date,  # 付款日期（用于批次分组）
                'pmt_no': pmt_no,  # 付款序列号（用于精确分组）
                'extra_paid': round(extra_paid, 5),  # 额外费用原值
                'extra_currency': extra_currency,  # 额外费用币种
                'extra_paid_usd': extra_paid_usd,  # 额外费用 (USD)
                'total_with_extra_usd': total_with_extra_usd,  # 总费用含额外 (USD)
                'total_with_extra_rmb': total_with_extra_rmb,  # 总费用含额外 (RMB)
                'is_child': is_child,  # 标识是否为子单
                'has_children': logistic_num in parent_child_map,  # 是否有子单
                'children': [],  # 子单列表（后续填充）
                'is_deleted': is_deleted  # 是否已删除
            }
        
        orders = []
        for logistic_num in logistic_nums:
            # 跳过子单（它们会被附加到父单）
            if logistic_num in child_to_parent:
                continue
            
            order_item = build_order_item(logistic_num, is_child=False)
            
            # 如果有子单，附加到 children 列表
            if logistic_num in parent_child_map:
                child_nums = sorted(parent_child_map[logistic_num])
                for child_num in child_nums:
                    child_item = build_order_item(child_num, is_child=True)
                    order_item['children'].append(child_item)
            
            orders.append(order_item)
        
        # Step 7: 排序
        sort_key_map = {
            'logistic_num': lambda x: x['logistic_num'],
            'date_sent': lambda x: x['date_sent']
        }
        orders.sort(key=sort_key_map[sort_by], reverse=(sort_order == 'desc'))
        
        return JsonResponse({
            'success': True,
            'data': orders,
            'count': len(orders)
        })
        
    except Exception as e:
        logger.exception("获取物流财务列表失败")
        return JsonResponse({
            'success': False,
            'message': _('获取物流财务列表失败: {error}').format(error=str(e))
        }, status=500)
