"""
货物入库视图模块
包含：页面渲染、查询、验证、提交
"""

# 页面
from .page import receive_page

# 查询API
from .query import (
    get_pending_shipments_api,
    get_shipment_items_api,
)

# 提交API
from .submit import submit_receive_api

__all__ = [
    'receive_page',
    'get_pending_shipments_api',
    'get_shipment_items_api',
    'submit_receive_api',
]

