from django import template
from django.utils.safestring import mark_safe

# [Fix] 延迟导入: 避免 Django autoreloader 初始化时触发 SQLAlchemy 循环导入
# SecurityPolicyManager 在函数内部导入，而非模块顶层

register = template.Library()


@register.simple_tag
def security_inputs(action_key):
    """
    根据 Action Key 自动渲染所需的密码输入框。
    使用方法: {% security_inputs 'btn_purge_logs' %}
    """
    # [Fix] 延迟导入
    from backend.core.services.security.policy_manager import SecurityPolicyManager
    import random
    import string
    
    tokens = SecurityPolicyManager.get_required_tokens(action_key)
    if not tokens:
        # Fallback for testing or if policy is empty but tag is present
        # Or better, just return empty string as it means "No Check Required"
        return ""

    # Apple Style Security Zone (Glass/Clean)
    html = '<div class="security-gate-zone p-4 mb-3 rounded-3 border border-secondary border-opacity-25" style="background: rgba(255, 255, 255, 0.02);">'
    html += '<div class="text-warning small text-uppercase fw-bold ls-1 mb-3 text-center"><i class="fa-solid fa-shield-halved me-2"></i>安全验证 / Security Check</div>'

    # 定义顺序: User -> L1 -> L2 -> L3 -> L4
    order = ["user", "query", "modify", "db", "system"]

    # 排序 tokens
    sorted_tokens = sorted(tokens, key=lambda x: order.index(x) if x in order else 99)

    for token in sorted_tokens:
        meta = SecurityPolicyManager.TOKEN_MAP.get(token)
        if not meta: continue

        field_name = meta['code_key']
        label = meta['label']
        placeholder = f"请输入 {label}"
        
        # 生成随机 ID 防止浏览器记住
        rand_suffix = ''.join(random.choices(string.ascii_lowercase, k=4))
        input_id = f"sec_{field_name}_{rand_suffix}"

        html += f"""
        <div class="mb-3">
            <input type="password" 
                   id="{input_id}"
                   name="{field_name}" 
                   class="form-control bg-dark border-secondary text-white rounded-pill px-3 text-center shadow-sm" 
                   style="font-size: 1.1rem; letter-spacing: 2px;"
                   placeholder="{placeholder}" 
                   required 
                   autocomplete="new-password"
                   autocorrect="off"
                   autocapitalize="off"
                   spellcheck="false"
                   data-lpignore="true"
                   data-form-type="other">
        </div>
        """

    html += '</div>'
    return mark_safe(html)


@register.filter
def has_key(mapping, key):
    if not mapping or not key: return False
    return key in mapping

@register.simple_tag
def check_attr(key, data):
    if data and key in data:
        return "checked"
    return ""


# =============================================================================
# Safe Comparison Filters (Prevent TemplateSyntaxError with ==)
# =============================================================================
# Usage: {{ value|eq:'target' }} returns True/False
# Usage in if: {% if item.type|eq:'modal' %}...{% endif %}
# This avoids the common Django error: "Could not parse the remainder: '=='xxx'"

@register.filter
def eq(value, arg):
    """
    Safe equality check filter.
    Usage: {{ value|eq:'target' }} -> True/False
    
    Example:
        {% if item.action_type|eq:'modal' %}
            data-bs-toggle="modal"
        {% endif %}
    """
    return value == arg

@register.filter  
def neq(value, arg):
    """
    Safe not-equal check filter.
    Usage: {{ value|neq:'target' }} -> True/False
    """
    return value != arg

@register.filter
def is_type(value, type_name):
    """
    Check if action_type matches a specific type.
    Convenience alias for common hub card checks.
    Usage: {% if item|is_type:'modal' %}
    """
    if hasattr(value, 'get'):
        return value.get('action_type') == type_name
    if hasattr(value, 'action_type'):
        return value.action_type == type_name
    return False