"""
供应商管理模块

[审计修复 2026-01-02]:
- P1-2: 使用 logging 替代 traceback.print_exc
- P2-3: 添加HTTP方法限制
"""
import logging

from django.http import HttpResponse, JsonResponse
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST, require_GET
from django.db import transaction
from django.utils import timezone
from django.db.models import OuterRef, Subquery
from django.utils.translation import gettext as _

from core.services.security.policy_manager import SecurityPolicyManager
from core.sys.logger import get_audit_logger
from ..models import Supplier, SupplierStrategy
from ..forms import SupplierForm, SupplierStrategyForm
from .hub import check_perm

logger = logging.getLogger(__name__)
audit_logger = get_audit_logger()


# ===========================================
# 独立页面 Views（路由下沉后使用）
# ===========================================

@login_required(login_url='web_ui:login')
def supplier_add_page(request):
    """
    新增供应商独立页面
    GET: 渲染页面
    Permission: module.purchase.supplier.add
    """
    if not check_perm(request.user, 'module.purchase.supplier.add'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'purchase/pages/supplier_add.html')


@login_required(login_url='web_ui:login')
def supplier_strategy_page(request):
    """
    供应商管理独立页面
    GET: 渲染页面
    Permission: module.purchase.supplier.strategy
    """
    if not check_perm(request.user, 'module.purchase.supplier.strategy'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'purchase/pages/strategy.html')


# ===========================================
# 校验 API（供Step2前端调用，仅校验不写入）
# ===========================================

@login_required(login_url='web_ui:login')
@require_GET
def check_supplier_code_exists(request):
    """
    校验供应商代号是否已存在
    GET: /dashboard/purchase/api/supplier/code-exists/?code=AB
    返回: { "code": "AB", "exists": true/false }
    """
    code = request.GET.get('code', '').strip().upper()
    
    if not code:
        return JsonResponse({'code': '', 'exists': False, 'error': _('代号不能为空')})
    
    # 格式校验：必须为2位字母
    import re
    if not re.match(r'^[A-Za-z]{2}$', code):
        return JsonResponse({'code': code, 'exists': False, 'error': _('代号格式不正确')})
    
    # 数据库查重
    exists = Supplier.objects.filter(supplier_code=code).exists()
    
    return JsonResponse({'code': code, 'exists': exists})


@login_required(login_url='web_ui:login')
@require_GET
def check_strategy_date_conflict(request):
    """
    检查同供应商同生效日期是否已存在策略（覆盖确认流程用）
    GET: /dashboard/purchase/api/strategy/check-conflict/?code=AB&date=2024-01-01
    返回: { "conflict": true/false, "strategy_id": 123 }
    """
    code = request.GET.get('code', '').strip().upper()
    date = request.GET.get('date', '').strip()
    
    if not code or not date:
        return JsonResponse({'conflict': False, 'error': _('参数不完整')})
    
    try:
        supplier = Supplier.objects.get(supplier_code=code)
    except Supplier.DoesNotExist:
        return JsonResponse({'conflict': False, 'error': _('供应商不存在')})
    
    # 查找同日期策略
    existing = SupplierStrategy.objects.filter(
        supplier=supplier,
        effective_date=date
    ).first()
    
    if existing:
        return JsonResponse({
            'conflict': True,
            'strategy_id': existing.id,
            'message': _('该供应商在 %(date)s 已存在策略记录') % {'date': date}
        })
    
    return JsonResponse({'conflict': False})


