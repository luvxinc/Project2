# File: backend/apps/log/services.py
"""
日志服务层 - 提供统一的日志写入接口
"""
import hashlib
import json
import traceback
import sys
from typing import Optional, Dict, Any
from django.conf import settings
from django.utils import timezone

from .models import LogError, LogAudit, LogBusiness, LogAccess


def _get_dev_mode() -> bool:
    """获取当前开发模式状态"""
    return getattr(settings, 'LOG_DEV_MODE', False)


def _compute_error_hash(file_path: str, line_number: int, error_type: str) -> str:
    """计算错误哈希，用于聚合相似错误"""
    content = f"{file_path}:{line_number}:{error_type}"
    return hashlib.md5(content.encode()).hexdigest()[:16]


class LogErrorService:
    """错误日志服务"""
    
    @classmethod
    def create_from_exception(
        cls,
        request,
        exception: Exception,
        severity: str = 'HIGH',
        category: str = None
    ) -> LogError:
        """
        从异常创建错误日志
        自动提取堆栈、位置、上下文等信息
        """
        # 获取异常信息
        exc_type, exc_value, exc_tb = sys.exc_info()
        
        # 格式化完整堆栈
        full_traceback = ''.join(traceback.format_exception(exc_type, exc_value, exc_tb))
        
        # 提取位置信息
        file_path = ''
        line_number = None
        function_name = ''
        if exc_tb:
            tb = traceback.extract_tb(exc_tb)
            if tb:
                last_frame = tb[-1]
                file_path = last_frame.filename
                line_number = last_frame.lineno
                function_name = last_frame.name
        
        # 提取局部变量
        local_vars = {}
        if exc_tb:
            frame = exc_tb.tb_frame
            while frame.tb_next:
                frame = frame.tb_next
            local_vars = cls._safe_serialize_locals(frame.f_locals) if hasattr(frame, 'f_locals') else {}
        
        # 获取请求上下文
        from apps.audit.core.context import AuditContextManager
        ctx = AuditContextManager.get_current()
        
        # 安全获取请求体
        request_body = cls._safe_get_body(request)
        
        # 计算错误哈希
        error_hash = _compute_error_hash(file_path, line_number or 0, type(exception).__name__)
        
        # 自动分类
        if category is None:
            category = cls._classify_category(exception)
        
        # 创建记录
        return LogError.objects.create(
            trace_id=ctx.trace_id,
            user=ctx.username or 'System',
            ip=ctx.ip or cls._get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:512] if request else None,
            session_id=request.session.session_key if request and hasattr(request, 'session') else None,
            http_method=request.method if request else None,
            request_path=request.path if request else None,
            query_params=request.GET.urlencode() if request else None,
            request_body=request_body,
            request_headers=cls._get_safe_headers(request),
            content_type=request.content_type if request else None,
            error_type=type(exception).__name__,
            error_message=str(exception),
            traceback_full=full_traceback,
            file_path=file_path,
            function_name=function_name,
            line_number=line_number,
            module_name=type(exception).__module__,
            local_variables=json.dumps(local_vars, ensure_ascii=False, default=str) if local_vars else None,
            severity=severity,
            category=category,
            error_hash=error_hash,
            dev_mode=_get_dev_mode(),
        )
    
    @classmethod
    def create(cls, **kwargs) -> LogError:
        """直接创建错误日志"""
        kwargs['dev_mode'] = _get_dev_mode()
        return LogError.objects.create(**kwargs)
    
    @staticmethod
    def _safe_serialize_locals(locals_dict: dict) -> dict:
        """安全序列化局部变量"""
        result = {}
        for key, value in locals_dict.items():
            if key.startswith('_'):
                continue
            try:
                str_value = str(value)[:1000]
                result[key] = str_value
            except:
                result[key] = '<无法序列化>'
        return result
    
    @staticmethod
    def _safe_get_body(request) -> Optional[str]:
        """安全获取请求体"""
        if not request:
            return None
        try:
            body = request.body.decode('utf-8')[:10000]  # 限制大小
            return body
        except:
            return None
    
    @staticmethod
    def _get_client_ip(request) -> Optional[str]:
        """获取客户端 IP"""
        if not request:
            return None
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            return x_forwarded_for.split(',')[0].strip()
        return request.META.get('REMOTE_ADDR')
    
    @staticmethod
    def _get_safe_headers(request) -> Optional[str]:
        """获取安全的请求头（排除敏感信息）"""
        if not request:
            return None
        safe_headers = {}
        for key, value in request.META.items():
            if key.startswith('HTTP_'):
                header_name = key[5:].lower()
                # 排除敏感头
                if header_name not in ['cookie', 'authorization']:
                    safe_headers[header_name] = str(value)[:200]
        return json.dumps(safe_headers, ensure_ascii=False)[:2000]
    
    @staticmethod
    def _classify_category(exception: Exception) -> str:
        """自动分类异常"""
        exc_type = type(exception).__name__
        if 'Database' in exc_type or 'SQL' in exc_type or 'Integrity' in exc_type:
            return 'DATABASE'
        elif 'Permission' in exc_type or 'Forbidden' in exc_type:
            return 'PERMISSION'
        elif 'Validation' in exc_type or 'Value' in exc_type:
            return 'VALIDATION'
        elif 'Http' in exc_type or 'Request' in exc_type or 'Connection' in exc_type:
            return 'API'
        else:
            return 'SYSTEM'


