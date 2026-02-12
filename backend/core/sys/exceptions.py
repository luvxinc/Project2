# File: backend/core/sys/exceptions.py
"""
# ==============================================================================
# 模块名称: 系统异常定义 (System Exceptions)
# ==============================================================================
#
# [Purpose / 用途]
# 定义系统内通用的业务异常基类，用于被 GlobalExceptionHandler 捕获并转换为 StandardResponse。
#
# [Architecture / 架构]
# - AppException (Base)
#   - BizRuleError (业务规则冲突)
#   - AuthError (认证/权限失败)
#   - ResourceNotFoundError (资源不存在)
#   - ValidationError (数据校验失败)
#
# ==============================================================================
"""

class AppException(Exception):
    """通用应用异常基类"""
    def __init__(self, message: str, code: int = 400, details: any = None):
        super().__init__(message)
        self.message = message
        self.code = code
        self.details = details

class BizRuleError(AppException):
    """业务规则错误 (如: 库存不足, 状态不可变)"""
    def __init__(self, message: str, details: any = None):
        super().__init__(message, code=400, details=details)

class AuthError(AppException):
    """认证与权限错误"""
    def __init__(self, message: str = "Unauthorized", code: int = 401):
        super().__init__(message, code=code)

class PermissionDeniedError(AuthError):
    def __init__(self, message: str = "Permission Denied"):
        super().__init__(message, code=403)

class ResourceNotFoundError(AppException):
    """资源不存在"""
    def __init__(self, message: str = "Resource not found"):
        super().__init__(message, code=404)

class AppValidationError(AppException):
    """数据校验错误"""
    def __init__(self, message: str = "Validation Failed", details: any = None):
        super().__init__(message, code=422, details=details)