# ===========================================
# API接口 Views（保持不变）
# ===========================================
@login_required(login_url='web_ui:login')
@require_POST
def add_supplier(request):
    """
    新增供应商的处理接口
    Permission: module.purchase.supplier.add
    Action: btn_add_supplier
    """
    try:
        # 1. 权限检查
        if not check_perm(request.user, 'module.purchase.supplier.add'):
            return JsonResponse({'success': False, 'message': _('权限不足: 无法访问该功能')}, status=403)

        # 2. 安全策略检查
        is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_add_supplier")
        if not is_valid:
            return JsonResponse({'success': False, 'message': sec_msg, 'status': 403}, status=403)

        # 3. 表单验证
        form_identity = SupplierForm(request.POST)
        form_strategy = SupplierStrategyForm(request.POST)

        if form_identity.is_valid() and form_strategy.is_valid():
            try:
                with transaction.atomic():
                    supplier = form_identity.save()
                    
                    strategy = form_strategy.save(commit=False)
                    strategy.supplier = supplier
                    strategy.status = True
                    strategy.effective_date = timezone.now()
                    strategy.note = "默认策略"
                    strategy.by = request.user.username
                    strategy.save()

                # 记录审计日志
                audit_logger.info(f"新增供应商: {supplier.supplier_code}", extra={
                    "user": request.user.username,
                    "func": "Purchase:SupplierAdd",
                    "action": "ADD_SUPPLIER",
                    "target": supplier.supplier_code
                })
                
                return JsonResponse({
                    'success': True, 
                    'message': _('供应商 %(code)s 已成功添加 (含策略)') % {'code': supplier.supplier_code}
                })
            except Exception as e:
                logger.exception("操作失败")
                return JsonResponse({'success': False, 'message': _('保存失败: %(error)s') % {'error': str(e)}}, status=500)
        else:
            errors = {}
            if form_identity.errors:
                errors.update(form_identity.errors)
            if form_strategy.errors:
                errors.update(form_strategy.errors)
            
            first_field = next(iter(errors.keys())) if errors else "Unknown"
            first_err = next(iter(errors.values()))[0] if errors else "Invalid Request"
            return JsonResponse({'success': False, 'message': _('表单错误 [%(field)s]: %(error)s') % {'field': first_field, 'error': first_err}}, status=400)

    except Exception as e:
        # import traceback  # P1-2: Removed
        logger.exception("操作失败")
        return JsonResponse({'success': False, 'message': f'Internal Server Error: {str(e)}'}, status=500)

@login_required(login_url='web_ui:login')
@require_GET
def supplier_list_api(request):
    """
    获取供应商列表
    Permission: module.purchase.supplier (任何供应商相关权限即可)
    """
    if not check_perm(request.user, 'module.purchase.supplier'):
         return JsonResponse({'success': False, 'message': 'Access Denied'}, status=403)

    latest_strategy = SupplierStrategy.objects.filter(
        supplier=OuterRef('pk')
    ).order_by('-effective_date')

    all_suppliers = Supplier.objects.all().order_by('supplier_code')
    
    data = []
    for s in all_suppliers:
        # Get latest strategy (Inefficient loop but accepted for now per original code)
        strategy = s.supplierstrategy_set.order_by('-effective_date', '-id').first()
        
        item = {
            'supplier_code': s.supplier_code,
            'supplier_name': s.supplier_name,
            'has_strategy': False
        }
        
        if strategy:
            item.update({
                'has_strategy': True,
                'category': strategy.category,
                'type': strategy.type or '',
                'currency': strategy.currency,
                'float_currency': strategy.float_currency,
                'float_threshold': strategy.float_threshold if strategy.float_currency else "该功能未启动",
                'depository': strategy.depository,
                'deposit_par': strategy.deposit_par if strategy.depository else "该功能未启动",
                'status': "合作方" if strategy.status else "非合作方",
                'status_bool': strategy.status,
                'note': strategy.note,
                'effective_date': strategy.effective_date.strftime('%Y-%m-%d'),
                'has_contract': bool(strategy.contract_file),
                # Note: This URL needs internal routing update later or be absolute
                # For now using relative path that matches new URLs
                'contract_url': f"/dashboard/purchase/supplier/contract/{strategy.id}/" if strategy.contract_file else None
            })
        else:
            item.update({
                'category': '-', 'type': '', 'currency': '-', 'float_currency': False,
                'float_threshold': '-', 'depository': False, 'deposit_par': '-',
                'status': '无策略', 'status_bool': False, 'note': '', 'effective_date': '-',
                'has_contract': False
            })
            
        data.append(item)
        
    return JsonResponse({'success': True, 'data': data})

