"""
新建发货单 - 查询API

[P0-2 Fix] 统一使用 hub.check_perm
"""
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ..hub import check_perm
from core.components.db.client import DBClient
from django.utils.translation import gettext as _


@login_required(login_url='web_ui:login')
@require_GET
def check_logistic_num_exists_api(request):
    """
    检查物流单号是否已存在
    Permission: module.purchase.send.add
    
    GET 参数:
        logistic_num: 物流单号
    
    返回:
        {exists: true/false}
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    logistic_num = request.GET.get('logistic_num', '').strip()
    if not logistic_num:
        return JsonResponse({'success': False, 'message': _('物流单号不能为空')}, status=400)
    
    try:
        df = DBClient.read_df(
            "SELECT COUNT(*) as cnt FROM in_send WHERE logistic_num = :num",
            params={'num': logistic_num}
        )
        exists = bool(df['cnt'].iloc[0] > 0) if not df.empty else False
        return JsonResponse({'success': True, 'exists': exists})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_po_list_for_send_api(request):
    """
    获取可用于发货的采购订单列表
    Permission: module.purchase.send.add
    
    返回:
        {success: true, data: [{po_num, supplier_code, date, total_qty}, ...]}
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    try:
        # 获取未完全发货的采购订单
        df = DBClient.read_df("""
            SELECT DISTINCT po_num, supplier_code, update_date 
            FROM in_po 
            WHERE action != 'delete'
            ORDER BY update_date DESC, po_num DESC
        """)
        
        if df.empty:
            return JsonResponse({'success': True, 'data': []})
        
        result = []
        for _idx, row in df.iterrows():
            result.append({
                'po_num': row['po_num'],
                'supplier_code': row['supplier_code'],
                'date': str(row['update_date'])
            })
        
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_GET
def get_po_items_for_send_api(request):
    """
    获取指定采购订单的商品列表（用于发货录入）
    Permission: module.purchase.send.add
    
    GET 参数:
        po_num: 订单号
    
    返回:
        {success: true, data: [{sku, qty, unit_price}, ...]}
    """
    if not check_perm(request.user, 'module.purchase.send.add'):
        return JsonResponse({'success': False, 'message': _('无权限')}, status=403)
    
    po_num = request.GET.get('po_num', '').strip()
    if not po_num:
        return JsonResponse({'success': False, 'message': _('订单号不能为空')}, status=400)
    
    try:
        # 获取订单最新版本的商品列表
        df = DBClient.read_df("""
            SELECT po_sku, SUM(po_quantity) as qty, MAX(po_price) as unit_price
            FROM in_po
            WHERE po_num = :po_num AND action != 'delete'
            GROUP BY po_sku
            HAVING SUM(po_quantity) > 0
            ORDER BY po_sku
        """, params={'po_num': po_num})
        
        if df.empty:
            return JsonResponse({'success': True, 'data': []})
        
        result = []
        for _idx, row in df.iterrows():
            result.append({
                'sku': row['po_sku'],
                'qty': int(row['qty']),
                'unit_price': float(row['unit_price'])
            })
        
        return JsonResponse({'success': True, 'data': result})
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=500)
