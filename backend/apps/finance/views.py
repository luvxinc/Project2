# File: backend/apps/finance/views.py
"""
财务板块视图 (空Hub)
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required


@login_required(login_url='web_ui:login')
def finance_hub(request):
    """财务板块 Hub 页面 (空)"""
    return render(request, 'finance/hub.html')
