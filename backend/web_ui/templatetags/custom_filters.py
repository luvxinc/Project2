# File: backend/web_ui/templatetags/custom_filters.py (New File)
from django import template

register = template.Library()

@register.filter
def get_item(dictionary, key):
    """
    [New Filter] 允许 Django template 访问字典元素
    Example: {{ dictionary|get_item:key }}
    """
    if isinstance(dictionary, dict):
        return dictionary.get(key)
    # 如果不是字典，可能已经是原始字符串，直接返回
    return dictionary

@register.filter
def stringformat(value, format_string):
    """
    [New Filter] 安全地格式化字符串
    Example: {{ value|stringformat:"%s" }}
    """
    try:
        # 将 value 转换为字符串再格式化，避免 TypeError
        return format_string % str(value)
    except:
        return str(value)