# File: backend/core/middleware/error_middleware.py
import traceback
import uuid
from django.shortcuts import render
from django.http import HttpResponseServerError
from core.sys.logger import get_error_logger
from backend.apps.audit.core.context import AuditContextManager

logger = get_error_logger()


class GlobalExceptionMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        return self.get_response(request)

    def process_exception(self, request, exception):
        # 1. 获取/生成 Trace ID
        ref_id = AuditContextManager.get_trace_id() or str(uuid.uuid4())

        # 2. 记录日志 (System Log)
        tb = traceback.format_exc()
        logger.error(
            f"Uncaught Exception: {str(exception)}",
            extra={
                "status": "Failed(System)",
                "root_cause": str(exception),
                "details": tb,
                "reference": ref_id,
                "page": request.path
            }
        )

        # 3. 错误页渲染逻辑
        # 如果是 Super User，显示详细堆栈 (默认 Django 行为 或 自定义)
        if request.user.is_superuser:
            return None  # 让 Django 默认的 debug 页处理 (开发模式) 或 渲染详细 Admin 页

        # 如果是普通用户，渲染友好页面
        context = {
            "ref_id": ref_id,
            "error_type": "System Error",
            "message": "系统遇到意外问题，请联系管理员并提供 REF ID。"
        }
        return render(request, "pages/error_page.html", context, status=500)