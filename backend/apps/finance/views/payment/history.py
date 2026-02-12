# File: backend/apps/finance/views/payment/history.py
"""
物流付款 - 历史记录与订单查询 API
"""
import logging

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET
from django.utils.translation import gettext as _

from core.components.db.client import DBClient

logger = logging.getLogger(__name__)


def _make_send_data(row):
    return {
        'date_sent': str(row['date_sent']) if row['date_sent'] else '',
        'price_kg': float(row['price_kg']) if row['price_kg'] else 0,
        'total_weight': float(row['total_weight']) if row['total_weight'] else 0,
        'total_price': float(row['total_price']) if row['total_price'] else 0,
        'pallets': int(row['pallets']) if row['pallets'] else 0
    }


def _calc_send_changes(new_data, old_data):
    """计算两个版本之间的变更"""
    changes = []
    field_labels = {
        'total_price': _('运费(RMB)'),
        'price_kg': _('单价($/kg)'),
        'total_weight': _('重量(kg)'),
        'pallets': _('托盘数'),
        'date_sent': _('发货日期')
    }
    for key, label in field_labels.items():
        old_val = old_data.get(key)
        new_val = new_data.get(key)
        if key in ('usd_rmb', 'price_kg'):
            if old_val is not None and new_val is not None and abs(float(old_val) - float(new_val)) > 0.0001:
                changes.append({'field': label, 'old': f"{float(old_val):.4f}", 'new': f"{float(new_val):.4f}"})
        elif key in ('total_price', 'total_weight'):
            if old_val is not None and new_val is not None and abs(float(old_val) - float(new_val)) > 0.01:
                changes.append({'field': label, 'old': f"{float(old_val):.2f}", 'new': f"{float(new_val):.2f}"})
        elif key == 'pallets':
            if old_val != new_val:
                changes.append({'field': label, 'old': str(old_val or 0), 'new': str(new_val or 0)})
        elif key == 'date_sent':
            if str(old_val) != str(new_val):
                changes.append({'field': label, 'old': str(old_val or '-'), 'new': str(new_val or '-')})
    return changes


def _make_payment_data(row):
    return {
        'payment_date': str(row['payment_date']) if row['payment_date'] else '',
        'logistic_paid': float(row['logistic_paid']) if row['logistic_paid'] else 0,
        'extra_paid': float(row['extra_paid']) if row['extra_paid'] else 0,
        'extra_currency': row['extra_currency'] or '',
        'extra_note': row['extra_note'] or '',
        'usd_rmb': float(row['usd_rmb']) if row.get('usd_rmb') else 0,
        'mode': row.get('mode') or 'M'
    }


def _calc_payment_changes(new_data, old_data):
    """计算付款版本之间的变更"""
    changes = []
    old_paid = old_data.get('logistic_paid', 0) or 0
    new_paid = new_data.get('logistic_paid', 0) or 0
    if abs(new_paid - old_paid) > 0.01:
        changes.append({'field': _('物流费'), 'old': f"¥{old_paid:.2f}", 'new': f"¥{new_paid:.2f}"})
    old_extra = old_data.get('extra_paid', 0) or 0
    new_extra = new_data.get('extra_paid', 0) or 0
    if abs(new_extra - old_extra) > 0.01:
        old_str = f"{old_extra:.2f} {old_data.get('extra_currency', '')}" if old_extra > 0 else _("无")
        new_str = f"{new_extra:.2f} {new_data.get('extra_currency', '')}" if new_extra > 0 else _("无")
        changes.append({'field': _('附加费'), 'old': old_str, 'new': new_str})
    old_date = old_data.get('payment_date', '')
    new_date = new_data.get('payment_date', '')
    if str(old_date) != str(new_date):
        changes.append({'field': '付款日期', 'old': str(old_date) or '-', 'new': str(new_date) or '-'})
    # 汇率变更
    old_rate = old_data.get('usd_rmb', 0) or 0
    new_rate = new_data.get('usd_rmb', 0) or 0
    if abs(new_rate - old_rate) > 0.0001:
        changes.append({'field': _('结算汇率'), 'old': f"{old_rate:.4f}", 'new': f"{new_rate:.4f}"})
    return changes