@login_required(login_url='web_ui:login')
@require_POST
def modify_supplier_strategy(request):
    """
    修改策略
    Permission: module.purchase.supplier.strategy
    Action: btn_modify_strategy
    
    支持 override 参数：
    - 若存在同日期策略且未传 override=true，返回冲突错误
    - 若传 override=true，则更新现有策略
    """
    if not check_perm(request.user, 'module.purchase.supplier.strategy'):
         return JsonResponse({'success': False, 'message': 'Access Denied'}, status=403)
         
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_modify_strategy")
    if not is_valid:
        return JsonResponse({'success': False, 'message': sec_msg, 'status': 403}, status=403)

    supplier_code = request.POST.get('supplier_code')
    supplier_name = request.POST.get('supplier_name')
    override = request.POST.get('override', '').lower() == 'true'
    
    if not supplier_code:
        return JsonResponse({'success': False, 'message': 'Missing Supplier Code'}, status=400)
    
    try:
        supplier = Supplier.objects.get(supplier_code=supplier_code)
    except Supplier.DoesNotExist:
        return JsonResponse({'success': False, 'message': 'Supplier not found'}, status=404)
        
    form_strategy = SupplierStrategyForm(request.POST, request.FILES)
    
    if form_strategy.is_valid():
        try:
            with transaction.atomic():
                if supplier_name and supplier.supplier_name != supplier_name:
                    supplier.supplier_name = supplier_name
                    supplier.save()
                    
                eff_date = form_strategy.cleaned_data['effective_date']
                existing_strat = SupplierStrategy.objects.filter(
                    supplier=supplier, 
                    effective_date=eff_date
                ).first()
                
                contract_uploaded = bool(request.FILES.get('contract_file'))
                
                if existing_strat:
                    # 存在同日期策略，需要检查override
                    if not override:
                        return JsonResponse({
                            'success': False, 
                            'message': _('该供应商在此生效日期已存在策略，请确认覆盖'),
                            'conflict': True,
                            'strategy_id': existing_strat.id
                        }, status=409)
                    
                    # 允许覆盖，更新现有策略
                    form_update = SupplierStrategyForm(request.POST, request.FILES, instance=existing_strat)
                    if form_update.is_valid():
                        strat = form_update.save(commit=False)
                        strat.by = request.user.username
                        strat.save()
                    else:
                        raise Exception(f"Update Validation Error: {form_update.errors}")
                else:
                    # 新建策略
                    strat = form_strategy.save(commit=False)
                    strat.supplier = supplier
                    strat.by = request.user.username
                    strat.save()

            # 记录审计日志
            audit_logger.info(f"更新供应商策略: {supplier_code}", extra={
                "user": request.user.username,
                "func": "Purchase:SupplierStrategy",
                "action": "UPDATE_STRATEGY",
                "target": supplier_code
            })
            
            return JsonResponse({
                'success': True, 
                'message': _('策略已更新'),
                'contract_uploaded': contract_uploaded
            })
        except Exception as e:
            logger.exception("操作失败")
            return JsonResponse({'success': False, 'message': _('保存失败: %(error)s') % {'error': str(e)}}, status=500)
    else:
        first_field = next(iter(form_strategy.errors.keys()))
        first_err = next(iter(form_strategy.errors.values()))[0]
        return JsonResponse({'success': False, 'message': _('表单错误 [%(field)s]: %(error)s') % {'field': first_field, 'error': first_err}}, status=400)


@login_required(login_url='web_ui:login')
@require_GET
def view_contract_file(request, strategy_id):
    """
    查看合同文件
    Permission: module.purchase.supplier.strategy
    """
    if not check_perm(request.user, 'module.purchase.supplier.strategy'):
        return HttpResponse("Access Denied", status=403)
        
    try:
        strategy = SupplierStrategy.objects.get(pk=strategy_id)
        if not strategy.contract_file:
            return HttpResponse("No file", status=404)
        
        import mimetypes
        from django.http import FileResponse
        
        # 获取MIME类型（包括特殊格式）
        filepath = strategy.contract_file.path
        content_type, _ = mimetypes.guess_type(filepath)
        if content_type is None:
            # 特殊格式的MIME类型映射
            ext = filepath.lower().split('.')[-1] if '.' in filepath else ''
            special_mimes = {
                'heic': 'image/heic',
                'heif': 'image/heif',
                'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'xls': 'application/vnd.ms-excel',
                'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'doc': 'application/msword',
                'csv': 'text/csv',
            }
            content_type = special_mimes.get(ext, 'application/octet-stream')
        
        # 记录合同文件访问日志
        audit_logger.info(f"查看合同文件: {strategy.supplier.supplier_code}", extra={
            "user": request.user.username,
            "func": "Purchase:ViewContract",
            "action": "VIEW_CONTRACT",
            "target": str(strategy_id)
        })
        
        response = FileResponse(strategy.contract_file.open('rb'), content_type=content_type)
        response['X-Frame-Options'] = 'SAMEORIGIN'
        return response
    except SupplierStrategy.DoesNotExist:
         return HttpResponse("Not Found", status=404)
