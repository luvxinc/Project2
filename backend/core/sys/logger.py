# File: backend/core/sys/logger.py
"""
日志系统兼容层
保持旧 API 不变，内部转发到新的日志系统

注意：此文件为兼容层，新代码请直接使用:
- backend.apps.log.services.LogErrorService
- backend.apps.log.services.LogAuditService
- backend.apps.log.services.LogBusinessService
"""
import logging


class NullLoggerAdapter:
    """
    空日志适配器
    接收所有日志调用但不做任何事情
    实际日志由新的中间件和 Signal 系统自动处理
    """
    
    def __init__(self, *args, **kwargs):
        pass
    
    def info(self, msg, *args, **kwargs):
        """新系统自动记录业务日志，无需手动调用"""
        pass
    
    def warning(self, msg, *args, **kwargs):
        """新系统自动记录审计日志，无需手动调用"""
        pass
    
    def error(self, msg, *args, **kwargs):
        """新系统自动捕获异常，无需手动调用"""
        pass
    
    def debug(self, msg, *args, **kwargs):
        pass
    
    def critical(self, msg, *args, **kwargs):
        pass
    
    def exception(self, msg, *args, **kwargs):
        pass


# 兼容旧 API
_null_logger = NullLoggerAdapter()


def get_logger(name: str = None):
    """
    [兼容层] 返回空日志器
    新系统通过中间件自动记录
    """
    return _null_logger


def get_audit_logger():
    """
    [兼容层] 返回空日志器
    审计日志现由 Signal 和装饰器自动处理
    """
    return _null_logger


def get_error_logger():
    """
    [兼容层] 返回空日志器
    错误日志现由 GlobalExceptionMiddleware 自动捕获
    """
    return _null_logger


def init_logging():
    """
    [兼容层] 初始化函数（空操作）
    新系统不需要手动初始化
    """
    pass
