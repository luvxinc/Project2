from django.utils.translation import gettext as _
# File Path: backend/apps/reports/views.py
"""
文件说明: 报表模块视图 (Report Views)
包含:
1. API 视图 (REST): generate_profit_report
2. Web 视图 (Django + HTMX): dashboard, generator, center
"""

import os
import datetime
from pathlib import Path
from django.shortcuts import render
from django.http import HttpResponse, FileResponse
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

# Core Services
from core.services.report_manager import ReportFileManager
from core.services.finance.sales import SalesQtyAnalyzer
from core.services.finance.profit_sku import SkuProfitAnalyzer
from core.services.finance.profit_listing import ListingProfitAnalyzer
from core.services.finance.profit_combo import ComboProfitAnalyzer
from core.services.crm import CustomerAnalyzer
from core.services.logistics import ShippingAnalyzer
from core.services.inventory_snapshot import InventorySnapshot
from core.services.prediction import PredictionService
from core.services.ordering import OrderingService

from backend.core.services.security.policy_manager import SecurityPolicyManager
from backend.core.services.auth.service import AuthService
from backend.common.settings import settings as app_settings
from core.sys.context import set_current_user
from core.sys.logger import get_audit_logger

audit_logger = get_audit_logger()

# =============================================================================
# Utility Functions
# =============================================================================

def check_feature_switch(module_key):
    """Check if module is enabled"""
    try:
        from backend.common.settings import settings
        config = settings.load_modules_config()
        for mod in config:
            if mod.get('key') == module_key:
                return mod.get('enabled', True)
        return True  # Default enabled if not found
    except:
        return True

def check_perm(user, perm_key):
    """
    Check user permission.
    
    [P0-2 Fix] STRICT leaf-node enforcement:
    - AuthService.get_permissions() already handles parent inference (child implies parent)
    - We do NOT do reverse inference here (having parent does NOT imply having all children)
    """
    if user.is_superuser:
        return True
    perms = AuthService.get_permissions(user.username)
    # Direct match only - AuthService already handles parent inference
    return perms.get(perm_key, False)

def get_file_info(filepath):
    """Get file info dict for template"""
    stat = os.stat(filepath)
    size_bytes = stat.st_size
    if size_bytes < 1024:
        size_display = f"{size_bytes} B"
    elif size_bytes < 1024*1024:
        size_display = f"{size_bytes/1024:.1f} KB"
    else:
        size_display = f"{size_bytes/(1024*1024):.1f} MB"
    
    modified = datetime.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M")
    
    return {
        'name': os.path.basename(filepath),
        'size': size_bytes,
        'size_display': size_display,
        'modified': modified,
    }

def parse_csv_for_preview(filepath):
    """Parse CSV file for preview display"""
    try:
        from core.components.utils.csv_parser import parse_compound_csv
        tables = parse_compound_csv(Path(filepath))
        result = []
        for title, df in tables:
            result.append({
                'title': title,
                'rows': len(df),
                'columns': list(df.columns),
                'data': df.values.tolist()[:100]  # Limit to 100 rows
            })
        return result
    except Exception as e:
        return []

# =============================================================================
# Web Views (Django + HTMX)
# =============================================================================

@login_required(login_url='web_ui:login')
def dashboard_view(request):
    """Main reports dashboard with Hub layout"""
    if not check_feature_switch("reports"):
        return render(request, "errors/403.html", status=403)
    
    if not check_perm(request.user, 'module.sales.reports'):
        return render(request, "errors/403.html", status=403)
    
    # Set context for ReportFileManager
    set_current_user(request.user.username)
    
    # [P0-2 Fix] Each feature checks its SPECIFIC leaf permission only
    perms = AuthService.get_permissions(request.user.username)
    
    # Hub items - 显示所有，通过 has_access 控制点击行为
    hub_items = [
        {
            'id': 'generator',
            'name': _('报表生成器'),
            'icon': 'fas fa-rocket',
            'desc': _('配置分析周期并启动全量分析引擎，生成商业智能报表。'),
            'has_access': request.user.is_superuser or bool(perms.get('module.sales.reports.generate'))
        },
        {
            'id': 'center',
            'name': _('报表中心'),
            'icon': 'fas fa-folder-open',
            'desc': _('预览、下载和管理已生成的分析报表文件。'),
            'has_access': request.user.is_superuser or bool(perms.get('module.sales.reports.center'))
        }
    ]
    
    return render(request, "reports/dashboard.html", {
        'hub_items': hub_items,
    })

