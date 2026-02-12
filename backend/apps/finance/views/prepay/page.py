# File: backend/apps/finance/views/prepay/page.py
"""
厂商预付款管理 - 页面视图
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required(login_url='web_ui:login')
def prepay_page(request):
    """预付款管理主页面"""
    return render(request, 'finance/pages/prepay.html')
