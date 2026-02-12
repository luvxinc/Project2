# File: backend/apps/audit/views/tabs.py
"""
# ==============================================================================
# 模块名称: 审计看板 Tab 页视图 (Audit Tabs)
# ==============================================================================
#
# [Purpose / 用途]
# 渲染审计看板的各个子标签页 (Business, Infra, System)。
# 实现了复杂的筛选逻辑 (Search, Time Range, User Filter) 和数据组装。
#
# [Architecture / 架构]
# - Layer: Presentation Layer (View)
# - Dependencies:
#   - LogService: 获取日志数据
#   - AuthService: 获取用户列表
#
# [ISO Compliance / 合规性]
# - 过滤逻辑: 确保 Business Log 默认不显示 System 操作，避免噪音。
# - 故障追踪: System Tab 统计故障修复率 (Patched Count)。
#
# ==============================================================================
"""
import re
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from backend.core.services.log_service import LogService
from backend.core.services.auth.service import AuthService
from backend.common.settings import settings


def _get_patch_versions():
    """解析 patch_notes.txt 获取版本号列表"""
    versions = []
    try:
        if settings.PATCH_NOTES_FILE.exists():
            with open(settings.PATCH_NOTES_FILE, 'r', encoding='utf-8') as f:
                content = f.read()
            # 匹配格式: [V1.0.0]
            matches = re.findall(r'\[(V[\d\.]+)\]', content)
            versions = sorted(list(set(matches)), reverse=True)
    except Exception:
        pass
    return versions


@login_required(login_url='web_ui:login')
def audit_tab_content(request, tab_name):
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponse("Access Denied", status=403)

    is_god_mode = request.session.get('audit_god_mode', False)

    # 筛选参数
    q = request.GET.get('q', '').strip()
    status = request.GET.get('status', 'ALL')
    days = request.GET.get('days', '7')
    user_filter = request.GET.get('user', 'ALL')
    sort_by = request.GET.get('sort', 'time')
    sort_dir = request.GET.get('dir', 'desc')

    # 用户列表
    try:
        df_users = AuthService.list_users()
        user_options = df_users['username'].tolist() if not df_users.empty else []
    except:
        user_options = []

    context = {
        "tab_name": tab_name,
        "is_god_mode": is_god_mode,
        "user_options": user_options,
        "filter": {"q": q, "status": status, "days": days, "user": user_filter, "sort": sort_by, "dir": sort_dir}
    }

    try:
        if tab_name == 'business':
            # ISO: 过滤掉 System 自动操作 (除非显式搜索)
            logs = LogService.get_file_logs("app.log", q=q, status=status, days=days, user=user_filter, sort_by=sort_by,
                                            sort_dir=sort_dir, is_god_mode=is_god_mode)
            
            # [New] Filter out 'VIEW' actions to reduce noise
            logs = [l for l in logs if l.action.strip().upper() != 'VIEW']
            
            if user_filter == 'ALL': logs = [l for l in logs if l.user != 'System']

            context.update({
                "logs": [l.to_dict() for l in logs],
                "total_count": len(logs),
                "description": "用户行为审计 (User Operations Trace)",
            })
            return render(request, "components/audit_tab_business.html", context)

        elif tab_name == 'infra':
            logs = LogService.get_unified_logs(q=q, status=status, days=days, user=user_filter, sort_by=sort_by,
                                               sort_dir=sort_dir, is_god_mode=is_god_mode)
            if user_filter == 'ALL': logs = [l for l in logs if l.user != 'System']

            context.update({
                "logs": [l.to_dict() for l in logs],
                "total_count": len(logs),
                "description": "底层数据变更 (Data Mutation & SQL)",
            })
            return render(request, "components/audit_tab_infra.html", context)

        elif tab_name == 'system':
            # System Log 不过滤 User
            logs = LogService.get_file_logs("error.log", q=q, status=status, days=days, user=user_filter,
                                            sort_by=sort_by, sort_dir=sort_dir, is_god_mode=is_god_mode)

            # 统计修复率
            patched_count = sum(1 for l in logs if l.patched_ver)
            
            # [New] Last Error Date
            last_error_date = logs[0].time[:10] if logs else "-"

            context.update({
                "logs": [l.to_dict() for l in logs],
                "stats": {
                    "total": len(logs), 
                    "patched": patched_count, 
                    "pending": len(logs) - patched_count,
                    "last_error": last_error_date
                },
                "patch_versions": _get_patch_versions(),
                "description": "系统故障堆栈 (Exceptions & Tracebacks)",
            })
            return render(request, "components/audit_tab_system.html", context)

    except Exception as e:
        import traceback
        return HttpResponse(f"<div class='alert alert-danger'>Load Failed: {str(e)}</div>")

    return HttpResponse("Unknown Tab", status=404)