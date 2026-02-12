# File: backend/apps/audit/views/details.py
"""
# ==============================================================================
# 模块名称: 审计日志详情视图 (Detail Modal View)
# ==============================================================================
#
# [Purpose / 用途]
# 提供单个 Reference ID (Trace ID) 的全链路详情展示。
# 聚合 Business (业务)、Infra (数据)、System (错误) 三层日志，还原事故现场。
#
# [Architecture / 架构]
# - Layer: Presentation Layer (View)
# - Template: audit/components/audit_detail_modal.html
# - Logic: Log Aggregation (Service) + Dynamic Masking (Render)
#
# [ISO Compliance / 合规性]
# - 透明度: 提供完整的上下文 (Details JSON)，不再是黑盒。
# - 隐私保护: 渲染时根据 God Mode 状态动态脱敏 (Masking)。
#
# ==============================================================================
"""
import json
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from backend.core.services.log_service import LogService
from backend.apps.audit.core.context import AuditContextManager
from backend.apps.audit.core.masker import AuditMasker


@login_required(login_url='web_ui:login')
def audit_detail_view(request, ref_id):
    """
    [Phase 3.5] 日志详情页（名片式展示）
    URL: /dashboard/audit/details/<ref_id>/
    
    支持 Business Log 和 System Log 的详情展示。
    替代原有的 HTMX Modal 方式。
    """
    from urllib.parse import unquote
    
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponse("Access Denied", status=403)

    is_god_mode = request.session.get('audit_god_mode', False)
    
    # 1. 确定返回 URL
    return_url = request.GET.get('return', '')
    if return_url:
        return_url = unquote(return_url)
    else:
        # 尝试从 HTTP_REFERER 获取
        referer = request.META.get('HTTP_REFERER', '')
        if 'audit/' in referer and ref_id not in referer:
            return_url = referer
        else:
            # 默认返回到审计中心
            return_url = '/dashboard/audit/'

    # 2. 聚合三表日志
    log_data = LogService.get_logs_by_ref(ref_id, is_god_mode)

    # 3. 提取核心记录 (Business Log 应该是最全的)
    main_log = log_data['business'][0] if log_data['business'] else None

    if not main_log and log_data['infra']:
        main_log = log_data['infra'][0]  # Fallback to Infra if Business is missing
    
    if not main_log and log_data['system']:
        main_log = log_data['system'][0]  # Fallback to System if others are missing

    if not main_log:
        return render(request, "audit/pages/log_detail.html", {
            "error": f"未找到 Reference ID: {ref_id} 的记录",
            "return_url": return_url,
            "is_god_mode": is_god_mode,
            "is_superuser": request.user.is_superuser
        })

    # 4. 解析 Details (Changes)
    try:
        # 尝试解析 JSON，如果失败则使用原始字符串
        raw_details = main_log.get('details', '{}')
        details_obj = json.loads(raw_details) if raw_details and raw_details != '-' else None
    except:
        details_obj = {"raw_details": main_log.get('details', '-')}

    context = {
        "ref_id": ref_id,
        "main_log": main_log,
        "details_obj": json.dumps(details_obj, indent=2, ensure_ascii=False) if details_obj else None,
        "infra_logs": log_data['infra'],
        "system_logs": log_data['system'],
        "is_god_mode": is_god_mode,
        "is_superuser": request.user.is_superuser,
        "return_url": return_url,
    }

    return render(request, "audit/pages/log_detail.html", context)


@login_required(login_url='web_ui:login')
def audit_event_detail(request, event_key: str):
    """
    [Phase 3.5] 事件详情页（名片式展示）
    URL: /dashboard/audit/events/<event_key>/
    
    替代不稳定的 Modal 弹出方式，改为独立详情页面。
    """
    from urllib.parse import unquote
    
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponse("Access Denied", status=403)
    
    is_god_mode = request.session.get('audit_god_mode', False)
    
    # 1. 确定返回 URL
    return_url = request.GET.get('return', '')
    if return_url:
        return_url = unquote(return_url)
    else:
        # 尝试从 HTTP_REFERER 获取
        referer = request.META.get('HTTP_REFERER', '')
        if 'audit/events' in referer and event_key not in referer:
            return_url = referer
        else:
            # 默认返回到 1 天的事件列表
            return_url = '/dashboard/audit/events/?days=1'
    
    # 2. 获取所有事件并查找匹配项
    # 使用较大的 days 范围以确保能找到事件
    days_to_search = 30  # 搜索最近 30 天
    try:
        all_events = LogService.get_unified_events(
            days=str(days_to_search),
            is_god_mode=is_god_mode,
            limit=5000
        )
    except Exception as e:
        return render(request, "audit/pages/event_detail.html", {
            "error": f"获取事件数据失败: {str(e)}",
            "return_url": return_url,
            "is_god_mode": is_god_mode,
            "is_superuser": request.user.is_superuser
        })
    
    # 3. 按 event_key 查找匹配事件
    event = None
    for e in all_events:
        if e.event_key == event_key:
            event = e
            break
    
    if not event:
        return render(request, "audit/pages/event_detail.html", {
            "error": f"记录不存在或已过期 (Event Key: {event_key})",
            "return_url": return_url,
            "is_god_mode": is_god_mode,
            "is_superuser": request.user.is_superuser
        })
    
    # 4. 转换为 dict 并应用掩码
    event_data = event.to_dict()
    
    # 5. 对敏感字段应用掩码规则
    if not is_god_mode:
        # 掩码需要隐藏的字段
        sensitive_fields = ['ip', 'reference', 'event_id']
        for field in sensitive_fields:
            if event_data.get(field) and event_data[field] != '-':
                event_data[field] = '***'
        
        # 对 entries 中的敏感字段也应用掩码
        for entry in event_data.get('entries', []):
            for field in sensitive_fields:
                if entry.get(field) and entry[field] != '-':
                    entry[field] = '***'
            # details, meta, note 也需要掩码
            for detail_field in ['details', 'meta', 'note', 'sql']:
                if entry.get(detail_field) and entry[detail_field] != '-':
                    entry[detail_field] = '***'
    
    context = {
        "event": event_data,
        "return_url": return_url,
        "is_god_mode": is_god_mode,
        "is_superuser": request.user.is_superuser
    }
    
    return render(request, "audit/pages/event_detail.html", context)