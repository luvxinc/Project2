# File: backend/core/middleware/audit_middleware.py
from __future__ import annotations

import json
import time
import uuid
from typing import Any, Dict, Optional

from django.utils.deprecation import MiddlewareMixin
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.http import HttpResponse
from django.conf import settings

# [Core Change] 使用新版上下文管理器
from backend.apps.audit.core.context import AuditContextManager
from backend.apps.audit.core.dto import LogStatus, LogType
from backend.core.sys.logger import get_logger, get_error_logger

biz_logger = get_logger("biz")
error_logger = get_error_logger()


class AuditOperationMiddleware(MiddlewareMixin):

    def process_request(self, request):
        # 强制登出检查 (5种情况)
        if request.user.is_authenticated:
            # 1. Session 超时检查 (IDLE 超过 6 小时)
            current_time = time.time()
            last = request.session.get('last_activity', current_time)
            if (current_time - last) > settings.AUTO_LOGOUT_SECONDS:
                logout(request)
                request.session.flush()
                if request.headers.get('HX-Request'):
                    resp = HttpResponse("Session Expired", status=200)
                    resp["HX-Redirect"] = "/login/?reason=timeout"
                    return resp
                return redirect('web_ui:login')
            request.session['last_activity'] = current_time
            
            # 2-5. 动态验证 (密码修改/别处登录/账户锁定)
            # 条件：只有当 session 中存在 auth_token 时才验证
            from backend.core.services.auth.service import AuthService
            session_token = request.session.get('auth_token')
            if session_token:
                db_user = AuthService.get_user_by_username(request.user.username)
                if db_user:
                    # 检查账户是否被锁定
                    if db_user.is_locked:
                        logout(request)
                        request.session.flush()
                        if request.headers.get('HX-Request'):
                            resp = HttpResponse("Account Locked", status=200)
                            resp["HX-Redirect"] = "/login/?reason=locked"
                            return resp
                        return redirect('web_ui:login')
                    
                    # 检查 token 是否匹配 (密码修改/别处登录会导致不匹配)
                    if db_user.session_token != session_token:
                        logout(request)
                        request.session.flush()
                        if request.headers.get('HX-Request'):
                            resp = HttpResponse("Session Invalid", status=200)
                            resp["HX-Redirect"] = "/login/?reason=session_invalidated"
                            return resp
                        return redirect('web_ui:login')

        # 2. [ISO] 初始化全链路审计上下文
        user = request.user.username if request.user.is_authenticated else "Anonymous"
        ip = self._get_client_ip(request)
        trace_id = str(uuid.uuid4())

        AuditContextManager.init_context(username=user, ip=ip, trace_id=trace_id)

        # 2.1 [ISO] 注入上帝模式状态
        AuditContextManager.set_god_mode(request.session.get('audit_god_mode', False))

        # 3. [ISO] 计算页面层级 (Page Hierarchy)
        # 逻辑: URL Path -> [Nav, Tab, Action]
        page_stack = self._resolve_page_hierarchy(request.path)
        AuditContextManager.set_page_hierarchy(page_stack)

        request._audit_t0 = time.time()

    def process_response(self, request, response):
        try:
            if not (request.path.startswith("/dashboard/") or request.path in ["/login/", "/logout/"]):
                return response

            ref_id = AuditContextManager.get_trace_id()
            status_code = getattr(response, "status_code", 200)

            # 1. 自动判定状态
            auto_status, auto_root = self._determine_status(status_code)

            oplog = getattr(request, "_oplog", {}) or {}

            # 2. [关键] 优先使用 View 层传递的显式状态 (如果有)
            final_status = oplog.get("status", auto_status)
            final_root_cause = oplog.get("root_cause", auto_root)

            # [Phase 1.2] action 标准化为英文枚举
            action = oplog.get("action")
            if not action or action in ["-", "查看页面", "提交数据", "删除数据", "访问"]:
                action = self._standardize_action(request.method, status_code, final_status)

            changes_data = oplog.get("changes", {})
            details_str = json.dumps(changes_data, ensure_ascii=False) if changes_data else "-"

            # [Phase 1] 写入侧过滤：不记录成功的纯 GET 页面访问
            is_success_get = (
                request.method == "GET" and 
                200 <= status_code < 400 and 
                not oplog
            )
            
            if is_success_get:
                return response

            # [Phase 1.2] 系统异常（500）不进入 Business 日志，只进 Error 日志
            is_system_error = (status_code >= 500)
            
            if not is_system_error:
                # [Log Writing] - Business 日志只记录用户足迹 + 业务失败
                biz_logger.info(
                    f"{action}",
                    extra={
                        "action": action,
                        "target": oplog.get("target", "-"),
                        "status": final_status,
                        "root_cause": final_root_cause,
                        "details": details_str,
                        "note": oplog.get("note", ""),
                        "log_type": oplog.get("type", LogType.REGULAR)
                    }
                )

            # 3. [Fix 3.0] 三表联动: 只要包含 "Failed" 字样，强制写入 Error Log
            if "Failed" in final_status:
                error_logger.error(
                    f"Business Fail: {action} [{status_code}]",
                    extra={
                        "action": "BUSINESS_FAIL",
                        "status": final_status,
                        "root_cause": final_root_cause,
                        "error_path": request.path,
                        "error_func": oplog.get("func", "View"),
                        "reference": ref_id,  # 强关联
                        "details": details_str
                    }
                )

        except Exception as e:
            error_logger.error(f"Audit Middleware Failed: {e}")

        return response

    # --- Helpers ---

    def _get_client_ip(self, request) -> str:
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR') or "0.0.0.0"

    def _determine_status(self, code: int):
        if 200 <= code < 400: return LogStatus.SUCCESS, "-"
        if code == 403: return LogStatus.FAIL_PERM, "Access Denied"
        if code == 404: return LogStatus.FAIL_OTHER, "Resource Not Found"
        if code >= 500: return LogStatus.FAIL_SYS, "Server Error"
        return LogStatus.FAIL_DATA, f"Client Error {code}"

    def _resolve_page_hierarchy(self, path: str) -> list:
        """
        URL -> 面包屑导航
        /dashboard/user_admin/tab/users/ -> ["用户管理", "用户列表"]
        """
        stack = []
        if path == "/login/": return ["系统入口", "登录"]
        if path == "/logout/": return ["系统入口", "登出"]

        if "/user_admin/" in path:
            stack.append("用户权限管理")
            if "users" in path:
                stack.append("用户列表")
            elif "policies" in path:
                stack.append("密码策略")
            elif "capabilities" in path:
                stack.append("职能开关")
        elif "/audit/" in path:
            stack.append("安全审计日志")
            if "business" in path:
                stack.append("业务操作")
            elif "infra" in path:
                stack.append("底层数据")
            elif "system" in path:
                stack.append("系统故障")
        elif "/etl/" in path:
            stack.append("数据集成")
        else:
            stack.append("首页")

        return stack

    def _standardize_action(self, method: str, status_code: int, status: str) -> str:
        """
        [Phase 1.2] 标准化 action 为英文枚举
        规则：
        - 403 -> ACCESS_DENIED
        - 404 -> NOT_FOUND
        - 其他失败 -> {METHOD}_FAIL
        - POST 成功 -> SUBMIT
        - PUT/PATCH 成功 -> UPDATE
        - DELETE 成功 -> DELETE
        - GET 失败 -> VIEW_FAIL
        """
        is_failed = "Failed" in status
        
        if is_failed:
            if status_code == 403:
                return "ACCESS_DENIED"
            if status_code == 404:
                return "NOT_FOUND"
            if status_code >= 500:
                return "SYSTEM_ERROR"
            return f"{method}_FAIL"
        
        # 成功的非 GET（GET 成功已被过滤）
        action_map = {
            "POST": "SUBMIT",
            "PUT": "UPDATE",
            "PATCH": "UPDATE",
            "DELETE": "DELETE",
        }
        return action_map.get(method, f"{method}_ACTION")