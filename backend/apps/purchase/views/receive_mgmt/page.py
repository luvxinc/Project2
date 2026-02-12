"""
入库管理 - 页面渲染

[P0-2 Fix] 统一使用 hub.check_perm
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

from ..hub import check_perm


@login_required(login_url='web_ui:login')
def receive_mgmt_page(request):
    """
    入库管理列表页面
    Permission: module.purchase.receive.mgmt
    URL: /dashboard/purchase/receive_mgmt/
    """
    if not check_perm(request.user, 'module.purchase.receive.mgmt'):
        return render(request, 'errors/403.html', status=403)
    
    context = {
        'page_title': '入库管理',
        'breadcrumb': [
            {'name': '采购', 'url': '/dashboard/purchase/'},
            {'name': '入库管理', 'url': None}
        ],
    }
    return render(request, 'purchase/pages/receive_mgmt.html', context)
