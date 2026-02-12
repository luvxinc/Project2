"""
新建采购订单视图模块
包含：页面渲染、供应商查询、策略查询、汇率查询、验证、提交、模板下载
"""

# 页面
from .page import po_add_page

# 供应商和策略查询
from .query import (
    supplier_list_for_po_api,
    supplier_strategy_for_po_api,
    get_exchange_rate_api
)

# 验证API
from .validation import (
    validate_po_params_api,
    validate_po_items_api
)

# 提交API
from .submit import submit_po_api

# 模板相关
from .template import (
    download_po_template_api,
    parse_po_excel_api,
    generate_prefilled_template_api
)

__all__ = [
    'po_add_page',
    'supplier_list_for_po_api',
    'supplier_strategy_for_po_api',
    'get_exchange_rate_api',
    'validate_po_params_api',
    'validate_po_items_api',
    'submit_po_api',
    'download_po_template_api',
    'parse_po_excel_api',
    'generate_prefilled_template_api',
]
