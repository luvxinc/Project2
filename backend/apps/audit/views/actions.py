# File: backend/apps/audit/views/actions.py
"""
# ==============================================================================
# 模块名称: 审计敏感操作处理器 (Audit Actions)
# ==============================================================================
#
# [Purpose / 用途]
# 处理审计模块中的高权限/敏感操作请求 (POST Only)。
# 包括: 上帝模式解锁/锁定、日志清洗 (Purge)、故障标记 (Patch)。
#
# [Architecture / 架构]
# - Layer: Presentation Logic (Controller)
# - Security:
#   - @require_POST: 即使防止 CSRF，也要求显式写操作。
#   - SecurityPolicyManager: 动态校验二级安全码 (L1/L2/L3)。
#
# [ISO Compliance / 合规性]
# - 授权控制: 必须校验 Security Code，防止 Session 劫持后的恶意操作。
# - 审计记录: 所有敏感操作 (无论成功失败) 必须写入 Log，且日志本身不可删除。
#
# ==============================================================================
"""
from django.shortcuts import redirect
from django.contrib.auth.decorators import login_required
from django.http import HttpResponseForbidden, HttpResponse, JsonResponse
from django.views.decorators.http import require_POST
from django.contrib import messages
from django.utils.translation import gettext as _

from backend.core.services.log_service import LogService
from backend.core.sys.logger import get_audit_logger
from backend.core.sys.oplog import attach_oplog
from backend.apps.audit.core.dto import LogStatus, LogType
# [REMOVED] SnapshotManager import removed - rollback feature deprecated 2026-02-04
from backend.apps.audit.models import SystemLogPatch, AuditLog  # [Phase 2.3]
from backend.core.services.security.policy_manager import SecurityPolicyManager
# [ISO] Context
from backend.apps.audit.core.context import AuditContextManager

audit_logger = get_audit_logger()


@login_required
@require_POST
def audit_unlock(request):
    AuditContextManager.set_page_hierarchy(["安全审计日志", "概览", "解锁上帝模式"])
    
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponseForbidden(_("Access Denied"))

    is_valid, msg = SecurityPolicyManager.verify_action_request(request, "btn_unlock_view")

    if is_valid:
        request.session['audit_god_mode'] = True
        AuditContextManager.set_god_mode(True)
        messages.success(request, _('上帝模式已开启：敏感信息已解密。'))
        # [Phase 1.3] attach_oplog 让 middleware 记录明确 action
        attach_oplog(request, action="GOD_MODE_UNLOCK", target="SecurityPolicy", status=LogStatus.SUCCESS)

        audit_logger.warning("解锁上帝模式", extra={
             "action": "GOD_MODE_UNLOCK",
             "status": LogStatus.SUCCESS,
             "log_type": LogType.REGULAR,
             "note": "Session Unmasked"
        })
    else:
        messages.error(request, _('鉴权失败: {msg}').format(msg=msg))
        # [Phase 1.3] 失败也要 attach_oplog
        attach_oplog(request, action="GOD_MODE_UNLOCK", target="SecurityPolicy", status=LogStatus.FAIL_PERM, root_cause=msg)
        audit_logger.warning("解锁上帝模式失败", extra={
             "action": "GOD_MODE_UNLOCK",
             "status": LogStatus.FAIL_PERM,
             "root_cause": msg
        })

    return redirect('web_ui:audit_dashboard')


