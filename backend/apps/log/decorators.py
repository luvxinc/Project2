# File: backend/apps/log/decorators.py
"""
日志装饰器 - 用于标记需要记录的操作
"""
from functools import wraps
import time


def log_action(action: str, module: str = 'system', get_target=None):
    """
    业务操作日志装饰器
    
    用法:
        @log_action('CREATE_PO', module='purchase', get_target=lambda r: r.POST.get('po_num'))
        def create_po_api(request):
            ...
    
    参数:
        action: 操作名称 (如 CREATE_PO, DELETE_USER)
        module: 模块名称 (如 purchase, finance)
        get_target: 获取目标 ID 的函数，接收 request 返回 target_id
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            start_time = time.time()
            
            # 执行原函数
            response = view_func(request, *args, **kwargs)
            
            # 计算耗时
            duration_ms = int((time.time() - start_time) * 1000)
            
            # 记录日志
            try:
                from apps.log.services import LogBusinessService
                
                # 获取目标 ID
                target_id = None
                if get_target:
                    try:
                        target_id = get_target(request)
                    except:
                        pass
                
                # 判断状态
                status = 'SUCCESS' if response.status_code < 400 else 'FAILED'
                
                # 生成摘要
                user = request.user.username if hasattr(request, 'user') and request.user.is_authenticated else 'Anonymous'
                summary = f"{user} 执行 {action}"
                if target_id:
                    summary += f": {target_id}"
                
                LogBusinessService.create(
                    action=action,
                    summary=summary,
                    module=module,
                    target_id=str(target_id) if target_id else None,
                    status=status,
                    duration_ms=duration_ms,
                )
            except Exception as e:
                # 日志失败不影响业务
                pass
            
            return response
        return wrapper
    return decorator


def audit_action(action: str, action_category: str = 'DATA', risk_level: str = 'MEDIUM', get_target=None):
    """
    安全审计日志装饰器
    
    用法:
        @audit_action('DELETE_USER', action_category='ADMIN', risk_level='HIGH')
        def delete_user_api(request, user_id):
            ...
    
    参数:
        action: 操作名称
        action_category: 分类 (AUTH/AUTHZ/DATA/CONFIG/ADMIN)
        risk_level: 风险等级 (CRITICAL/HIGH/MEDIUM/LOW)
        get_target: 获取目标信息的函数
    """
    def decorator(view_func):
        @wraps(view_func)
        def wrapper(request, *args, **kwargs):
            # 执行原函数
            response = view_func(request, *args, **kwargs)
            
            # 记录审计日志
            try:
                from apps.log.services import LogAuditService
                
                # 获取目标
                target_id = None
                target_name = None
                if get_target:
                    try:
                        result = get_target(request, *args, **kwargs)
                        if isinstance(result, tuple):
                            target_id, target_name = result
                        else:
                            target_id = result
                    except:
                        pass
                
                # 判断结果
                if response.status_code < 400:
                    result = 'SUCCESS'
                elif response.status_code == 403:
                    result = 'DENIED'
                else:
                    result = 'FAILED'
                
                # 获取用户信息
                user = request.user if hasattr(request, 'user') and request.user.is_authenticated else None
                
                LogAuditService.create(
                    action=action,
                    action_category=action_category,
                    actor_username=user.username if user else 'Anonymous',
                    actor_id=user.pk if user else None,
                    target_id=str(target_id) if target_id else None,
                    target_name=target_name,
                    result=result,
                    risk_level=risk_level,
                )
            except Exception as e:
                pass
            
            return response
        return wrapper
    return decorator
