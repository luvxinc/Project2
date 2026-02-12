"""
发货单管理 - 货物明细修改API

[P0-1 拆分后的模块入口]
原 edit_items.py (959行) 已拆分为:
- utils.py: 工具函数 (~90行)
- query.py: 查询API (~500行)  
- submit.py: 提交API (~350行)
"""
# 导出工具函数
from .utils import (
    get_fully_shipped_po_nums,
    get_item_diff,
)

# 导出查询API
from .query import (
    get_items_for_edit_api,
    get_available_po_list_api,
    get_available_sku_list_api,
    get_available_price_list_api,
)

# 导出提交API
from .submit import (
    submit_items_modification_api,
)

# 保持向后兼容的别名（原内部函数名使用下划线前缀）
_get_fully_shipped_po_nums = get_fully_shipped_po_nums
_get_item_diff = get_item_diff

__all__ = [
    # 工具函数
    'get_fully_shipped_po_nums',
    'get_item_diff',
    '_get_fully_shipped_po_nums',  # 向后兼容
    '_get_item_diff',  # 向后兼容
    # 查询API
    'get_items_for_edit_api',
    'get_available_po_list_api',
    'get_available_sku_list_api',
    'get_available_price_list_api',
    # 提交API
    'submit_items_modification_api',
]