@login_required
def audit_lock(request):
    AuditContextManager.set_page_hierarchy(["安全审计日志", "概览", "锁定上帝模式"])
    request.session['audit_god_mode'] = False
    AuditContextManager.set_god_mode(False)
    
    # [Phase 2.3] 使用 middleware 的 trace_id 作为 reference，保持一致
    ref_id = AuditContextManager.get_trace_id()
    
    messages.info(request, _('已恢复脱敏保护模式。'))
    # [Phase 1.3] attach_oplog 让 middleware 记录明确 action
    attach_oplog(request, action="GOD_MODE_LOCK", target="SecurityPolicy", status=LogStatus.SUCCESS)
    audit_logger.info("锁定上帝模式", extra={
         "action": "GOD_MODE_LOCK",
         "status": LogStatus.SUCCESS,
         "note": "Session Masked"
    })
    
    # [Phase 2.3] 写入 DB 审计
    AuditLog.objects.create(
        ref_id=ref_id,
        actor=request.user.username,
        ip_address=request.META.get('REMOTE_ADDR', '-'),
        page_hierarchy="安全审计日志 -> 概览 -> 锁定上帝模式",
        target_app="audit",
        target_model="SecurityPolicy",
        target_id="-",
        action="GOD_MODE",
        status="Success",
        note="Session Masked"
    )
    
    return redirect('web_ui:audit_dashboard')


@login_required
@require_POST
def audit_purge(request):
    AuditContextManager.set_page_hierarchy(["安全审计日志", "日志管理", "清空日志"])
    
    if not request.user.is_superuser:
        messages.error(request, _('权限不足: 仅超级管理员可执行日志清洗。'))
        audit_logger.warning("日志清洗拒绝", extra={
            "action": "PURGE_LOGS",
            "status": LogStatus.FAIL_PERM,
            "root_cause": "Not Superuser"
        })
        return redirect('web_ui:audit_dashboard')

    # 1. 鉴权
    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_purge_logs")

    if not is_valid:
        messages.error(request, _('操作拒绝: {msg}').format(msg=sec_msg))
        audit_logger.critical("日志清洗失败 - 安全码错误", extra={
            "action": "PURGE_LOGS",
            "status": LogStatus.FAIL_PERM, 
            "root_cause": sec_msg,
            "type": LogType.PERMANENT
        })
        return redirect('web_ui:audit_dashboard')

    log_types = request.POST.getlist("log_types")
    start_date = request.POST.get("start_date")
    end_date = request.POST.get("end_date")
    reason = request.POST.get("reason")

    if not log_types or not start_date or not end_date:
        messages.error(request, _('参数不完整，请选择日志类型和时间范围。'))
        return redirect('web_ui:audit_dashboard')

    # 2. 执行清洗
    # Returns: (success, msg, backup_filename)
    success, msg, backup_file = LogService.purge_logs(log_types, start_date, end_date, request.user.username, reason)

    # 3. 构造 Note (Frontend renders button if 'backup_file' key exists in JSON/String)
    # The current Logger/LogService logic expects Note to be string.
    # But user requirements said "Note column becomes a button".
    # We can format the note as: "Backup File: ref_xxx.txt | Reason: ..." 
    # Or strict JSON: '{"backup_file": "ref_xxx.txt", "reason": "..."}'
    # Let's use string format that is easily parsable or just structured.
    # Note: earlier 'attach_oplog' used JSON note. Implementation of Logger just serializes it if dict? 
    # My Logger 'app_fmt' uses %(note)s. If note is dict, log record logic should serialize it.
    # But let's be safe and use a clear string convention:
    # "BACKUP_FILE=ref_xxx.txt | Reason=..."
    
    note_payload = f"Backup_File={backup_file} | Reason={reason}"

    status_code = LogStatus.SUCCESS if success else LogStatus.FAIL_SYS
    
    audit_logger.warning(f"执行日志清洗: {msg}", extra={
        "action": "PURGE_LOGS",
        "status": status_code, 
        "type": LogType.PERMANENT,
        "note": note_payload, 
        "details": f"Types: {log_types} | Range: {start_date} to {end_date}"
    })

    if success:
        messages.success(request, _('日志清洗成功。备份文件: {file}').format(file=backup_file))
    else:
        messages.error(request, _('清洗过程发生错误: {msg}').format(msg=msg))

    return redirect('web_ui:audit_dashboard')


# [REMOVED] audit_rollback function removed - rollback feature deprecated 2026-02-04


