# File: backend/apps/log/views.py
"""
企业级日志系统 - 可视化视图
提供 6 个 Tab 界面：概览、错误、安全、业务、访问、清理
支持 God Mode（敏感信息解锁）和 Dev Mode（开发者模式）
"""
from django.shortcuts import render, redirect
from django.contrib.auth.decorators import login_required
from django.views.decorators.http import require_POST
from django.http import JsonResponse, HttpResponse
from django.core.paginator import Paginator
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.utils.translation import gettext as _
from django.contrib import messages
from datetime import timedelta

from .models import LogError, LogAudit, LogBusiness, LogAccess


def _check_admin(request):
    """检查管理员权限"""
    return request.user.is_superuser or request.user.is_staff


def _is_god_mode(request):
    """检查是否处于 God Mode（敏感信息解锁）"""
    return request.session.get('log_god_mode', False)


def _is_dev_mode_session(request):
    """检查 Session 中的开发者模式状态（如果明确设置过）"""
    return request.session.get('log_dev_mode_control')


def _get_effective_dev_mode(request):
    """
    获取有效的开发模式状态
    优先使用 Session 控制，如果 Session 中未设置则使用全局配置
    """
    from django.conf import settings
    session_value = request.session.get('log_dev_mode_control')
    if session_value is not None:
        return session_value
    return getattr(settings, 'LOG_DEV_MODE', False)


@login_required(login_url='web_ui:login')
def log_dashboard(request):
    """日志系统主页"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    return render(request, 'log/pages/dashboard.html', {
        'active_tab': 'overview',
        'god_mode': _is_god_mode(request),
        'dev_mode': _get_effective_dev_mode(request),
    })


@login_required(login_url='web_ui:login')
def log_tab_overview(request):
    """概览 Tab - 统计和图表"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    today = timezone.now().date()
    week_ago = today - timedelta(days=7)
    
    # 统计数据
    stats = {
        'error_today': LogError.objects.filter(created_at__date=today).count(),
        'error_week': LogError.objects.filter(created_at__date__gte=week_ago).count(),
        'error_unresolved': LogError.objects.filter(is_resolved=False).count(),
        
        'audit_today': LogAudit.objects.filter(created_at__date=today).count(),
        'audit_week': LogAudit.objects.filter(created_at__date__gte=week_ago).count(),
        'login_today': LogAudit.objects.filter(created_at__date=today, action='LOGIN_SUCCESS').count(),
        'login_failed_today': LogAudit.objects.filter(created_at__date=today, action='LOGIN_FAILED').count(),
        
        'business_today': LogBusiness.objects.filter(created_at__date=today).count(),
        'business_week': LogBusiness.objects.filter(created_at__date__gte=week_ago).count(),
        
        'access_today': LogAccess.objects.filter(created_at__date=today).count(),
        'access_errors': LogAccess.objects.filter(created_at__date=today, status_code__gte=400).count(),
    }
    
    # 最近错误（5条）
    recent_errors = LogError.objects.order_by('-created_at')[:5]
    
    # 最近登录（5条）
    recent_logins = LogAudit.objects.filter(
        action__in=['LOGIN_SUCCESS', 'LOGIN_FAILED']
    ).order_by('-created_at')[:5]
    
    # 7天错误趋势
    error_trend = list(
        LogError.objects
        .filter(created_at__date__gte=week_ago)
        .annotate(date=TruncDate('created_at'))
        .values('date')
        .annotate(count=Count('id'))
        .order_by('date')
    )
    
    return render(request, 'log/tabs/overview.html', {
        'stats': stats,
        'recent_errors': recent_errors,
        'recent_logins': recent_logins,
        'error_trend': error_trend,
        'god_mode': _is_god_mode(request),
    })


