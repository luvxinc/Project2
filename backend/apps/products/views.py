# File: backend/apps/products/views.py
"""
产品板块视图 - 简单 Hub 页面
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _

from core.services.auth.service import AuthService


def _check_perm(user, perm_key: str) -> bool:
    """检查用户是否有精确的权限 key"""
    if user.is_superuser:
        return True
    
    user_perms = AuthService.get_permissions(user.username)
    return perm_key in user_perms


@login_required(login_url='web_ui:login')
def products_hub(request):
    """产品板块 Hub 页面"""
    # 使用与 modules.json 一致的精确 leaf key
    perms = AuthService.get_permissions(request.user.username)
    
    can_cogs = request.user.is_superuser or bool(perms.get('module.products.catalog.cogs'))
    can_create = request.user.is_superuser or bool(perms.get('module.products.catalog.create'))
    can_barcode = request.user.is_superuser or bool(perms.get('module.products.barcode.generate'))
    
    hub_items = [
        {
            'id': 'cogs',
            'name': _('产品数据维护'),
            'icon': 'fas fa-file-invoice-dollar',
            'desc': _('批量编辑产品成本、运费及分类信息。'),
            'has_access': can_cogs,
            'url': '/dashboard/products/data/'
        },
        {
            'id': 'create',
            'name': _('新增产品'),
            'icon': 'fas fa-plus-circle',
            'desc': _('创建新的产品档案并初始化库存记录。'),
            'has_access': can_create,
            'url': '/dashboard/products/add/'
        },
        {
            'id': 'barcode',
            'name': _('外包装条形码'),
            'icon': 'fas fa-barcode',
            'desc': _('根据 SKU 和包装规格批量生成条形码 PDF。'),
            'has_access': can_barcode,
            'url': '/dashboard/products/barcode/'
        }
    ]
    
    return render(request, 'products/hub.html', {'hub_items': hub_items})


@login_required(login_url='web_ui:login')
def product_data(request):
    """产品数据维护页面（原 COGS 档案维护）"""
    if not _check_perm(request.user, 'module.products.catalog.cogs'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'products/pages/data.html')


@login_required(login_url='web_ui:login')
def product_add(request):
    """新增产品页面（原批量新增 SKU）"""
    if not _check_perm(request.user, 'module.products.catalog.create'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'products/pages/add.html')


@login_required(login_url='web_ui:login')
def product_barcode(request):
    """外包装条形码生成页面"""
    if not _check_perm(request.user, 'module.products.barcode.generate'):
        return render(request, 'errors/403.html', status=403)
    
    # 获取 SKU 列表供前端下拉选择
    from core.components.db.client import DBClient
    
    sku_list = []
    try:
        df = DBClient.read_df("SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU")
        if not df.empty:
            sku_list = df['SKU'].dropna().tolist()
    except Exception as e:
        pass  # 静默处理，前端会显示空列表
    
    return render(request, 'products/pages/barcode.html', {
        'sku_list': sku_list
    })
