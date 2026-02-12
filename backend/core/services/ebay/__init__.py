# File: backend/core/services/ebay/__init__.py
"""
# ==============================================================================
# 模块名称: eBay API 集成服务 (eBay Integration Services)
# ==============================================================================
#
# [Purpose / 用途]
# 提供 eBay API 集成能力，包括：
# - OAuth 2.0 认证管理
# - Fulfillment API (订单数据)
# - Finances API (财务数据)
# - 数据同步调度
#
# [Architecture / 架构]
# - Layer: Infrastructure Layer (外部 API 集成)
# - Dependencies: requests, base64
# - Target APIs:
#   - Fulfillment API: 替代 Transaction Report CSV
#   - Finances API: 替代 Order Earnings Report CSV
#
# [Version / 版本]
# - V1.0.0: 初始实现 (Sandbox 环境)
# - Created: 2026-01-16
#
# ==============================================================================
"""

from .config import EbayConfig
from .oauth import EbayOAuthManager
from .client import EbayAPIClient
from .fulfillment import FulfillmentService
from .finances import FinancesService
from .sync import EbaySyncService

__all__ = [
    'EbayConfig',
    'EbayOAuthManager', 
    'EbayAPIClient',
    'FulfillmentService',
    'FinancesService',
    'EbaySyncService',
]
