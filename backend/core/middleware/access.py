# File: backend/core/middleware/access.py
"""
访问日志中间件
自动记录 HTTP 请求到 log_access（带智能过滤）
"""
import time
from django.conf import settings


class AccessLogMiddleware:
    """
    访问日志中间件
    
    功能:
    1. 自动记录每个请求的访问信息
    2. 智能过滤，只记录有价值的请求
    3. 记录响应时间用于性能分析
    """
    
    # 不记录的路径前缀
    IGNORED_PATH_PREFIXES = (
        '/static/',
        '/media/',
        '/favicon.ico',
        '/__debug__/',
        '/health',
        '/admin/jsi18n/',
    )
    
    # 不记录的路径后缀
    IGNORED_PATH_SUFFIXES = (
        '.css',
        '.js',
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.ico',
        '.woff',
        '.woff2',
        '.ttf',
        '.map',
    )
    
    # 轮询接口（不记录）
    POLLING_PATHS = (
        '/api/poll/',
        '/api/heartbeat/',
        '/api/check/',
    )
    
    def __init__(self, get_response):
        self.get_response = get_response
    
    def __call__(self, request):
        # 记录开始时间
        start_time = time.time()
        
        # 执行请求
        response = self.get_response(request)
        
        # 计算响应时间
        duration_ms = int((time.time() - start_time) * 1000)
        
        # 判断是否需要记录
        if self._should_log(request, response, duration_ms):
            self._log_access(request, response, duration_ms)
        
        return response
    
    def _should_log(self, request, response, duration_ms: int) -> bool:
        """判断是否需要记录此请求"""
        path = request.path
        
        # 1. 排除静态资源和特殊路径
        if path.startswith(self.IGNORED_PATH_PREFIXES):
            return False
        
        if any(path.endswith(suffix) for suffix in self.IGNORED_PATH_SUFFIXES):
            return False
        
        # 2. 排除轮询接口
        if any(path.startswith(polling) for polling in self.POLLING_PATHS):
            return False
        
        # 3. 成功的 GET 请求不记录（减少噪音）
        if request.method == 'GET' and response.status_code == 200:
            # 除非是慢请求
            if duration_ms < 3000:
                return False
        
        # 4. 以下情况必须记录
        # - 写操作
        if request.method in ('POST', 'PUT', 'DELETE', 'PATCH'):
            return True
        
        # - 错误响应
        if response.status_code >= 400:
            return True
        
        # - 重定向（可能是登录）
        if response.status_code in (301, 302, 303, 307, 308):
            return True
        
        # - 慢请求（超过 3 秒）
        if duration_ms >= 3000:
            return True
        
        # - 登录相关路径
        if any(keyword in path.lower() for keyword in ('login', 'logout', 'auth')):
            return True
        
        return False
    
    def _log_access(self, request, response, duration_ms: int):
        """记录访问日志"""
        try:
            from apps.log.services import LogAccessService
            
            LogAccessService.create(
                request=request,
                response=response,
                duration_ms=duration_ms
            )
        except Exception as e:
            # 日志失败不应影响主业务
            if settings.DEBUG:
                print(f"[AccessLogMiddleware] 记录失败: {e}")
