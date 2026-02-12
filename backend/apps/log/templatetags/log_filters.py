# File: backend/apps/log/templatetags/log_filters.py
"""
日志系统模板过滤器
提供敏感信息脱敏功能
"""
from django import template
import json

register = template.Library()


@register.filter(name='mask_sensitive')
def mask_sensitive(value, is_god_mode):
    """
    脱敏过滤器 - 对敏感字段进行脱敏
    用法: {{ log.ip|mask_sensitive:god_mode }}
    """
    if is_god_mode:
        return value
    if not value or value == '-':
        return '-'
    return '***'


@register.filter(name='mask_ip')
def mask_ip(ip, is_god_mode):
    """
    IP 脱敏 - 非 God Mode 时只显示前两段
    用法: {{ log.ip|mask_ip:god_mode }}
    """
    if is_god_mode:
        return ip
    if not ip or ip == '-':
        return '-'
    parts = ip.split('.')
    if len(parts) >= 2:
        return f"{parts[0]}.{parts[1]}.*.*"
    return '***'


@register.filter(name='mask_user')
def mask_user(user, is_god_mode):
    """
    用户名脱敏 - 非 God Mode 时只显示首字母
    用法: {{ log.user|mask_user:god_mode }}
    """
    if is_god_mode:
        return user
    if not user or user == '-':
        return '-'
    if len(user) >= 1:
        return f"{user[0]}***"
    return '***'


@register.filter(name='mask_path')
def mask_path(path, is_god_mode):
    """
    路径脱敏 - 隐藏服务器绝对路径
    用法: {{ log.request_path|mask_path:god_mode }}
    """
    if is_god_mode:
        return path
    if not path:
        return '-'
    # 替换常见的服务器路径
    result = path
    if '/Users/' in result:
        result = result.replace('/Users/', '/[HOME]/')
    if '/home/' in result:
        result = result.replace('/home/', '/[HOME]/')
    return result


@register.filter(name='mask_strict')
def mask_strict(value, is_god_mode):
    """
    严格脱敏 - 非 God Mode 时完全隐藏
    用于: request_body, local_variables, traceback, before_state, after_state
    用法: {{ log.request_body|mask_strict:god_mode }}
    """
    if is_god_mode:
        return value
    if not value or value == '-':
        return '-'
    return '[LOCKED - 需要解锁查看]'


@register.filter(name='mask_json')
def mask_json(value, is_god_mode):
    """
    JSON 脱敏 - 非 God Mode 时隐藏 JSON 内容
    用法: {{ log.details|mask_json:god_mode }}
    """
    if is_god_mode:
        if isinstance(value, (dict, list)):
            try:
                return json.dumps(value, ensure_ascii=False, indent=2)
            except:
                return str(value)
        return value
    if not value:
        return '-'
    return '[JSON - 需要解锁查看]'


@register.filter(name='mask_traceback')
def mask_traceback(value, is_god_mode):
    """
    堆栈脱敏 - 非 God Mode 时只显示摘要
    用法: {{ log.traceback_full|mask_traceback:god_mode }}
    """
    if is_god_mode:
        return value
    if not value:
        return '-'
    if len(value) > 100:
        return f"[堆栈信息 {len(value)} 字符 - 需要解锁查看]"
    return '[LOCKED]'
