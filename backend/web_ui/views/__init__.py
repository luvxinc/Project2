# File: backend/web_ui/views/__init__.py
from .auth import login_view, logout_view
from .dashboard import dashboard_home

# [Deleted] User Admin has been moved to apps.user_admin
# from .user_admin import ... (Removed)

from .etl import (
    etl_transaction,
    etl_upload,
    etl_parse
)

# [Fix] 必须同时导出 audit_dashboard 和 audit_tab_content
# 注意：如果您之前也把 audit.py 删了，这里也需要去掉。
# 但根据刚才的步骤，我们主要迁移了 user_admin。
from .audit import audit_dashboard, audit_tab_content