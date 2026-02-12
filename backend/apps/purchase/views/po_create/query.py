"""
新建采购订单 - 查询API
包含：供应商列表、供应商策略、汇率查询

[P0-2 Fix] 统一使用 hub.check_perm
[P1-2 Fix] 使用 logging 替代 traceback.print_exc
"""
import json
import logging
from datetime import datetime

from django.http import JsonResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

from ..hub import check_perm

from django.utils.translation import gettext as _

logger = logging.getLogger(__name__)


@login_required(login_url='web_ui:login')
@require_http_methods(["GET"])
def supplier_list_for_po_api(request):
    """
    获取供应商列表（用于采购订单选择）
    Permission: module.purchase.po.add
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    
    try:
        from backend.apps.purchase.models import Supplier
        
        suppliers = Supplier.objects.all().order_by('supplier_code')
        result = []
        
        for sp in suppliers:
            result.append({
                'code': sp.supplier_code,
                'name': sp.supplier_name,
            })
        
        return JsonResponse({'success': True, 'suppliers': result})
    
    except Exception as e:
        logger.exception("获取供应商列表失败")
        return JsonResponse({'success': False, 'message': _('获取供应商列表失败: %(error)s') % {'error': str(e)}}, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["GET"])
def supplier_strategy_for_po_api(request):
    """
    获取供应商策略信息（根据supplier_code和日期）
    Permission: module.purchase.po.add
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    
    try:
        from backend.apps.purchase.models import SupplierStrategy
        
        supplier_code = request.GET.get('supplier_code', '').strip()
        date_str = request.GET.get('date', '').strip()
        
        if not supplier_code:
            return JsonResponse({'success': False, 'message': _('请提供供应商代号')}, status=400)
        
        if not date_str:
            return JsonResponse({'success': False, 'message': _('请提供订单日期')}, status=400)
        
        try:
            target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
        except ValueError:
            return JsonResponse({'success': False, 'message': _('日期格式无效')}, status=400)
        
        strategy = SupplierStrategy.objects.filter(
            supplier_id=supplier_code,
            effective_date__lte=target_date
        ).order_by('-effective_date').first()
        
        if not strategy:
            return JsonResponse({
                'success': False, 
                'message': _('未找到供应商 %(code)s 在 %(date)s 之前生效的策略') % {'code': supplier_code, 'date': date_str},
                'no_strategy': True
            })
        
        result = {
            'success': True,
            'strategy': {
                'id': strategy.id,
                'supplier_code': supplier_code,
                'effective_date': strategy.effective_date.strftime('%Y-%m-%d'),
                'currency': strategy.currency,
                'float_currency': strategy.float_currency,
                'float_threshold': float(strategy.float_threshold) if strategy.float_threshold else 0,
                'depository': strategy.depository,
                'deposit_par': float(strategy.deposit_par) if strategy.deposit_par else 0,
                'note': strategy.note or '',
            }
        }
        
        return JsonResponse(result)
    
    except Exception as e:
        logger.exception("获取供应商策略失败")
        return JsonResponse({'success': False, 'message': _('获取供应商策略失败: %(error)s') % {'error': str(e)}}, status=500)


@login_required(login_url='web_ui:login')
@require_http_methods(["GET"])
def get_exchange_rate_api(request):
    """
    获取指定日期的 USD/RMB 汇率（买入价）
    Permission: module.purchase.po.add
    
    历史日期支持: 使用 fawazahmed0 CDN API (支持任意历史日期)
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return JsonResponse({'error': 'Forbidden'}, status=403)
    
    date_str = request.GET.get('date', '').strip()
    
    if not date_str:
        return JsonResponse({'success': False, 'message': _('请提供日期')}, status=400)
    
    try:
        target_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        return JsonResponse({'success': False, 'message': _('日期格式无效')}, status=400)
    
    today = datetime.now().date()
    
    # 未来日期 - 无法获取汇率，必须手动输入
    if target_date > today:
        return JsonResponse({
            'success': True,
            'rate': None,
            'source': 'manual_required',
            'is_future': True,
            'need_manual': True,
            'message': _('所选日期 %(date)s 是未来日期，汇率尚未公布，请手动输入预估汇率') % {'date': date_str}
        })
    
    import urllib.request
    import ssl
    
    context = ssl.create_default_context()
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    
    exchange_rate = None
    rate_source_name = None
    
    # ========== 历史日期: 使用多个历史汇率API ==========
    # 优先级: fawazahmed0 CDN > Frankfurter (欧洲央行)
    if target_date < today:
        history_sources = [
            {
                'name': 'fawazahmed0_cdn',
                'url': f'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date_str}/v1/currencies/usd.json',
                'parser': lambda d: d.get('usd', {}).get('cny')
            },
            {
                'name': 'frankfurter',
                'url': f'https://api.frankfurter.app/{date_str}?from=USD&to=CNY',
                'parser': lambda d: d.get('rates', {}).get('CNY')
            },
        ]
        
        for source in history_sources:
            try:
                req = urllib.request.Request(
                    source['url'],
                    headers={'User-Agent': 'Mozilla/5.0 (compatible; ERPBot/1.0)'}
                )
                with urllib.request.urlopen(req, timeout=8, context=context) as response:
                    data = json.loads(response.read().decode())
                    rate = source['parser'](data)
                    if rate and rate > 1:
                        exchange_rate = round(rate, 4)
                        rate_source_name = source['name']
                        logger.info(f"[ExchangeRate] 历史汇率获取成功 ({source['name']}): {date_str} = {exchange_rate}")
                        break
            except Exception as e:
                logger.warning(f"[ExchangeRate] {source['name']} 获取失败 ({date_str}): {e}")
                continue
    
    # ========== 今天或历史API失败: 使用实时API ==========
    if not exchange_rate:
        rate_sources = [
            {
                'name': 'open.er-api',
                'url': 'https://open.er-api.com/v6/latest/USD',
                'parser': lambda d: d.get('rates', {}).get('CNY') if d.get('result') == 'success' else None
            },
            {
                'name': 'exchangerate-api',
                'url': 'https://api.exchangerate-api.com/v4/latest/USD',
                'parser': lambda d: d.get('rates', {}).get('CNY') if 'rates' in d else None
            },
        ]
        
        for source in rate_sources:
            try:
                req = urllib.request.Request(
                    source['url'], 
                    headers={'User-Agent': 'Mozilla/5.0 (compatible; ERPBot/1.0)'}
                )
                
                with urllib.request.urlopen(req, timeout=5, context=context) as response:
                    data = json.loads(response.read().decode())
                    rate = source['parser'](data)
                    if rate and rate > 1:
                        exchange_rate = round(rate, 4)
                        rate_source_name = source['name']
                        break
            except Exception:
                continue
    
    if exchange_rate:
        if target_date == today:
            rate_desc = _('今日实时汇率')
        else:
            rate_desc = _('%(date)s 历史汇率') % {'date': target_date.strftime("%Y-%m-%d")}
        
        return JsonResponse({
            'success': True,
            'rate': exchange_rate,
            'source': 'api',
            'source_name': rate_source_name,
            'is_future': False,
            'need_manual': False,
            'rate_desc': rate_desc,
            'rate_date': target_date.strftime("%Y-%m-%d"),
            'message': _('已获取USD/RMB汇率：%(rate)s') % {'rate': exchange_rate}
        })
    else:
        return JsonResponse({
            'success': True,
            'rate': None,
            'source': 'manual_required',
            'is_future': False,
            'need_manual': True,
            'message': _('无法自动获取汇率，请手动输入当日USD/RMB买入价')
        })