class LogAuditService:
    """安全审计日志服务"""
    
    @classmethod
    def create(
        cls,
        action: str,
        result: str,
        actor_username: str = None,
        actor_id: int = None,
        actor_role: str = None,
        actor_ip: str = None,
        target_type: str = None,
        target_id: str = None,
        target_name: str = None,
        before_state: dict = None,
        after_state: dict = None,
        change_summary: str = None,
        action_category: str = None,
        deny_reason: str = None,
        fail_reason: str = None,
        risk_level: str = 'MEDIUM',
        log_type: str = 'REGULAR',
        **kwargs
    ) -> LogAudit:
        """创建审计日志"""
        from apps.audit.core.context import AuditContextManager
        ctx = AuditContextManager.get_current()
        
        return LogAudit.objects.create(
            trace_id=ctx.trace_id,
            event_id=ctx.event_id,
            actor_id=actor_id,
            actor_username=actor_username or ctx.username or 'System',
            actor_role=actor_role,
            actor_ip=actor_ip or ctx.ip,
            action=action,
            action_category=action_category,
            target_type=target_type,
            target_id=target_id,
            target_name=target_name,
            before_state=before_state,
            after_state=after_state,
            change_summary=change_summary,
            result=result,
            deny_reason=deny_reason,
            fail_reason=fail_reason,
            risk_level=risk_level,
            log_type=log_type,
            dev_mode=_get_dev_mode(),
            **kwargs
        )
    
    @classmethod
    def log_login_success(cls, user, request):
        """记录登录成功"""
        from apps.audit.core.context import AuditContextManager
        return cls.create(
            action='LOGIN_SUCCESS',
            actor_username=user.username,
            actor_id=user.pk,
            actor_ip=LogErrorService._get_client_ip(request),
            action_category='AUTH',
            result='SUCCESS',
            risk_level='LOW',
        )
    
    @classmethod
    def log_login_failed(cls, username: str, request, reason: str = None):
        """记录登录失败"""
        return cls.create(
            action='LOGIN_FAILED',
            actor_username=username,
            actor_ip=LogErrorService._get_client_ip(request),
            action_category='AUTH',
            result='FAILED',
            fail_reason=reason or '密码错误',
            risk_level='MEDIUM',
        )
    
    @classmethod
    def log_logout(cls, user, request):
        """记录登出"""
        return cls.create(
            action='LOGOUT',
            actor_username=user.username,
            actor_id=user.pk,
            actor_ip=LogErrorService._get_client_ip(request),
            action_category='AUTH',
            result='SUCCESS',
            risk_level='LOW',
        )
    
    @classmethod
    def log_permission_denied(cls, user, action: str, target: str, reason: str):
        """记录权限拒绝"""
        return cls.create(
            action=action,
            actor_username=user.username if user else 'Anonymous',
            target_name=target,
            action_category='AUTHZ',
            result='DENIED',
            deny_reason=reason,
            risk_level='HIGH',
        )


class LogBusinessService:
    """业务操作日志服务"""
    
    @classmethod
    def create(
        cls,
        action: str,
        summary: str,
        status: str = 'SUCCESS',
        module: str = None,
        target_type: str = None,
        target_id: str = None,
        details: dict = None,
        duration_ms: int = None,
        **kwargs
    ) -> LogBusiness:
        """创建业务操作日志"""
        from apps.audit.core.context import AuditContextManager
        ctx = AuditContextManager.get_current()
        
        return LogBusiness.objects.create(
            trace_id=ctx.trace_id,
            event_id=ctx.event_id,
            user=ctx.username or 'System',
            ip=ctx.ip,
            module=module or 'system',
            page_path=AuditContextManager.get_page_display(),
            action=action,
            target_type=target_type,
            target_id=target_id,
            summary=summary,
            details=details,
            status=status,
            duration_ms=duration_ms,
            dev_mode=_get_dev_mode(),
            **kwargs
        )


class LogAccessService:
    """访问日志服务"""
    
    @classmethod
    def create(
        cls,
        request,
        response,
        duration_ms: int,
        **kwargs
    ) -> Optional[LogAccess]:
        """创建访问日志"""
        from apps.audit.core.context import AuditContextManager
        ctx = AuditContextManager.get_current()
        
        # 获取用户
        user = None
        if hasattr(request, 'user') and request.user.is_authenticated:
            user = request.user.username
        
        return LogAccess.objects.create(
            trace_id=ctx.trace_id,
            user=user,
            ip=LogErrorService._get_client_ip(request) or '0.0.0.0',
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:512],
            method=request.method,
            path=request.path,
            query_string=request.GET.urlencode()[:1024] if request.GET else None,
            request_size=len(request.body) if hasattr(request, 'body') else None,
            status_code=response.status_code,
            response_size=len(response.content) if hasattr(response, 'content') else None,
            response_time_ms=duration_ms,
            dev_mode=_get_dev_mode(),
            **kwargs
        )
