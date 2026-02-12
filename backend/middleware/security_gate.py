# File: backend/middleware/security_gate.py
from django.http import JsonResponse
import logging

logger = logging.getLogger('django.request')


class SecurityGateMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response
        self.whitelist = [
            '/api/sys/config/',
            '/api/health/',
            '/admin/',
            '/login/',
            '/logout/',
            '/static/',
            '/dashboard/',
            # [Fix] 允许前端错误上报
            '/api/sys/log_error/',
            # [Fix 2026-01-11] 日志系统有自己的密码验证
            '/log/',
            # [Fix] 允许 eBay 集成业务操作
            '/ebay/',
        ]

    def __call__(self, request):
        # 1. 路径白名单检查
        for path in self.whitelist:
            if request.path.startswith(path):
                return self.get_response(request)

        # 2. 读操作放行
        if request.method in ['GET', 'HEAD', 'OPTIONS']:
            return self.get_response(request)

        # 3. 写操作强制检查
        security_token = request.headers.get('X-Security-Code')

        # 尝试获取 valid_codes
        try:
            from backend.common.settings import settings as app_settings
            valid_codes = [
                app_settings.SEC_CODE_MODIFY,
                app_settings.SEC_CODE_DB,
                app_settings.SEC_CODE_SYSTEM
            ]
        except ImportError:
            valid_codes = []

        if not security_token or security_token not in valid_codes:
            logger.warning(f"Security Gate Blocked: {request.method} {request.path}")
            return JsonResponse({
                "status": "forbidden",
                "message": "Security Gate: Invalid Security Code"
            }, status=403)

        return self.get_response(request)