@login_required(login_url='web_ui:login')
def log_tab_error(request):
    """错误日志 Tab"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    # 筛选参数
    q = request.GET.get('q', '').strip()
    severity = request.GET.get('severity', '')
    resolved = request.GET.get('resolved', '')
    days = int(request.GET.get('days', 7))
    page = int(request.GET.get('page', 1))
    
    # 构建查询
    queryset = LogError.objects.all()
    
    if days > 0:
        cutoff = timezone.now() - timedelta(days=days)
        queryset = queryset.filter(created_at__gte=cutoff)
    
    if q:
        queryset = queryset.filter(
            Q(error_message__icontains=q) |
            Q(error_type__icontains=q) |
            Q(request_path__icontains=q) |
            Q(user__icontains=q)
        )
    
    if severity:
        queryset = queryset.filter(severity=severity)
    
    if resolved == 'yes':
        queryset = queryset.filter(is_resolved=True)
    elif resolved == 'no':
        queryset = queryset.filter(is_resolved=False)
    
    queryset = queryset.order_by('-created_at')
    
    # 分页
    paginator = Paginator(queryset, 20)
    page_obj = paginator.get_page(page)
    
    return render(request, 'log/tabs/error.html', {
        'logs': page_obj,
        'filter': {'q': q, 'severity': severity, 'resolved': resolved, 'days': days},
        'total_count': paginator.count,
        'god_mode': _is_god_mode(request),
    })


@login_required(login_url='web_ui:login')
def log_tab_audit(request):
    """安全审计 Tab"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    # 筛选参数
    q = request.GET.get('q', '').strip()
    action = request.GET.get('action', '')
    category = request.GET.get('category', '')
    result = request.GET.get('result', '')
    days = int(request.GET.get('days', 7))
    page = int(request.GET.get('page', 1))
    
    # 构建查询
    queryset = LogAudit.objects.all()
    
    if days > 0:
        cutoff = timezone.now() - timedelta(days=days)
        queryset = queryset.filter(created_at__gte=cutoff)
    
    if q:
        queryset = queryset.filter(
            Q(actor_username__icontains=q) |
            Q(action__icontains=q) |
            Q(target_name__icontains=q)
        )
    
    if action:
        queryset = queryset.filter(action__icontains=action)
    
    if category:
        queryset = queryset.filter(action_category=category)
    
    if result:
        queryset = queryset.filter(result=result)
    
    queryset = queryset.order_by('-created_at')
    
    # 分页
    paginator = Paginator(queryset, 20)
    page_obj = paginator.get_page(page)
    
    # 动作选项
    action_options = list(
        LogAudit.objects.values_list('action', flat=True).distinct()[:20]
    )
    
    return render(request, 'log/tabs/audit.html', {
        'logs': page_obj,
        'filter': {'q': q, 'action': action, 'category': category, 'result': result, 'days': days},
        'total_count': paginator.count,
        'action_options': action_options,
        'god_mode': _is_god_mode(request),
    })


