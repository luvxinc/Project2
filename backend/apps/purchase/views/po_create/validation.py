"""
新建采购订单 - 验证API

[P0-2 Fix] 统一使用 hub.check_perm
"""
import json
from django.utils.translation import gettext as _
from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

from ..hub import check_perm


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def validate_po_params_api(request):
    """
    验证采购订单合同参数
    Permission: module.purchase.po.add
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    
    try:
        data = json.loads(request.body)
        errors = []
        
        supplier_code = data.get('supplier_code', '').strip()
        if not supplier_code:
            errors.append({'field': _('供应商'), 'message': _('请选择供应商')})
        
        po_date = data.get('po_date', '').strip()
        if not po_date:
            errors.append({'field': _('订单日期'), 'message': _('请选择订单日期')})
        
        currency = data.get('currency', '').strip()
        if currency not in ['USD', 'RMB']:
            errors.append({'field': _('结算货币'), 'message': _('货币类型必须是 USD 或 RMB')})
        
        exchange_rate = data.get('exchange_rate')
        try:
            rate = float(exchange_rate) if exchange_rate else 0
            if rate <= 0:
                errors.append({'field': _('结算汇率'), 'message': _('汇率必须大于0')})
        except (ValueError, TypeError):
            errors.append({'field': _('结算汇率'), 'message': _('汇率格式无效')})
        
        if errors:
            return JsonResponse({'success': False, 'errors': errors})
        
        return JsonResponse({'success': True, 'message': _('参数验证通过')})
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('请求数据格式错误')}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["POST"])
def validate_po_items_api(request):
    """
    验证采购订单商品数据
    Permission: module.purchase.po.add
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    
    try:
        data = json.loads(request.body)
        items = data.get('items', [])
        errors = []
        
        if not items:
            errors.append({'field': _('商品列表'), 'message': _('请至少添加一个商品')})
            return JsonResponse({'success': False, 'errors': errors})
        
        for idx, item in enumerate(items, 1):
            sku = item.get('sku', '').strip()
            if not sku:
                errors.append({'field': _('第%(idx)s行 SKU') % {'idx': idx}, 'message': _('SKU不能为空')})
            
            qty = item.get('qty')
            try:
                qty_val = int(qty) if qty else 0
                if qty_val <= 0:
                    errors.append({'field': _('第%(idx)s行 数量') % {'idx': idx}, 'message': _('数量必须大于0')})
            except (ValueError, TypeError):
                errors.append({'field': _('第%(idx)s行 数量') % {'idx': idx}, 'message': _('数量格式无效')})
            
            unit_price = item.get('unit_price')
            try:
                price_val = float(unit_price) if unit_price else 0
                if price_val <= 0:
                    errors.append({'field': _('第%(idx)s行 单价') % {'idx': idx}, 'message': _('单价必须大于0')})
            except (ValueError, TypeError):
                errors.append({'field': _('第%(idx)s行 单价') % {'idx': idx}, 'message': _('单价格式无效')})
        
        if errors:
            return JsonResponse({'success': False, 'errors': errors})
        
        return JsonResponse({'success': True, 'message': _('商品数据验证通过'), 'item_count': len(items)})
        
    except json.JSONDecodeError:
        return JsonResponse({'success': False, 'message': _('请求数据格式错误')}, status=400)
    except Exception as e:
        return JsonResponse({'success': False, 'message': str(e)}, status=500)