# =============================================================================
# 系统故障修复标记 (Patching)
# =============================================================================
@login_required
@require_POST
def audit_patch_log(request):
    AuditContextManager.set_page_hierarchy(["安全审计日志", "系统故障", "标记修复"])
    
    if not request.user.is_superuser:
        return HttpResponse(_("Superuser Only"), status=403)

    is_valid, sec_msg = SecurityPolicyManager.verify_action_request(request, "btn_patch_system_log")
    if not is_valid:
        return HttpResponse(f"<span class='text-danger'>{_('Error')}: {sec_msg}</span>")

    ref_id = request.POST.get("ref")
    version = request.POST.get("version")

    if not ref_id or not version:
        return HttpResponse(_('缺少参数'), status=400)

    try:
        obj, created = SystemLogPatch.objects.update_or_create(
            trace_id=ref_id,
            defaults={
                "patched_version": version,
                "patched_by": request.user.username
            }
        )

        audit_logger.info(f"标记故障修复: {ref_id}", extra={
            "action": "PATCH_LOG",
            "target": ref_id,
            "status": LogStatus.SUCCESS,
            "note": f"Version: {version}",
            "type": LogType.REGULAR
        })

        if version == "ignore":
            return HttpResponse(f'<span class="badge bg-secondary text-white">{_("Ignored")}</span>')
        elif version:
            return HttpResponse(f'<span class="badge bg-success text-white">{_("Fixed")}: {version}</span>')
        else:
            return HttpResponse(f'<span class="badge bg-danger text-white">{_("Pending")}</span>')

    except Exception as e:
        return HttpResponse(f"{_('Error')}: {str(e)}", status=500)


# =============================================================================
# 清空日志预验证 (Purge Verify) - 用于 Wizard Step 2
# =============================================================================
@login_required
@require_POST
def purge_verify(request):
    """
    [Phase 3.6] 清空日志预验证 API (Wizard Step 2)
    返回指定日期范围内可清理的日志数量（脱敏输出）。
    
    与 audit_purge 使用相同的过滤条件，确保 verify 与 execute 对齐。
    
    Input: log_types, start_date, end_date (POST)
    Output: JSON {
        business_count: int,
        infra_count: int,
        system_count: int,
        total: int,
        has_data: bool,
        message: str
    }
    
    ⚠️ 严格脱敏：不返回表名、列名、SQL、路径等内部信息
    """
    AuditContextManager.set_page_hierarchy(["安全审计日志", "日志管理", "清空验证"])
    
    # 权限检查
    if not request.user.is_superuser:
        return JsonResponse({'error': _('权限不足：仅超级管理员可执行'), 'has_data': False}, status=403)
    
    # 参数解析
    log_types = request.POST.getlist("log_types")
    start_date = request.POST.get("start_date")
    end_date = request.POST.get("end_date")
    
    # 参数验证
    if not log_types:
        return JsonResponse({'error': _('请选择至少一种日志类型'), 'has_data': False}, status=400)
    
    if not start_date or not end_date:
        return JsonResponse({'error': _('请填写日期范围'), 'has_data': False}, status=400)
    
    # 日期格式验证
    import datetime
    try:
        s_date = datetime.datetime.strptime(start_date, '%Y-%m-%d').date()
        e_date = datetime.datetime.strptime(end_date, '%Y-%m-%d').date()
    except ValueError:
        return JsonResponse({'error': _('日期格式错误'), 'has_data': False}, status=400)
    
    if s_date > e_date:
        return JsonResponse({'error': _('开始日期不能晚于结束日期'), 'has_data': False}, status=400)
    
    # 调用 LogService 统计
    result = LogService.count_logs_by_range(log_types, start_date, end_date)
    
    # 构建脱敏响应消息
    if result['has_data']:
        message = _('在 {start} 至 {end} 期间，共发现 {count} 条可清理的审计日志记录。').format(start=start_date, end=end_date, count=result['total'])
    else:
        message = _('在 {start} 至 {end} 期间，未发现可清理的审计日志记录。').format(start=start_date, end=end_date)
    
    return JsonResponse({
        'business_count': result['business_count'],
        'infra_count': result['infra_count'],
        'system_count': result['system_count'],
        'total': result['total'],
        'has_data': result['has_data'],
        'message': message,
        'date_range': f"{start_date} ~ {end_date}"
    })