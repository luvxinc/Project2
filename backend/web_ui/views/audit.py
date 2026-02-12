# File: backend/web_ui/views/audit.py
"""
# ==============================================================================
# 模块名称: [Legacy] 审计视图 (Legacy Audit View)
# ==============================================================================
#
# [Purpose / 用途]
# 旧版 Dashboard 的审计视图 (兼容层)。
# 目前仅用于展示简单的日志列表，正在逐步迁移到 backend/apps/audit。
#
# [Status / 状态]
# - Deprecated: Yes (Partial)
# - Replacement: backend/apps/audit/views
#
# ==============================================================================
"""
from django.shortcuts import render
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse
from backend.core.services.log_service import LogService
import pandas as pd


@login_required(login_url='web_ui:login')
def audit_dashboard(request):
    """
    [View] 审计中心主框架 (Legacy)
    """
    from backend.core.services.auth.service import AuthService
    
    perms = AuthService.get_permissions(request.user.username)
    has_module = bool(perms.get('module.audit'))
    has_business = bool(perms.get('module.audit.business'))
    has_infra = bool(perms.get('module.audit.infra'))
    has_system = bool(perms.get('module.audit.system'))
    
    # 只有 superuser 或有相关权限才能访问
    can_access = request.user.is_superuser or has_module or has_business or has_infra or has_system
    
    if not can_access:
        return render(request, "errors/403.html", status=403)
    
    is_god = request.session.get('god_mode', False)
    
    # Hub Items - 显示所有，通过 has_access 控制点击行为
    hub_items = [
        {'id': 'business', 'name': '业务操作日志', 'icon': 'fas fa-briefcase', 'desc': '记录用户在前端界面的显性操作 (登录、点击、下载)。', 
         'has_access': request.user.is_superuser or has_module or has_business},
        {'id': 'infra', 'name': '全景数据审计', 'icon': 'fas fa-database', 'desc': '底层数据变更追踪，合并展示应用日志与数据库原子操作。', 
         'has_access': request.user.is_superuser or has_module or has_infra},
        {'id': 'system', 'name': '系统故障监控', 'icon': 'fas fa-bug', 'desc': '捕获系统运行时的异常错误 (Exceptions) 与堆栈追踪。', 
         'has_access': request.user.is_superuser or has_module or has_system},
    ]
    
    # Superuser 专属功能
    if request.user.is_superuser:
        hub_items.append({
            'id': 'purge', 'name': '清空日志', 'icon': 'fas fa-trash-can', 'desc': '物理擦除历史审计数据 (Admin Only)。', 
            'action_type': 'modal', 'target_modal': '#purgeLogModal', 'has_access': True
        })
        
        if not is_god:
            hub_items.append({
                'id': 'god_unlock', 'name': '解锁上帝模式', 'icon': 'fas fa-eye', 'desc': '查看 Unmasked 敏感数据 (需 L4 授权)。',
                'action_type': 'modal', 'target_modal': '#godModeModal', 'has_access': True
            })

    return render(request, "pages/audit_dashboard.html", {
        "active_tab": "business",
        "hub_items": hub_items,
        "is_god_mode": is_god
    })


@login_required(login_url='web_ui:login')
def audit_tab_content(request, tab_name):
    """
    [HTMX] 动态加载 Tab 内容
    """
    if not (request.user.is_superuser or request.user.is_staff):
        return HttpResponse("Access Denied", status=403)

    context = {"tab_name": tab_name}

    try:
        # --- Tab 1: 业务操作日志 ---
        if tab_name == 'business':
            df = LogService.get_file_logs("app.log", max_lines=1000)
            logs_data = df.fillna("-").to_dict('records') if not df.empty else []

            context.update({
                "logs": logs_data,
                "total_count": len(logs_data),
                "description": "记录用户在前端界面的显性操作 (登录、点击、下载)。",
                "source_file": "logs/app.log"
            })
            return render(request, "components/audit_tab_business.html", context)

        # --- Tab 2: 底层数据审计 ---
        elif tab_name == 'infra':
            df = LogService.get_unified_logs("audit.log")
            df = df.head(1000)  # Limit
            logs_data = df.fillna("-").to_dict('records') if not df.empty else []

            context.update({
                "logs": logs_data,
                "total_count": len(logs_data),
                "description": "全景上帝视角：合并展示 [文件日志] 与 [数据库原子变更]。",
                "source_file": "logs/audit.log + DB"
            })
            return render(request, "components/audit_tab_infra.html", context)

        # --- Tab 3: 系统故障日志 (System) [本次新增] ---
        elif tab_name == 'system':
            # 1. 读取 error.log
            df = LogService.get_file_logs("error.log", max_lines=500)

            # 2. 计算统计指标 (KPI)
            stats = {
                "total": 0,
                "top_module": "-",
                "latest": "-"
            }

            logs_data = []
            if not df.empty:
                df = df.fillna("-")
                logs_data = df.to_dict('records')

                # KPI 计算
                stats["total"] = len(df)
                if 'func' in df.columns and not df['func'].empty:
                    # 取出现频率最高的模块 (Mode)
                    try:
                        stats["top_module"] = df['func'].mode()[0]
                    except:
                        stats["top_module"] = "-"

                if 'time' in df.columns and not df['time'].empty:
                    stats["latest"] = df.iloc[0]['time']

            context.update({
                "logs": logs_data,
                "stats": stats,
                "description": "捕获系统运行时的未处理异常 (Uncaught Exceptions) 与堆栈追踪。",
                "source_file": "logs/error.log"
            })
            return render(request, "components/audit_tab_system.html", context)

    except Exception as e:
        import traceback
        return HttpResponse(f"""
            <div class="alert alert-danger m-3">
                <i class="fa-solid fa-triangle-exclamation me-2"></i>
                加载失败: {str(e)}
                <pre class="mt-2 small">{traceback.format_exc()}</pre>
            </div>
        """)

    return HttpResponse("Unknown Tab", status=404)