@login_required(login_url='web_ui:login')
def log_tab_business(request):
    """业务操作 Tab"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    # 筛选参数
    q = request.GET.get('q', '').strip()
    module = request.GET.get('module', '')
    user = request.GET.get('user', '')
    days = int(request.GET.get('days', 7))
    page = int(request.GET.get('page', 1))
    
    # 构建查询
    queryset = LogBusiness.objects.all()
    
    if days > 0:
        cutoff = timezone.now() - timedelta(days=days)
        queryset = queryset.filter(created_at__gte=cutoff)
    
    if q:
        queryset = queryset.filter(
            Q(summary__icontains=q) |
            Q(action__icontains=q) |
            Q(target_id__icontains=q)
        )
    
    if module:
        queryset = queryset.filter(module=module)
    
    if user:
        queryset = queryset.filter(user=user)
    
    queryset = queryset.order_by('-created_at')
    
    # 分页
    paginator = Paginator(queryset, 20)
    page_obj = paginator.get_page(page)
    
    # 模块选项
    module_options = list(
        LogBusiness.objects.values_list('module', flat=True).distinct()
    )
    
    # 用户选项
    user_options = list(
        LogBusiness.objects.values_list('user', flat=True).distinct()[:20]
    )
    
    return render(request, 'log/tabs/business.html', {
        'logs': page_obj,
        'filter': {'q': q, 'module': module, 'user': user, 'days': days},
        'total_count': paginator.count,
        'module_options': module_options,
        'user_options': user_options,
        'god_mode': _is_god_mode(request),
    })


@login_required(login_url='web_ui:login')
def log_tab_access(request):
    """访问日志 Tab"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    # 筛选参数
    q = request.GET.get('q', '').strip()
    method = request.GET.get('method', '')
    status = request.GET.get('status', '')
    days = int(request.GET.get('days', 3))
    page = int(request.GET.get('page', 1))
    
    # 构建查询
    queryset = LogAccess.objects.all()
    
    if days > 0:
        cutoff = timezone.now() - timedelta(days=days)
        queryset = queryset.filter(created_at__gte=cutoff)
    
    if q:
        queryset = queryset.filter(
            Q(path__icontains=q) |
            Q(user__icontains=q) |
            Q(ip__icontains=q)
        )
    
    if method:
        queryset = queryset.filter(method=method)
    
    if status == 'error':
        queryset = queryset.filter(status_code__gte=400)
    elif status == 'slow':
        queryset = queryset.filter(response_time_ms__gte=3000)
    
    queryset = queryset.order_by('-created_at')
    
    # 分页
    paginator = Paginator(queryset, 30)
    page_obj = paginator.get_page(page)
    
    return render(request, 'log/tabs/access.html', {
        'logs': page_obj,
        'filter': {'q': q, 'method': method, 'status': status, 'days': days},
        'total_count': paginator.count,
        'god_mode': _is_god_mode(request),
    })


@login_required(login_url='web_ui:login')
def log_tab_maintenance(request):
    """日志维护 Tab"""
    if not _check_admin(request):
        return HttpResponse("Access Denied", status=403)
    
    # 统计信息
    stats = {
        'error_total': LogError.objects.count(),
        'error_dev': LogError.objects.filter(dev_mode=True).count(),
        
        'audit_total': LogAudit.objects.count(),
        'audit_dev': LogAudit.objects.filter(dev_mode=True).count(),
        
        'business_total': LogBusiness.objects.count(),
        'business_dev': LogBusiness.objects.filter(dev_mode=True).count(),
        
        'access_total': LogAccess.objects.count(),
        'access_dev': LogAccess.objects.filter(dev_mode=True).count(),
        
        'dev_mode': _get_effective_dev_mode(request),  # 使用有效的开发模式状态
    }
    
    stats['dev_total'] = (
        stats['error_dev'] + stats['audit_dev'] + 
        stats['business_dev'] + stats['access_dev']
    )
    
    return render(request, 'log/tabs/maintenance.html', {
        'stats': stats,
    })


# ============================================================================
# API 接口
# ============================================================================

@login_required(login_url='web_ui:login')
def api_error_detail(request, error_id):
    """获取错误详情"""
    if not _check_admin(request):
        return JsonResponse({'error': 'Access Denied'}, status=403)
    
    god_mode = _is_god_mode(request)
    
    def mask_value(value, strict=False):
        """脱敏辅助函数"""
        if god_mode:
            return value
        if not value or value == '-':
            return '-'
        if strict:
            return '[LOCKED - 需要解锁查看]'
        return '***'
    
    def mask_ip(ip):
        """IP 脱敏"""
        if god_mode:
            return ip
        if not ip or ip == '-':
            return '-'
        parts = ip.split('.')
        if len(parts) >= 2:
            return f"{parts[0]}.{parts[1]}.*.*"
        return '***'
    
    def mask_user(user):
        """用户名脱敏"""
        if god_mode:
            return user
        if not user or user == '-':
            return '-'
        if len(user) >= 1:
            return f"{user[0]}***"
        return '***'
    
    try:
        log = LogError.objects.get(pk=error_id)
        return JsonResponse({
            'id': log.id,
            'created_at': log.created_at.isoformat(),
            'trace_id': log.trace_id,
            'user': mask_user(log.user),
            'ip': mask_ip(log.ip),
            'http_method': log.http_method,
            'request_path': log.request_path,
            'query_params': mask_value(log.query_params, strict=True),
            'request_body': mask_value(log.request_body, strict=True),
            'error_type': log.error_type,
            'error_message': log.error_message,
            'traceback_full': mask_value(log.traceback_full, strict=True),
            'file_path': log.file_path,
            'function_name': log.function_name,
            'line_number': log.line_number,
            'local_variables': mask_value(log.local_variables, strict=True),
            'severity': log.severity,
            'category': log.category,
            'is_resolved': log.is_resolved,
            'resolved_by': log.resolved_by,
            'resolution_note': log.resolution_note,
            'god_mode': god_mode,  # 让前端知道当前模式
        })
    except LogError.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)


