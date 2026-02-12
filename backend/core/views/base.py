# File: backend/core/views/base.py
"""
# ==============================================================================
# 模块名称: API 视图基类 (Base API View)
# ==============================================================================
#
# [Purpose / 用途]
# 所有 API 视图的基类 (Mixin)。
# 提供统一的异常处理、响应格式化和安全头注入。
#
# [Architecture / 架构]
# - Pattern: Template Method / Mixin
# - Features:
#   - handle_exception: 捕获 AppException 并转换为 StandardResponse。
#   - secure_response: 注入 ISO 要求的 Security Headers。
#
# ==============================================================================
"""

import functools
from django.views import View
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from backend.core.sys.response import StandardResponse
from backend.core.sys.exceptions import AppException
from backend.core.sys.logger import get_error_logger

logger = get_error_logger()

def api_exception_handler(func):
    """
    [Decorator] 统一异常处理装饰器
    用于函数式视图或类方法
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except AppException as e:
            return StandardResponse.error(
                msg=e.message, 
                code=e.code, 
                errors=e.details
            )
        except Exception as e:
            logger.error(f"Unhandled API Error: {e}", exc_info=True)
            return StandardResponse.error(
                msg="Internal Server Error", 
                code=500,
                errors=str(e) if settings.DEBUG else None
            )
    return wrapper

class BaseAPIView(View):
    """
    Class-Based View 的基类
    """
    def dispatch(self, request, *args, **kwargs):
        try:
            response = super().dispatch(request, *args, **kwargs)
            return self._add_security_headers(response)
        except Exception as e:
            return self._handle_exception(e)

    def _handle_exception(self, e: Exception):
        if isinstance(e, AppException):
            return StandardResponse.error(msg=e.message, code=e.code, errors=e.details)
        
        logger.error(f"Unhandled View Error: {e}", exc_info=True)
        return StandardResponse.error(msg="Internal Server Error", code=500)

    def _add_security_headers(self, response):
        """注入安全头"""
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = 'DENY'
        return response
