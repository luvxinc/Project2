"""
货物入库 - 页面视图

[P0-2 Fix] 统一使用 hub.check_perm
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_GET

from ..hub import check_perm


@login_required(login_url='web_ui:login')
@require_GET
def receive_page(request):
    """
    货物入库页面
    Permission: module.purchase.receive
    """
    if not check_perm(request.user, 'module.purchase.receive'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'purchase/pages/receive.html')
