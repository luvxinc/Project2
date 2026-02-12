# File: backend/apps/audit/views/main.py
"""
# ==============================================================================
# 模块名称: 审计看板入口 (Audit Dashboard View)
# ==============================================================================
#
# [Purpose / 用途]
# 提供审计模块的主界面容器 (Shell)。
# 负责权限校验和全局状态 (God Mode) 的注入。
#
# ==============================================================================
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from django.urls import reverse
from backend.core.services.auth.service import AuthService
from backend.core.services.log_service import LogService


@login_required(login_url='web_ui:login')
def audit_dashboard(request):
    """
    审计模块主面板
    权限: module.audit 或任意子权限
    """
    # [P0-2 Fix] Each feature checks its SPECIFIC leaf permission only
    perms = AuthService.get_permissions(request.user.username)
    has_business = bool(perms.get('module.audit.logs.business'))
    has_infra = bool(perms.get('module.audit.logs.infra'))
    has_system = bool(perms.get('module.audit.logs.system'))
    
    # Hub access allowed if user has any audit sub-permission
    can_access = request.user.is_superuser or has_business or has_infra or has_system
    
    if not can_access:
        return render(request, "errors/403.html", status=403)

    is_god_mode = request.session.get('audit_god_mode', False)
    
    # Hub Items - Each feature uses its SPECIFIC leaf permission
    hub_items = [
        {
            'id': 'business', 
            'name': '业务操作日志', 
            'icon': 'fas fa-briefcase', 
            'desc': '记录用户在前端界面的显性操作 (登录、点击、下载)。', 
            'url': reverse('web_ui:audit_business'),
            'has_access': request.user.is_superuser or has_business
        },
        {
            'id': 'infra', 
            'name': '全景数据审计', 
            'icon': 'fas fa-database', 
            'desc': '底层数据变更追踪，合并展示应用日志与数据库原子操作。', 
            'url': reverse('web_ui:audit_infra'),
            'has_access': request.user.is_superuser or has_infra
        },
        {
            'id': 'system', 
            'name': '系统故障监控', 
            'icon': 'fas fa-bug', 
            'desc': '捕获系统运行时的异常错误 (Exceptions) 与堆栈追踪。', 
            'url': reverse('web_ui:audit_system'),
            'has_access': request.user.is_superuser or has_system
        },
    ]
    
    # Superuser 专属功能
    if request.user.is_superuser:
        hub_items.append({
            'id': 'purge', 
            'name': '清空日志', 
            'icon': 'fas fa-trash-can', 
            'desc': '物理擦除历史审计数据 (Admin Only)。', 
            'url': reverse('web_ui:audit_purge_page'),
            'has_access': True
        })
        # god_unlock 已移至子页面 header 按钮区域，HUB 不再显示

    context = {
        "hub_items": hub_items,
        "is_god_mode": is_god_mode
    }
    return render(request, "pages/audit_dashboard.html", context)


@login_required(login_url='web_ui:login')
def audit_business(request):
    """业务操作日志页面"""
    is_god_mode = request.session.get('audit_god_mode', False)
    q = request.GET.get('q', '').strip()
    status = request.GET.get('status', 'ALL')
    days = request.GET.get('days', '7')
    
    try:
        logs = LogService.get_file_logs("app.log", q=q, status=status, days=days, is_god_mode=is_god_mode)
        # [Phase 1.1] 写入侧已通过 BusinessLogFilter 过滤噪音，无需展示侧再过滤
        logs = [l.to_dict() for l in logs]
    except Exception:
        logs = []
    
    return render(request, "audit/pages/business.html", {"logs": logs, "is_god_mode": is_god_mode, "is_superuser": request.user.is_superuser})


@login_required(login_url='web_ui:login')
def audit_infra(request):
    """全景数据审计页面"""
    is_god_mode = request.session.get('audit_god_mode', False)
    q = request.GET.get('q', '').strip()
    status = request.GET.get('status', 'ALL')
    days = request.GET.get('days', '7')
    
    try:
        logs = LogService.get_unified_logs(q=q, status=status, days=days, is_god_mode=is_god_mode)
        logs = [l for l in logs if l.user != 'System']
        logs = [l.to_dict() for l in logs]
    except Exception:
        logs = []
    
    return render(request, "audit/pages/infra.html", {"logs": logs, "is_god_mode": is_god_mode, "is_superuser": request.user.is_superuser})


@login_required(login_url='web_ui:login')
def audit_system(request):
    """系统故障监控页面"""
    is_god_mode = request.session.get('audit_god_mode', False)
    q = request.GET.get('q', '').strip()
    status = request.GET.get('status', 'ALL')
    days = request.GET.get('days', '7')
    
    try:
        logs = LogService.get_file_logs("error.log", q=q, status=status, days=days, is_god_mode=is_god_mode)
        patched_count = sum(1 for l in logs if l.patched_ver)
        last_error_date = logs[0].time[:10] if logs else "-"
        stats = {
            "total": len(logs),
            "patched": patched_count,
            "pending": len(logs) - patched_count,
            "last_error": last_error_date
        }
        logs = [l.to_dict() for l in logs]
    except Exception:
        logs = []
        stats = {"total": 0, "patched": 0, "pending": 0, "last_error": "-"}
    
    return render(request, "audit/pages/system.html", {"logs": logs, "stats": stats, "is_god_mode": is_god_mode, "is_superuser": request.user.is_superuser})


@login_required(login_url='web_ui:login')
def audit_purge_page(request):
    """清空日志页面"""
    if not request.user.is_superuser:
        return render(request, "errors/403.html", status=403)
    return render(request, "audit/pages/purge.html")


@login_required(login_url='web_ui:login')
def audit_test_500(request):
    """
    [Phase 1.3] 测试 500 错误的 view
    仅用于验证 error.log 记录和 app.log 不混入系统异常
    """
    from django.conf import settings
    if not settings.DEBUG:
        return HttpResponse("Only available in DEBUG mode", status=403)
    
    # 真实触发 500 异常
    raise ValueError("Phase 1.3 Test: Intentional 500 Error for verification")


@login_required(login_url='web_ui:login')
def audit_events(request):
    """
    [Phase 2.2 + 3.3] 全景审计页面 - 事件聚合视图
    展示 UnifiedEvent 而不是单条 LogEntry
    支持事件级分页
    """
    from django.core.paginator import Paginator, EmptyPage, PageNotAnInteger
    
    is_god_mode = request.session.get('audit_god_mode', False)
    
    # [Phase 3.3] 分页参数
    try:
        page = int(request.GET.get('page', 1))
        if page < 1: page = 1
    except:
        page = 1
    
    try:
        page_size = int(request.GET.get('page_size', 20))
        if page_size < 1: page_size = 20
        if page_size > 100: page_size = 100
    except:
        page_size = 20
    
    try:
        days = int(request.GET.get('days', '1'))
        if days < 1: days = 1
        if days > 30: days = 30
    except:
        days = 1
    
    # 筛选参数
    q = request.GET.get('q', '').strip()
    status = request.GET.get('status', 'ALL').strip()
    user_filter = request.GET.get('user', '').strip()
    action_filter = request.GET.get('action', '').strip()
    target_filter = request.GET.get('target', '').strip()
    
    try:
        # 获取事件列表（提高 limit 以支持分页）
        all_events = LogService.get_unified_events(
            days=str(days),
            is_god_mode=is_god_mode,
            q=q,
            status=status,
            limit=500  # 提高限制以支持分页
        )
        
        # 应用额外筛选
        if user_filter:
            all_events = [e for e in all_events if user_filter.lower() in e.user.lower()]
        if action_filter:
            all_events = [e for e in all_events if action_filter.upper() in e.action.upper()]
        if target_filter:
            all_events = [e for e in all_events if target_filter.lower() in e.target.lower()]
        
        # [Phase 3.3] 分页
        paginator = Paginator(all_events, page_size)
        total_count = paginator.count
        total_pages = paginator.num_pages
        
        try:
            page_obj = paginator.page(page)
        except PageNotAnInteger:
            page_obj = paginator.page(1)
            page = 1
        except EmptyPage:
            page_obj = paginator.page(paginator.num_pages)
            page = paginator.num_pages
        
        # 只转换当前页的 events
        events_data = [e.to_dict() for e in page_obj.object_list]
        
    except Exception as ex:
        events_data = []
        total_count = 0
        total_pages = 1
        page_obj = None
        import logging
        logging.getLogger(__name__).error(f"audit_events error: {ex}")
    
    # 计算页码范围（当前页前后各2页）
    page_range = []
    if total_pages > 0:
        start_page = max(1, page - 2)
        end_page = min(total_pages, page + 2)
        page_range = list(range(start_page, end_page + 1))
    
    return render(request, "audit/pages/events.html", {
        "events": events_data,
        "is_god_mode": is_god_mode,
        "is_superuser": request.user.is_superuser,
        "filters": {
            "q": q,
            "status": status,
            "days": str(days),
            "user": user_filter,
            "action": action_filter,
            "target": target_filter
        },
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total_pages": total_pages,
            "total_count": total_count,
            "has_previous": page > 1,
            "has_next": page < total_pages,
            "page_range": page_range
        }
    })