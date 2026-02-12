"""
发货单管理 - 页面渲染
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_http_methods

from ..hub import check_perm


@login_required(login_url='web_ui:login')
@require_http_methods(["GET"])
def send_mgmt_page(request):
    """
    发货单管理主页面
    Permission: module.purchase.send.mgmt
    """
    if not check_perm(request.user, 'module.purchase.send.mgmt'):
        return render(request, 'errors/403.html', status=403)
    
    return render(request, 'purchase/pages/send_mgmt.html')