@login_required(login_url='web_ui:login')
@require_GET
def payment_history_api(request):
    """获取付款批次的历史记录"""
    pmt_no = request.GET.get('pmt_no', '').strip()
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少 pmt_no')}, status=400)
    
    try:
        logistic_df = DBClient.read_df(
            "SELECT DISTINCT logistic_num FROM in_pmt_logistic WHERE pmt_no = :pmt_no",
            {'pmt_no': pmt_no}
        )
        
        if logistic_df.empty:
            return JsonResponse({'success': True, 'data': {'pmt_no': pmt_no, 'send_versions': [], 'payment_versions': []}})
        
        logistic_nums = logistic_df['logistic_num'].tolist()
        send_versions = []
        
        for logistic_num in logistic_nums:
            send_df = DBClient.read_df("""
                SELECT logistic_num, date_sent, price_kg, total_weight, total_price, usd_rmb, pallets,
                       note, date_record, `by` as by_user, seq, CAST(REPLACE(seq, 'V', '') AS UNSIGNED) as seq_num
                FROM in_send WHERE logistic_num = :logistic_num ORDER BY seq_num DESC
            """, {'logistic_num': logistic_num})
            
            if send_df.empty:
                continue
            
            payment_related = send_df[send_df['note'].str.contains('运费付款|修改付款', na=False, regex=True)]
            non_payment = send_df[~send_df['note'].str.contains('运费付款|修改付款', na=False, regex=True)]
            base_row = non_payment.iloc[0] if not non_payment.empty else send_df.iloc[-1]
            base_data = _make_send_data(base_row)
            base_version = {
                'logistic_num': logistic_num, 'is_initial': True, 'seq': base_row['seq'],
                'date_record': str(base_row['date_record']) if base_row['date_record'] else '',
                'by_user': base_row['by_user'] or '', 'note': base_row['note'] or '', 'data': base_data, 'changes': []
            }
            
            if payment_related.empty:
                send_versions.append(base_version)
            else:
                versions_for_logistic = []
                sorted_pr = payment_related.sort_values('seq_num', ascending=True)
                prev_data = base_data
                for _idx, row in sorted_pr.iterrows():
                    curr_data = _make_send_data(row)
                    changes = _calc_send_changes(curr_data, prev_data)
                    versions_for_logistic.append({
                        'logistic_num': logistic_num, 'is_initial': False, 'seq': row['seq'],
                        'date_record': str(row['date_record']) if row['date_record'] else '',
                        'by_user': row['by_user'] or '', 'note': row['note'] or '', 'data': curr_data, 'changes': changes
                    })
                    prev_data = curr_data
                versions_for_logistic.reverse()
                send_versions.extend(versions_for_logistic)
                send_versions.append(base_version)
        
        # Payment versions
        payment_df = DBClient.read_df("""
            SELECT date_record, date_sent, logistic_num, logistic_paid, extra_paid, extra_currency,
                   extra_note, payment_date, note, seq, by_user, pmt_no, usd_rmb, mode,
                   CAST(REPLACE(seq, 'V', '') AS UNSIGNED) as seq_num
            FROM in_pmt_logistic WHERE pmt_no = :pmt_no ORDER BY logistic_num, seq_num DESC
        """, {'pmt_no': pmt_no})
        
        payment_versions = []
        for logistic_num, group_df in payment_df.groupby('logistic_num'):
            sorted_group = group_df.sort_values('seq_num', ascending=True)
            prev_data = None
            versions = []
            for idx, (_, row) in enumerate(sorted_group.iterrows()):
                curr_data = _make_payment_data(row)
                is_initial = (idx == 0)
                changes = [] if is_initial else _calc_payment_changes(curr_data, prev_data)
                versions.append({
                    'logistic_num': logistic_num, 'is_initial': is_initial, 'seq': row['seq'],
                    'date_record': str(row['date_record']), 'date_sent': str(row['date_sent']) if row['date_sent'] else '',
                    'payment_date': curr_data['payment_date'], 'logistic_paid': curr_data['logistic_paid'],
                    'extra_paid': curr_data['extra_paid'], 'extra_currency': curr_data['extra_currency'],
                    'extra_note': curr_data['extra_note'], 'note': row['note'] or '', 'by_user': row['by_user'] or '',
                    'usd_rmb': curr_data['usd_rmb'], 'mode': curr_data['mode'], 'changes': changes
                })
                prev_data = curr_data
            versions.reverse()
            payment_versions.extend(versions)
        
        return JsonResponse({'success': True, 'data': {'pmt_no': pmt_no, 'send_versions': send_versions, 'payment_versions': payment_versions, 'logistic_nums': logistic_nums}})
    except Exception as e:
        logger.exception("获取付款历史失败")
        return JsonResponse({'success': False, 'message': _('获取失败: {error}').format(error=str(e))}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def payment_orders_api(request):
    """获取付款批次关联的订单详情"""
    pmt_no = request.GET.get('pmt_no', '').strip()
    if not pmt_no:
        return JsonResponse({'success': False, 'message': _('缺少 pmt_no')}, status=400)
    
    try:
        logistic_df = DBClient.read_df("SELECT DISTINCT logistic_num FROM in_pmt_logistic WHERE pmt_no = :pmt_no", {'pmt_no': pmt_no})
        if logistic_df.empty:
            return JsonResponse({'success': True, 'data': {'pmt_no': pmt_no, 'orders': []}})
        
        logistic_nums = logistic_df['logistic_num'].tolist()
        orders_df = DBClient.read_df("SELECT DISTINCT po_num FROM in_send_list WHERE logistic_num IN :logistic_nums", {'logistic_nums': tuple(logistic_nums)})
        if orders_df.empty:
            return JsonResponse({'success': True, 'data': {'pmt_no': pmt_no, 'orders': [], 'logistic_nums': logistic_nums}})
        
        orders = []
        for po_num in orders_df['po_num'].tolist():
            supplier_code = po_num[:2] if len(po_num) >= 2 else ''
            order_date = ''
            if len(po_num) >= 10:
                try:
                    ds = po_num[2:10]
                    order_date = f"{ds[:4]}-{ds[4:6]}-{ds[6:8]}"
                except:
                    pass
            
            detail_df = DBClient.read_df("SELECT po_sku as sku, po_quantity as qty, po_price as unit_price FROM in_po_final WHERE po_num = :po_num", {'po_num': po_num})
            if detail_df.empty:
                continue
            
            strategy_df = DBClient.read_df("SELECT cur_currency as currency, cur_usd_rmb as exchange_rate FROM in_po_strategy WHERE po_num = :po_num ORDER BY date DESC LIMIT 1", {'po_num': po_num})
            strategy = {'currency': strategy_df.iloc[0]['currency'], 'exchange_rate': float(strategy_df.iloc[0]['exchange_rate']) if strategy_df.iloc[0]['exchange_rate'] else 0} if not strategy_df.empty else {}
            
            currency_df = DBClient.read_df("SELECT currency FROM in_po WHERE po_num = :po_num LIMIT 1", {'po_num': po_num})
            item_currency = currency_df.iloc[0]['currency'] if not currency_df.empty and currency_df.iloc[0]['currency'] else 'RMB'
            
            items = []
            total_rmb = total_usd = 0
            for _idx, row in detail_df.iterrows():
                qty = int(row['qty']) if row['qty'] else 0
                unit_price = float(row['unit_price']) if row['unit_price'] else 0
                rate = strategy.get('exchange_rate', 1) or 1
                if item_currency == 'USD':
                    val_usd = qty * unit_price
                    val_rmb = val_usd * rate
                else:
                    val_rmb = qty * unit_price
                    val_usd = val_rmb / rate if rate else 0
                total_rmb += val_rmb
                total_usd += val_usd
                items.append({'sku': row['sku'], 'qty': qty, 'unit_price': unit_price, 'currency': item_currency, 'value_rmb': val_rmb, 'value_usd': val_usd})
            
            orders.append({'po_num': po_num, 'supplier_code': supplier_code, 'order_date': order_date, 'currency': strategy.get('currency', 'RMB'), 'exchange_rate': strategy.get('exchange_rate', 0), 'items': items, 'total_rmb': total_rmb, 'total_usd': total_usd})
        
        return JsonResponse({'success': True, 'data': {'pmt_no': pmt_no, 'logistic_nums': logistic_nums, 'orders': orders}})
    except Exception as e:
        logger.exception("获取付款订单详情失败")
        return JsonResponse({'success': False, 'message': _('获取失败: {error}').format(error=str(e))}, status=500)