@login_required(login_url='web_ui:login')
def api_resolve_error(request, error_id):
    """标记错误为已解决"""
    if not _check_admin(request):
        return JsonResponse({'error': 'Access Denied'}, status=403)
    
    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    
    try:
        import json
        data = json.loads(request.body)
        
        log = LogError.objects.get(pk=error_id)
        log.is_resolved = True
        log.resolved_by = request.user.username
        log.resolved_at = timezone.now()
        log.resolution_note = data.get('note', '')
        log.save()
        
        return JsonResponse({'success': True})
    except LogError.DoesNotExist:
        return JsonResponse({'error': 'Not found'}, status=404)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=500)


# ============================================================================
# 安全模式控制
# ============================================================================

@login_required(login_url='web_ui:login')
@require_POST
def api_unlock_god_mode(request):
    """
    解锁 God Mode（查看未脱敏敏感信息）
    需要密码验证
    """
    if not _check_admin(request):
        return JsonResponse({'success': False, 'message': _('权限不足')}, status=403)
    
    from core.services.security.policy_manager import SecurityPolicyManager
    
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, "btn_unlock_view")
    
    if is_valid:
        request.session['log_god_mode'] = True
        request.session.modified = True
        
        # 记录审计日志
        try:
            from .services import LogAuditService
            LogAuditService.create(
                action='GOD_MODE_UNLOCK',
                action_category='CONFIG',
                result='SUCCESS',
                risk_level='HIGH',
            )
        except Exception:
            pass
        
        return JsonResponse({'success': True, 'message': _('敏感信息已解锁')})
    else:
        # 记录失败
        try:
            from .services import LogAuditService
            LogAuditService.create(
                action='GOD_MODE_UNLOCK',
                action_category='CONFIG',
                result='DENIED',
                deny_reason=msg,
                risk_level='HIGH',
            )
        except Exception:
            pass
        return JsonResponse({'success': False, 'message': msg or _('密码验证失败')}, status=403)


@login_required(login_url='web_ui:login')
@require_POST
def api_lock_god_mode(request):
    """锁定 God Mode（恢复脱敏保护）"""
    if not _check_admin(request):
        return JsonResponse({'success': False, 'message': _('权限不足')}, status=403)
    
    request.session['log_god_mode'] = False
    request.session.modified = True
    
    # 记录审计日志
    from .services import LogAuditService
    LogAuditService.create(
        action='GOD_MODE_LOCK',
        action_category='CONFIG',
        result='SUCCESS',
        risk_level='LOW',
    )
    
    return JsonResponse({'success': True, 'message': _('已恢复脱敏保护')})


