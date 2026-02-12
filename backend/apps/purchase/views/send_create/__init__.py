"""
新建发货单视图模块
包含：页面渲染、可用性检查、模板生成、验证、提交
"""

# 页面
from .page import send_add_page

# 可用性检查
from .availability import check_send_availability_api

# 模板相关
from .template import (
    generate_template_data_api,
    download_send_template_api,
    validate_send_excel_api
)

# 查询API
from .query import (
    check_logistic_num_exists_api,
    get_po_list_for_send_api,
    get_po_items_for_send_api
)

# 验证API
from .validation import (
    validate_send_logistics_api,
    validate_send_items_api
)

# 提交API
from .submit import submit_send_api

__all__ = [
    'send_add_page',
    'check_send_availability_api',
    'generate_template_data_api',
    'download_send_template_api',
    'validate_send_excel_api',
    'check_logistic_num_exists_api',
    'get_po_list_for_send_api',
    'get_po_items_for_send_api',
    'validate_send_logistics_api',
    'validate_send_items_api',
    'submit_send_api',
]
