# File Path: backend/apps/inventory/views.py
"""
库存板块视图 - 简单 Hub 页面
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.utils.translation import gettext as _

from core.services.auth.service import AuthService
from core.services.data_manager import DataManager


def _check_perm(user, perm_key: str) -> bool:
    """检查用户是否有精确的权限 key"""
    if user.is_superuser:
        return True
    
    user_perms = AuthService.get_permissions(user.username)
    return perm_key in user_perms


@login_required(login_url='web_ui:login')
def inventory_hub(request):
    """库存板块 Hub 页面 - 纯入口，使用 URL 跳转到子页面"""
    # 使用与 modules.json 一致的精确 leaf key
    perms = AuthService.get_permissions(request.user.username)
    
    can_upload = request.user.is_superuser or bool(perms.get('module.inventory.stocktake.upload'))
    can_modify = request.user.is_superuser or bool(perms.get('module.inventory.stocktake.modify'))
    
    hub_items = [
        {
            'id': 'upload',
            'name': _('手动上传盘存'),
            'icon': 'fas fa-cloud-arrow-up',
            'desc': _('上传库存盘点 CSV 文件，校验后同步到盘存表。'),
            'url': '/dashboard/inventory/upload/',
            'has_access': can_upload
        },
        {
            'id': 'modify',
            'name': _('库存修改向导'),
            'icon': 'fas fa-edit',
            'desc': _('按步骤修正单品库存或删除整列数据。'),
            'url': '/dashboard/inventory/edit/',
            'has_access': can_modify
        }
    ]
    
    return render(request, 'inventory/hub.html', {
        'hub_items': hub_items,
    })


@login_required(login_url='web_ui:login')
def inventory_upload_page(request):
    """手动上传盘存子页面"""
    if not _check_perm(request.user, 'module.inventory.stocktake.upload'):
        return render(request, "errors/403.html", status=403)
    
    return render(request, 'inventory/pages/upload.html')


@login_required(login_url='web_ui:login')
def inventory_edit_page(request):
    """库存修改向导子页面"""
    if not _check_perm(request.user, 'module.inventory.stocktake.modify'):
        return render(request, "errors/403.html", status=403)
    
    # 获取库存日期列用于修改向导
    mgr = DataManager()
    inv_columns = mgr.get_inventory_columns()
    
    return render(request, 'inventory/pages/edit.html', {
        'inv_columns': inv_columns
    })