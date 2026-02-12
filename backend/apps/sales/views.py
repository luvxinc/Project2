# File: backend/apps/sales/views.py
"""
销售板块视图 - 简单 Hub 页面
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
def sales_hub(request):
    """销售板块 Hub 页面"""
    # 使用与 modules.json 一致的精确 leaf key
    perms = AuthService.get_permissions(request.user.username)
    
    can_trans = request.user.is_superuser or bool(perms.get('module.sales.transactions.upload'))
    can_reports_gen = request.user.is_superuser or bool(perms.get('module.sales.reports.generate'))
    can_reports_center = request.user.is_superuser or bool(perms.get('module.sales.reports.center'))
    can_visuals = request.user.is_superuser or bool(perms.get('module.sales.visuals.dashboard'))
    can_ebay = request.user.is_superuser or bool(perms.get('module.sales.ebay.sync'))
    
    hub_items = [
        {
            'id': 'ebay_api',
            'name': _('eBay API 同步'),
            'icon': 'fab fa-ebay',
            'desc': _('自动同步 eBay 订单和财务数据，无需手动上传 CSV。'),
            'has_access': can_ebay,
            'url': '/ebay/'
        },
        {
            'id': 'trans',
            'name': _('交易数据上传'),
            'icon': 'fas fa-cloud-arrow-up',
            'desc': _('上传 eBay Transaction/Earning CSV 报表，系统自动解析、清洗、转换。'),
            'has_access': can_trans,
            'url': '/dashboard/sales/upload/'
        },
        {
            'id': 'reports_gen',
            'name': _('报表生成器'),
            'icon': 'fas fa-file-export',
            'desc': _('生成自定义业务报表，支持多种格式导出。'),
            'has_access': can_reports_gen,
            'url': '/dashboard/sales/report_builder/'
        },
        {
            'id': 'reports_center',
            'name': _('报表中心'),
            'icon': 'fas fa-chart-pie',
            'desc': _('查看和管理已生成的报表。'),
            'has_access': can_reports_center,
            'url': '/dashboard/sales/report_center/'
        },
        {
            'id': 'visuals',
            'name': _('数据交互可视化'),
            'icon': 'fas fa-chart-line',
            'desc': _('交互式数据可视化与深度分析。'),
            'has_access': can_visuals,
            'url': '/dashboard/sales/visualization/'
        }
    ]
    
    return render(request, 'sales/hub.html', {'hub_items': hub_items})


@login_required(login_url='web_ui:login')
def upload_page(request):
    """交易数据上传子页面"""
    if not _check_perm(request.user, 'module.sales.transactions.upload'):
        return render(request, "errors/403.html", status=403)
    return render(request, 'sales/pages/upload.html')


@login_required(login_url='web_ui:login')
def report_builder_page(request):
    """报表生成器子页面"""
    if not _check_perm(request.user, 'module.sales.reports.generate'):
        return render(request, "errors/403.html", status=403)
    return render(request, 'sales/pages/report_builder.html')


@login_required(login_url='web_ui:login')
def report_center_page(request):
    """报表中心子页面"""
    if not _check_perm(request.user, 'module.sales.reports.center'):
        return render(request, "errors/403.html", status=403)
    return render(request, 'sales/pages/report_center.html')


@login_required(login_url='web_ui:login')
def visualization_page(request):
    """数据交互可视化子页面"""
    if not _check_perm(request.user, 'module.sales.visuals.dashboard'):
        return render(request, "errors/403.html", status=403)
    return render(request, 'sales/pages/visualization.html')

