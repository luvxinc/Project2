# File: backend/core/middleware/exception.py
"""
全局异常捕获中间件
自动捕获所有未处理异常并记录到 log_error
"""
import traceback
import sys
import json
from django.http import JsonResponse
from django.conf import settings


class GlobalExceptionMiddleware:
    """
    全局异常捕获中间件
    
    功能:
    1. 捕获所有穿透 View 层的未处理异常
    2. 自动记录完整错误信息到 log_error
    3. 返回友好的错误响应
    """
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        try:
            response = self.get_response(request)
            return response
        except Exception as e:
            # 全局兜底捕获
            return self._handle_exception(request, e)
    
    def process_exception(self, request, exception):
        """
        Django 调用此方法处理 View 层未捕获异常
        返回 None 表示继续默认处理
        """
        try:
            from apps.log.services import LogErrorService
            
            # 判断严重程度
            severity = self._classify_severity(exception)
            
            # 记录错误日志
            LogErrorService.create_from_exception(
                request=request,
                exception=exception,
                severity=severity
            )
        except Exception as log_error:
            # 日志记录失败，打印到控制台但不影响主流程
            print(f"[GlobalExceptionMiddleware] 日志记录失败: {log_error}")
        
        # 返回 None 让 Django 继续默认处理
        return None
    
    def _handle_exception(self, request, exception):
        """处理 __call__ 中捕获的异常"""
        try:
            from apps.log.services import LogErrorService
            
            severity = self._classify_severity(exception)
            LogErrorService.create_from_exception(
                request=request,
                exception=exception,
                severity=severity
            )
        except Exception as log_error:
            print(f"[GlobalExceptionMiddleware] 日志记录失败: {log_error}")
        
        # 判断是否为 API 请求
        if self._is_api_request(request):
            return JsonResponse({
                'success': False,
                'error': '服务器内部错误',
                'message': str(exception) if settings.DEBUG else '请联系管理员',
            }, status=500)
        
        # 非 API 请求，重新抛出让 Django 默认处理
        raise exception
    
    def _classify_severity(self, exception) -> str:
        """分类异常严重程度"""
        exc_type = type(exception).__name__
        
        # 严重错误
        if any(keyword in exc_type for keyword in ['Database', 'Connection', 'Memory', 'System']):
            return 'CRITICAL'
        
        # 高级别错误
        if any(keyword in exc_type for keyword in ['Permission', 'Authentication', 'Integrity']):
            return 'HIGH'
        
        # 中级别错误
        if any(keyword in exc_type for keyword in ['Validation', 'Value', 'Type', 'Key']):
            return 'MEDIUM'
        
        # 默认高级别
        return 'HIGH'
    
    def _is_api_request(self, request) -> bool:
        """判断是否为 API 请求"""
        # 检查路径
        if request.path.startswith('/api/'):
            return True
        
        # 检查 Accept 头
        accept = request.META.get('HTTP_ACCEPT', '')
        if 'application/json' in accept:
            return True
        
        # 检查 Content-Type
        content_type = request.content_type
        if content_type and 'json' in content_type:
            return True
        
        # 检查 X-Requested-With (AJAX)
        if request.META.get('HTTP_X_REQUESTED_WITH') == 'XMLHttpRequest':
            return True
        
        return False
