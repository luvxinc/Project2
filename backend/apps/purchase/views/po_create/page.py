"""
新建采购订单 - 页面视图

[P0-2 Fix] 统一使用 hub.check_perm
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required

from ..hub import check_perm


@login_required(login_url='web_ui:login')
def po_add_page(request):
    """
    新建采购订单向导页面
    Permission: module.purchase.po.add
    """
    if not check_perm(request.user, 'module.purchase.po.add'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'purchase/pages/po_add.html')