@login_required
def generator_form(request):
    """HTMX: Load generator form"""
    if not check_perm(request.user, 'module.sales.reports.generate'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    # Default dates (previous month)
    today = datetime.date.today()
    first_curr = today.replace(day=1)
    last_prev = first_curr - datetime.timedelta(days=1)
    first_prev = last_prev.replace(day=1)
    
    # Get settings defaults
    loss_rates = getattr(app_settings, 'LOSS_RATES', {
        'CASE': 0.05, 'REQUEST': 0.03, 'RETURN': 0.02, 'DISPUTE': 0.01
    })
    
    # Task list for display
    task_list = [
        {'name': 'SKU 销量统计', 'icon': 'fas fa-box', 'color': 'info'},
        {'name': 'SKU 利润诊断', 'icon': 'fas fa-dollar-sign', 'color': 'success'},
        {'name': 'Listing 分析', 'icon': 'fas fa-link', 'color': 'primary'},
        {'name': 'Combo 策略', 'icon': 'fas fa-gift', 'color': 'warning'},
        {'name': '客户画像', 'icon': 'fas fa-users', 'color': 'info'},
        {'name': '物流诊断', 'icon': 'fas fa-truck', 'color': 'secondary'},
        {'name': '库存快照', 'icon': 'fas fa-warehouse', 'color': 'danger'},
        {'name': 'AI 预测', 'icon': 'fas fa-robot', 'color': 'primary'},
        {'name': '智能补货', 'icon': 'fas fa-shopping-cart', 'color': 'success'},
    ]
    
    return render(request, "reports/partials/generator_form.html", {
        'default_start': first_prev.strftime('%Y-%m-%d'),
        'default_end': last_prev.strftime('%Y-%m-%d'),
        'lr_case': loss_rates.get('CASE', 0.05),
        'lr_request': loss_rates.get('REQUEST', 0.03),
        'lr_return': loss_rates.get('RETURN', 0.02),
        'lr_dispute': loss_rates.get('DISPUTE', 0.01),
        'lead_time': getattr(app_settings, 'LEAD_MONTH', 2.0),
        'safety_stock': getattr(app_settings, 'MIN_SAFETY_MONTH', 1.5),
        'task_list': task_list,
    })

@require_POST
@login_required
def start_generation(request):
    """HTMX: Start report generation with progress updates"""
    if not check_perm(request.user, 'module.sales.reports.generate'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    # Security Gate
    is_valid, error_msg = SecurityPolicyManager.verify_action_request(request, 'btn_generate_report')
    if not is_valid:
        return HttpResponse(f'''
            <div class="alert alert-danger">
                <i class="fas fa-times-circle me-2"></i>安全验证失败: {error_msg}
            </div>
            <script>document.getElementById('gen-submit-btn').disabled = false;</script>
        ''')
    
    # Parse dates
    try:
        start_str = request.POST.get('start_date')
        end_str = request.POST.get('end_date')
        start_date = datetime.datetime.strptime(start_str, '%Y-%m-%d').date()
        end_date = datetime.datetime.strptime(end_str, '%Y-%m-%d').date()
        
        if start_date > end_date:
            return HttpResponse('''
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>开始日期不能晚于结束日期
                </div>
                <script>document.getElementById('gen-submit-btn').disabled = false;</script>
            ''')
    except (ValueError, TypeError):
        return HttpResponse('''
            <div class="alert alert-danger">
                <i class="fas fa-times-circle me-2"></i>日期格式无效
            </div>
            <script>document.getElementById('gen-submit-btn').disabled = false;</script>
        ''')
    
    # [并发安全] 清空当前用户的旧报表文件（只影响自己的目录）
    mgr = ReportFileManager()
    mgr.clear_all_reports()
    
    # Run all 9 analyzers (matching legacy Streamlit)
    suffix = f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"
    
    # [任务列表] 9个分析器
    analyzers = [
        ("📦 SKU 销量统计", SalesQtyAnalyzer),
        ("💰 SKU 利润与诊断", SkuProfitAnalyzer),
        ("🔗 Listing 表现分析", ListingProfitAnalyzer),
        ("🎁 Combo 策略分析", ComboProfitAnalyzer),
        ("👥 客户画像与风险", CustomerAnalyzer),
        ("🚚 物流效益诊断", ShippingAnalyzer),
        ("🏦 库存资产快照", InventorySnapshot),
        ("🤖 AI 销量预测", PredictionService),
        ("🛒 智能补货计算", OrderingService),
    ]
    
    success_count = 0
    errors = []
    
    try:
        for name, AnalyzerClass in analyzers:
            try:
                analyzer = AnalyzerClass(start_date, end_date, suffix)
                analyzer.run()
                success_count += 1
            except Exception as e:
                errors.append(f"{name}: {str(e)}")
        
        # Get generated files
        files = mgr.get_generated_files()
        
        # Audit log
        audit_logger.info(
            f"报表生成完成: {start_str} ~ {end_str}, 成功: {success_count}/9, 文件数: {len(files)}",
            extra={
                'user': request.user.username,
                'action': 'GENERATE_REPORT',
                'func': '报表生成器'
            }
        )
        
        if errors:
            error_html = "<br>".join(errors)
            return HttpResponse(f'''
                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    部分报表生成完成！成功 <strong>{success_count}/9</strong>，共 <strong>{len(files)}</strong> 个文件。
                    <details class="mt-2"><summary>查看错误</summary><small>{error_html}</small></details>
                    <a href="#" onclick="window.enterTab('center', '报表中心', 'fas fa-folder-open')" class="alert-link ms-2">
                        前往报表中心 <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            ''')
        else:
            return HttpResponse(f'''
                <div class="alert alert-success">
                    <i class="fas fa-check-circle me-2"></i>
                    全部报表生成完成！共生成 <strong>{len(files)}</strong> 个文件。
                    <a href="#" onclick="window.enterTab('center', '报表中心', 'fas fa-folder-open')" class="alert-link ms-2">
                        前往报表中心 <i class="fas fa-arrow-right"></i>
                    </a>
                </div>
            ''')
        
    except Exception as e:
        return HttpResponse(f'''
            <div class="alert alert-danger">
                <i class="fas fa-times-circle me-2"></i>分析引擎错误: {str(e)}
            </div>
        ''')

@login_required
def center_files(request):
    """HTMX: Load file list for report center"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    file_names = mgr.get_generated_files()
    
    files = []
    for fname in file_names:
        fpath = mgr.get_file_path(fname)
        if fpath.exists():
            files.append(get_file_info(fpath))
    
    return render(request, "reports/partials/center_list.html", {
        'files': files,
    })

@login_required
def download_file(request, filename):
    """Download single file"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    fpath = mgr.get_file_path(filename)
    
    if not fpath.exists():
        return HttpResponse(_("文件不存在"), status=404)
    
    # Audit log
    audit_logger.info(
        f"下载报表: {filename}",
        extra={
            'user': request.user.username,
            'action': 'DOWNLOAD_REPORT',
            'func': '报表中心',
            'table': filename
        }
    )
    
    return FileResponse(open(fpath, 'rb'), as_attachment=True, filename=filename)

@login_required
def download_zip(request):
    """Download all files as ZIP"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    zip_data = mgr.create_zip_archive()
    
    timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M')
    zip_name = f"Reports_All_{timestamp}.zip"
    
    # Audit log
    audit_logger.info(
        f"下载报表包: {zip_name}",
        extra={
            'user': request.user.username,
            'action': 'DOWNLOAD_REPORT_ZIP',
            'func': '报表中心'
        }
    )
    
    response = HttpResponse(zip_data, content_type='application/zip')
    response['Content-Disposition'] = f'attachment; filename="{zip_name}"'
    return response

@login_required
def preview_file(request, filename):
    """HTMX: Preview file content"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    fpath = mgr.get_file_path(filename)
    
    if not fpath.exists():
        return HttpResponse(f"<p class='text-danger'>{_('文件不存在')}</p>")
    
    tables = parse_csv_for_preview(fpath)
    
    return render(request, "reports/partials/preview.html", {
        'tables': tables,
    })


# =============================================================================
# File Viewers (按类型拆分)
# =============================================================================

def _get_file_type(filename):
    """判断文件类型"""
    suffix = filename.lower().split('.')[-1] if '.' in filename else ''
    if suffix == 'pdf':
        return 'pdf'
    elif suffix in ('png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'):
        return 'image'
    elif suffix in ('csv', 'html', 'htm', 'xlsx', 'xls'):
        return 'table'
    return 'table'  # 默认按表格处理


@login_required
def viewer_table(request, filename):
    """表格类型文件查看器（CSV/HTML/Excel）"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return render(request, "errors/403.html", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    fpath = mgr.get_file_path(filename)
    
    if not fpath.exists():
        return render(request, "errors/404.html", status=404)
    
    tables = parse_csv_for_preview(fpath)
    file_info = get_file_info(fpath)
    
    audit_logger.info(
        f"查看表格报表: {filename}",
        extra={
            'user': request.user.username,
            'action': 'VIEW_TABLE_REPORT',
            'func': '报表中心',
            'table': filename
        }
    )
    
    return render(request, "reports/pages/viewer_table.html", {
        'filename': filename,
        'file_info': file_info,
        'tables': tables,
    })


@login_required
def viewer_pdf(request, filename):
    """PDF 类型文件查看器"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return render(request, "errors/403.html", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    fpath = mgr.get_file_path(filename)
    
    if not fpath.exists():
        return render(request, "errors/404.html", status=404)
    
    file_info = get_file_info(fpath)
    # PDF 需要一个可访问的 URL
    download_url = f"/dashboard/sales/reports/center/download/{filename}/"
    
    audit_logger.info(
        f"查看PDF报表: {filename}",
        extra={
            'user': request.user.username,
            'action': 'VIEW_PDF_REPORT',
            'func': '报表中心',
            'table': filename
        }
    )
    
    return render(request, "reports/pages/viewer_pdf.html", {
        'filename': filename,
        'file_info': file_info,
        'pdf_url': download_url,
    })


@login_required
def viewer_image(request, filename):
    """图片类型文件查看器"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return render(request, "errors/403.html", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    fpath = mgr.get_file_path(filename)
    
    if not fpath.exists():
        return render(request, "errors/404.html", status=404)
    
    file_info = get_file_info(fpath)
    # 图片需要一个可访问的 URL
    image_url = f"/dashboard/sales/reports/center/download/{filename}/"
    
    audit_logger.info(
        f"查看图片报表: {filename}",
        extra={
            'user': request.user.username,
            'action': 'VIEW_IMAGE_REPORT',
            'func': '报表中心',
            'table': filename
        }
    )
    
    return render(request, "reports/pages/viewer_image.html", {
        'filename': filename,
        'file_info': file_info,
        'image_url': image_url,
    })

@require_POST
@login_required
def clear_files(request):
    """HTMX: Clear all report files"""
    if not check_perm(request.user, 'module.sales.reports.center'):
        return HttpResponse("Permission Denied", status=403)
    set_current_user(request.user.username)
    
    mgr = ReportFileManager()
    mgr.clear_all_reports()
    
    # Audit log
    audit_logger.info(
        "清空报表文件",
        extra={
            'user': request.user.username,
            'action': 'CLEAR_REPORTS',
            'func': '报表中心'
        }
    )
    
    return render(request, "reports/partials/center_list.html", {
        'files': [],
    })


# =============================================================================
# API Views (REST Framework) - Keep existing
# =============================================================================

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def generate_profit_report(request):
    """
    [API] 生成 SKU 利润报表
    Method: POST
    Payload: {
        "start_date": "2025-01-01",
        "end_date": "2025-01-31"
    }
    """
    # Set context
    set_current_user(request.user.username)
    
    today = datetime.date.today()
    default_start = (today.replace(day=1) - datetime.timedelta(days=1)).replace(day=1)
    default_end = today.replace(day=1) - datetime.timedelta(days=1)

    s_str = request.data.get('start_date', str(default_start))
    e_str = request.data.get('end_date', str(default_end))

    try:
        start_date = datetime.datetime.strptime(s_str, "%Y-%m-%d").date()
        end_date = datetime.datetime.strptime(e_str, "%Y-%m-%d").date()

        if start_date > end_date:
            return Response({"status": "error", "message": "Start date must be before end date."}, status=400)

        mgr = ReportFileManager()
        mgr.clear_all_reports()

        suffix = f"{start_date.strftime('%Y%m%d')}_{end_date.strftime('%Y%m%d')}"

        analyzer = SkuProfitAnalyzer(start_date, end_date, suffix)
        analyzer.run()

        generated_files = mgr.get_generated_files()

        if not generated_files:
            return Response({
                "status": "warning",
                "message": "Analysis completed but no files were generated (No Data?)."
            }, status=200)

        return Response({
            "status": "success",
            "message": "Report generated successfully.",
            "data": {
                "files": generated_files,
                "range": f"{s_str} to {e_str}"
            }
        })

    except ValueError:
        return Response({"status": "error", "message": "Invalid date format. Use YYYY-MM-DD."}, status=400)
    except Exception as e:
        return Response({"status": "error", "message": f"Analysis Engine Error: {str(e)}"}, status=500)