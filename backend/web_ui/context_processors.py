# File: backend/web_ui/context_processors.py
"""
文件说明: 全局上下文处理器 (Global Context Processor)
主要功能:
1. 在每个 Template 渲染前执行。
2. 读取 modules.json，生成侧边栏菜单结构 (sidebar_menu)。
3. [V3.0] 支持三层结构 (modules → submodules → tabs)。
4. 如果用户有任何 submodule 或 tab 权限，自动授予模块访问权。
"""

from django.conf import settings
from backend.common.settings import settings as app_settings
from core.services.auth.service import AuthService

# 图标映射表
ICON_MAP = {
    "home": "fa-house",
    "sales": "fa-cart-shopping",
    "purchase": "fa-truck",
    "inventory": "fa-boxes-stacked",
    "finance": "fa-coins",
    "products": "fa-tags",
    "db_admin": "fa-server",
    "user_admin": "fa-users-gear",
    "audit": "fa-shield-halved",
}


def global_sidebar_context(request):
    """
    [核心逻辑] 生成全局侧边栏菜单
    返回变量: {{ sidebar_menu }}
    
    [V3.0] 三层结构支持：
    - modules → submodules → tabs
    - 检查 module.xxx, module.xxx.submodule, module.xxx.submodule.tab 权限
    """
    all_modules = app_settings.load_modules_config()
    if not all_modules:
        return {"sidebar_menu": []}

    user = request.user
    visible_modules = []

    user_perms = {}
    is_super = False
    is_staff = False

    if user.is_authenticated:
        is_super = user.is_superuser
        is_staff = user.is_staff
        if not is_super:
            user_perms = AuthService.get_permissions(user.username)

    for mod in all_modules:
        if not mod.get("enabled", True):
            continue

        perm_key = mod.get("permission", "public")
        has_access = False

        if perm_key == "public":
            has_access = True
        elif perm_key == "admin_only":
            has_access = (is_super or is_staff)
        else:
            if is_super:
                has_access = True
            elif perm_key in user_perms:
                has_access = True
            else:
                # [V3.0] 检查 submodules 和 tabs 权限
                submodules = mod.get("submodules", [])
                for sub in submodules:
                    sub_perm = sub.get("permission")
                    if sub_perm and sub_perm in user_perms:
                        has_access = True
                        break
                    # 检查 tabs
                    tabs = sub.get("tabs", [])
                    for tab in tabs:
                        tab_perm = tab.get("permission")
                        if tab_perm and tab_perm in user_perms:
                            has_access = True
                            break
                    if has_access:
                        break
                
                # 向后兼容：检查旧的 tabs 结构
                if not has_access:
                    tabs = mod.get("tabs", [])
                    for tab in tabs:
                        tab_perm = tab.get("permission")
                        if tab_perm and tab_perm in user_perms:
                            has_access = True
                            break

        mod_key = mod.get("key", "unknown")
        icon_class = mod.get("icon") or ICON_MAP.get(mod_key, "fa-circle")

        # 获取当前语言 - 使用 Django 的 LANGUAGE_CODE
        lang_code = getattr(request, 'LANGUAGE_CODE', 'zh-hans')
        is_english = lang_code.startswith('en')
        mod_name = mod.get("name_en") if is_english else mod.get("name", "Unknown")

        menu_item = {
            "key": mod_key,
            "name": mod_name,
            "icon": icon_class,
            "path": mod.get("path", ""),
            "url": f"/dashboard/{mod_key}/" if mod_key != 'home' else "/dashboard/",
            "has_access": has_access,
        }

        if mod_key == 'user_admin':
            menu_item['url'] = '/dashboard/user_admin/'


        visible_modules.append(menu_item)

    current_role_name = "Guest"
    current_role_class = "text-white-50"
    
    if is_super:
        current_role_name = "Super Admin"
        current_role_class = "text-warning fw-bold"
    elif is_staff:
        current_role_name = "Administrator"
        current_role_class = "text-info"
    elif user.is_authenticated:
        current_role_name = "User"
        current_role_class = "text-white-50"

    return {
        "sidebar_menu": visible_modules,
        "current_user_role": current_role_name,
        "current_role_class": current_role_class
    }