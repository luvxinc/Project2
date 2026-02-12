# File: backend/core/sys/response.py
"""
# ==============================================================================
# 模块名称: 标准响应格式 (Standard Response)
# ==============================================================================
#
# [Purpose / 用途]
# 定义统一的 API 响应结构，确保所有接口返回一致的 JSON 格式。
#
# [Architecture / 架构]
# - Structure:
#   {
#       "status": "success" | "error",
#       "code": int,
#       "message": str,
#       "data": any,
#       "meta": dict (Optional, for trace_id, pagination, etc.)
#   }
#
# [ISO Compliance / 合规性]
# - 可预测性: 前端和第三方调用者可以依赖固定的 status/code 字段进行处理。
#
# ==============================================================================
"""

from django.http import JsonResponse
from typing import Any, Dict, Optional
from datetime import datetime
from backend.core.sys.context import get_trace_id

class StandardResponse:
    @staticmethod
    def success(data: Any = None, msg: str = "Success", meta: Optional[Dict] = None) -> JsonResponse:
        """
        返回成功响应 (HTTP 200)
        """
        payload = {
            "status": "success",
            "code": 200,
            "message": msg,
            "data": data,
            "meta": {
                "timestamp": datetime.now().isoformat(),
                "trace_id": get_trace_id(),
                **(meta or {})
            }
        }
        return JsonResponse(payload, status=200)

    @staticmethod
    def error(msg: str = "Error", code: int = 400, errors: Any = None, http_status: int = None) -> JsonResponse:
        """
        返回错误响应
        :param msg: 错误提示信息
        :param code: 业务错误码 (通常与 HTTP 状态码一致，也可自定义)
        :param errors: 详细错误列表 (Validation Errors)
        :param http_status: 实际 HTTP 响应码 (默认等于 code)
        """
        status_code = http_status if http_status else code
        
        payload = {
            "status": "error",
            "code": code,
            "message": msg,
            "errors": errors,
            "meta": {
                "timestamp": datetime.now().isoformat(),
                "trace_id": get_trace_id()
            }
        }
        return JsonResponse(payload, status=status_code)
