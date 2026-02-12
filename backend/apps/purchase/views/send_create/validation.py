"""
新建发货单 - 验证API

[P0-2 Fix] 统一使用 hub.check_perm
"""
import json
from datetime import datetime

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST

from ..hub import check_perm
from core.components.db.client import DBClient
from django.utils.translation import gettext as _


@login_required(login_url='web_ui:login')
@require_POST
def validate_send_logistics_api(request):
    """
    验证发货单物流参数
    Permission: module.purchase.send.add
    
    POST 参数:
        date_sent: 发货日期
        date_eta: 预计到达日期
        logistic_num: 物流单号
        pallets: 托盘数
        total_weight: 发货总重量
        price_kg: 物流单价
        usd_rmb: 结算汇率
    
    返回:
        {success: true, errors: []}
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        data = request.POST
    
    errors = []
    
    # 获取前端传来的最晚订单日期（用于验证发货日期）
    latest_order_date_str = data.get('latest_order_date', '')
    date_sent_str = data.get('date_sent', '').strip()
    date_eta_str = data.get('date_eta', '').strip()
    
    # 验证发货日期：必须 >= 所有订单日期中最晚的日期
    if date_sent_str and latest_order_date_str:
        try:
            date_sent = datetime.strptime(date_sent_str, '%Y-%m-%d').date()
            latest_order_date = datetime.strptime(latest_order_date_str, '%Y-%m-%d').date()
            if date_sent < latest_order_date:
                errors.append({
                    'field': 'date_sent', 
                    'message': _('发货日期不能早于订单日期（最晚订单日期为 %(date)s）') % {'date': latest_order_date_str}
                })
        except ValueError:
            pass  # 日期格式错误会在其他地方处理
    
    # 验证预计到达日期：必须 >= 发货日期
    if date_sent_str and date_eta_str:
        try:
            date_sent = datetime.strptime(date_sent_str, '%Y-%m-%d').date()
            date_eta = datetime.strptime(date_eta_str, '%Y-%m-%d').date()
            if date_eta < date_sent:
                errors.append({
                    'field': 'date_eta', 
                    'message': _('预计到达日期不能早于发货日期')
                })
        except ValueError:
            pass  # 日期格式错误会在其他地方处理
    
    # 验证物流单号唯一性
    logistic_num = data.get('logistic_num', '').strip()
    if logistic_num:
        df = DBClient.read_df(
            "SELECT COUNT(*) as cnt FROM in_send WHERE logistic_num = :num",
            params={'num': logistic_num}
        )
        if not df.empty and df['cnt'].iloc[0] > 0:
            errors.append({'field': 'logistic_num', 'message': _('物流单号已存在，请勿重复录入')})
    else:
        errors.append({'field': 'logistic_num', 'message': _('物流单号不能为空')})
    
    # 验证托盘数
    try:
        pallets = int(data.get('pallets', 0))
        if pallets < 0:
            errors.append({'field': 'pallets', 'message': _('托盘数必须大于等于0')})
    except (ValueError, TypeError):
        errors.append({'field': 'pallets', 'message': _('托盘数必须是整数')})
    
    # 验证总重量
    try:
        total_weight = float(data.get('total_weight', 0))
        if total_weight <= 0:
            errors.append({'field': 'total_weight', 'message': _('发货总重量必须大于0')})
    except (ValueError, TypeError):
        errors.append({'field': 'total_weight', 'message': _('发货总重量必须是数字')})
    
    # 验证单价
    try:
        price_kg = float(data.get('price_kg', 0))
        if price_kg <= 0:
            errors.append({'field': 'price_kg', 'message': _('物流单价必须大于0')})
    except (ValueError, TypeError):
        errors.append({'field': 'price_kg', 'message': _('物流单价必须是数字')})
    
    # 验证汇率（如果是手动输入）
    usd_rmb = data.get('usd_rmb')
    is_manual_rate = data.get('is_manual_rate', False)
    if is_manual_rate and usd_rmb is not None:
        try:
            rate = float(usd_rmb)
            if rate < 1:
                errors.append({'field': 'usd_rmb', 'message': _('结算汇率必须大于1')})
        except (ValueError, TypeError):
            errors.append({'field': 'usd_rmb', 'message': _('结算汇率必须是数字')})
    
    return JsonResponse({
        'success': len(errors) == 0,
        'errors': errors
    })


@login_required(login_url='web_ui:login')
@require_POST
def validate_send_items_api(request):
    """
    验证发货单商品数据
    Permission: module.purchase.send.add
    
    POST 参数:
        items: [{po_num, sku, quantity}, ...]
    
    返回:
        {success: true, errors: []}
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        data = json.loads(request.body)
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('数据格式错误')}, status=400)
    
    items = data.get('items', [])
    errors = []
    
    if not items:
        errors.append({'field': 'items', 'message': _('请至少添加一个商品')})
        return JsonResponse({'success': False, 'errors': errors})
    
    # 验证每个商品
    valid_skus = set()
    df_skus = DBClient.read_df("SELECT DISTINCT SKU FROM Data_COGS")
    if not df_skus.empty:
        valid_skus = set(df_skus['SKU'].str.upper().tolist())
    
    for idx, item in enumerate(items):
        row_num = idx + 1
        
        # 验证SKU存在
        sku = item.get('sku', '').strip().upper()
        if not sku:
            errors.append({'row': row_num, 'field': 'sku', 'message': _('SKU不能为空')})
        elif sku not in valid_skus:
            errors.append({'row': row_num, 'field': 'sku', 'message': _('SKU %s 不存在') % sku})
        
        # 验证数量
        try:
            qty = int(item.get('quantity', 0))
            if qty <= 0:
                errors.append({'row': row_num, 'field': 'quantity', 'message': _('数量必须大于0')})
        except (ValueError, TypeError):
            errors.append({'row': row_num, 'field': 'quantity', 'message': _('数量必须是正整数')})
        
        # 验证订单号
        po_num = item.get('po_num', '').strip()
        if not po_num:
            errors.append({'row': row_num, 'field': 'po_num', 'message': _('订单号不能为空')})
    
    return JsonResponse({
        'success': len(errors) == 0,
        'errors': errors
    })