@login_required(login_url='web_ui:login')
@require_POST
def api_toggle_dev_mode(request):
    """
    切换开发者模式控制
    进入开发模式需要密码验证，退出不需要
    """
    if not request.user.is_superuser:
        return JsonResponse({'success': False, 'message': _('仅超级管理员可操作')}, status=403)
    
    import json
    try:
        data = json.loads(request.body)
    except:
        data = {}
    
    action = data.get('action', 'toggle')  # 'enter', 'exit', or 'toggle'
    current = request.session.get('log_dev_mode_control', False)
    
    # 确定目标状态
    if action == 'enter':
        new_value = True
    elif action == 'exit':
        new_value = False
    else:
        new_value = not current
    
    # 如果是进入开发模式，需要密码验证
    if new_value and not current:
        from core.services.security.policy_manager import SecurityPolicyManager
        is_valid, msg = SecurityPolicyManager.verify_action_request(request, "btn_toggle_dev_mode")
        
        if not is_valid:
            from .services import LogAuditService
            LogAuditService.create(
                action='DEV_MODE_TOGGLE',
                action_category='CONFIG',
                result='DENIED',
                deny_reason=msg,
                risk_level='HIGH',
            )
            return JsonResponse({'success': False, 'message': _('验证失败: {msg}').format(msg=msg)}, status=403)
    
    # 更新 Session - 强制保存
    request.session['log_dev_mode_control'] = new_value
    request.session.modified = True  # 确保 Django 保存 session
    
    # 打印调试信息
    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"[DEV_MODE] action={action}, current={current}, new_value={new_value}, session_key={request.session.session_key}")
    
    # 记录审计日志
    from .services import LogAuditService
    LogAuditService.create(
        action='DEV_MODE_TOGGLE',
        action_category='CONFIG',
        result='SUCCESS',
        change_summary=f'开发者模式控制: {"开启" if new_value else "关闭"}',
        risk_level='MEDIUM',
    )
    
    return JsonResponse({
        'success': True, 
        'dev_mode_control': new_value,
        'message': _('开发者模式控制已{state}').format(state=_('开启') if new_value else _('关闭'))
    })


@login_required(login_url='web_ui:login')
def api_get_mode_status(request):
    """获取当前模式状态"""
    if not _check_admin(request):
        return JsonResponse({'error': 'Access Denied'}, status=403)
    
    return JsonResponse({
        'god_mode': _is_god_mode(request),
        'dev_mode': _get_effective_dev_mode(request),  # 使用有效的开发模式状态
        'dev_mode_control': _is_dev_mode_session(request),
    })


@login_required(login_url='web_ui:login')
@require_POST
def api_clear_dev_logs(request):
    """
    清理所有开发模式日志
    需要密码验证（L4 级别）
    """
    if not request.user.is_superuser:
        return JsonResponse({'success': False, 'message': _('仅超级管理员可操作')}, status=403)
    
    from core.services.security.policy_manager import SecurityPolicyManager
    
    is_valid, msg = SecurityPolicyManager.verify_action_request(request, "btn_clear_dev_logs")
    
    if not is_valid:
        from .services import LogAuditService
        LogAuditService.create(
            action='CLEAR_DEV_LOGS',
            action_category='ADMIN',
            result='DENIED',
            deny_reason=msg,
            risk_level='CRITICAL',
        )
        return JsonResponse({'success': False, 'message': _('验证失败: {msg}').format(msg=msg)}, status=403)
    
    # 统计要清理的数量
    error_count = LogError.objects.filter(dev_mode=True).count()
    audit_count = LogAudit.objects.filter(dev_mode=True).count()
    business_count = LogBusiness.objects.filter(dev_mode=True).count()
    access_count = LogAccess.objects.filter(dev_mode=True).count()
    total_count = error_count + audit_count + business_count + access_count
    
    if total_count == 0:
        return JsonResponse({'success': True, 'message': _('没有需要清理的开发日志'), 'deleted': 0})
    
    # 执行删除
    LogError.objects.filter(dev_mode=True).delete()
    LogAudit.objects.filter(dev_mode=True).delete()
    LogBusiness.objects.filter(dev_mode=True).delete()
    LogAccess.objects.filter(dev_mode=True).delete()
    
    # 记录审计日志
    from .services import LogAuditService
    LogAuditService.create(
        action='CLEAR_DEV_LOGS',
        action_category='ADMIN',
        result='SUCCESS',
        change_summary=f'已清理开发日志: error={error_count}, audit={audit_count}, business={business_count}, access={access_count}',
        risk_level='CRITICAL',
    )
    
    return JsonResponse({
        'success': True,
        'message': _('已清理 {count} 条开发日志').format(count=total_count),
        'deleted': {
            'error': error_count,
            'audit': audit_count,
            'business': business_count,
            'access': access_count,
            'total': total_count,
        }
    })
