# File: backend/apps/finance/views/flow/__init__.py
"""
定发收总预览 (Order Flow Overview)
Features:
- 订单完整生命周期概览
- 定金/货款/物流费用汇总
- 物流摊销计算
- 展开查看物流单详情
"""
from .api import flow_page, flow_list_api, flow_detail_api
