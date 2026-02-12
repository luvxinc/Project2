# File: backend/core/services/ebay/fulfillment.py
"""
# ==============================================================================
# 模块名称: eBay Fulfillment API 服务 (订单管理)
# ==============================================================================
#
# [Purpose / 用途]
# 封装 eBay Fulfillment API，用于获取订单信息。
# 替代原有的 Transaction Report CSV 上传流程。
#
# [API Reference]
# https://developer.ebay.com/api-docs/sell/fulfillment/overview.html
#
# [Key Endpoints]
# - GET /sell/fulfillment/v1/order - 获取订单列表
# - GET /sell/fulfillment/v1/order/{orderId} - 获取订单详情
#
# ==============================================================================
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from core.services.base import BaseService
from .client import EbayAPIClient
from .config import EbayConfig


class FulfillmentService(BaseService):
    """
    eBay Fulfillment API 服务
    
    用于获取和管理 eBay 订单数据。
    """
    
    # API 版本
    API_VERSION = "v1"
    BASE_ENDPOINT = f"/sell/fulfillment/{API_VERSION}"
    
    def __init__(self, config: Optional[EbayConfig] = None):
        super().__init__()
        self.client = EbayAPIClient(config)
    
    def get_orders(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        order_status: Optional[str] = None,
        limit: int = 200,
        max_items: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        获取订单列表
        
        Args:
            start_date: 开始日期 (默认 30 天前)
            end_date: 结束日期 (默认 今天)
            order_status: 订单状态筛选 (ACTIVE, COMPLETED, CANCELLED 等)
            limit: 每页数量
            max_items: 最大获取数量
            
        Returns:
            {
                "success": bool,
                "orders": List[Dict],  # 订单列表
                "total": int,
                "error": str (if failed)
            }
        """
        self.log(f"📦 Fetching orders...")
        
        # 默认日期范围: 过去 30 天
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()
        
        # 构建筛选条件 (eBay 使用特殊的 filter 语法)
        filters = []
        
        # 创建时间范围
        creation_filter = (
            f"creationdate:[{start_date.strftime('%Y-%m-%dT00:00:00.000Z')}.."
            f"{end_date.strftime('%Y-%m-%dT23:59:59.999Z')}]"
        )
        filters.append(creation_filter)
        
        # 订单状态
        if order_status:
            filters.append(f"orderfulfillmentstatus:{{{order_status}}}")
        
        params = {
            "filter": ",".join(filters),
        }
        
        try:
            orders = self.client.get_paginated(
                endpoint=f"{self.BASE_ENDPOINT}/order",
                params=params,
                limit=limit,
                max_items=max_items,
            )
            
            self.log(f"✅ Fetched {len(orders)} orders")
            
            return {
                "success": True,
                "orders": orders,
                "total": len(orders),
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                }
            }
        
        except Exception as e:
            self.log(f"❌ Failed to fetch orders: {e}", level="error")
            return {"success": False, "orders": [], "total": 0, "error": str(e)}
    
    def get_order_detail(self, order_id: str) -> Dict[str, Any]:
        """
        获取单个订单详情
        
        Args:
            order_id: eBay 订单 ID
            
        Returns:
            订单详情 或 错误信息
        """
        self.log(f"📦 Fetching order detail: {order_id}")
        
        result = self.client.get(f"{self.BASE_ENDPOINT}/order/{order_id}")
        
        if result["success"]:
            return {"success": True, "order": result["data"]}
        else:
            return {"success": False, "error": result.get("error")}
    
    def transform_to_transaction_format(self, orders: List[Dict]) -> List[Dict]:
        """
        将 eBay API 订单数据转换为系统 Transaction 表格式
        
        这样可以复用现有的 ETL 流程。
        
        Args:
            orders: eBay API 返回的订单列表
            
        Returns:
            符合 Data_Transaction 表结构的记录列表
        """
        transactions = []
        
        for order in orders:
            try:
                # 提取订单基本信息
                order_id = order.get("orderId", "")
                creation_date = order.get("creationDate", "")
                
                # 提取买家信息
                buyer = order.get("buyer", {})
                buyer_username = buyer.get("username", "")
                
                # 提取配送信息
                fulfillment = order.get("fulfillmentStartInstructions", [{}])[0]
                shipping = fulfillment.get("shippingStep", {}).get("shipTo", {})
                
                ship_city = shipping.get("contactAddress", {}).get("city", "")
                ship_state = shipping.get("contactAddress", {}).get("stateOrProvince", "")
                ship_zip = shipping.get("contactAddress", {}).get("postalCode", "")
                ship_country = shipping.get("contactAddress", {}).get("countryCode", "")
                
                # 提取交易金额
                pricing = order.get("pricingSummary", {})
                total_amount = float(pricing.get("total", {}).get("value", 0))
                
                # 提取每个订单项
                line_items = order.get("lineItems", [])
                
                for item in line_items:
                    item_id = item.get("legacyItemId", "")
                    item_title = item.get("title", "")
                    sku = item.get("sku", "")
                    quantity = item.get("quantity", 1)
                    
                    item_price = float(item.get("lineItemCost", {}).get("value", 0))
                    
                    transaction = {
                        # === 核心识别字段 ===
                        "order_id": order_id,
                        "item_id": item_id,
                        "sku": sku,
                        
                        # === 时间信息 ===
                        "transaction_date": creation_date[:10] if creation_date else "",
                        
                        # === 商品信息 ===
                        "title": item_title,
                        "quantity": quantity,
                        "item_price": item_price,
                        
                        # === 买家信息 ===
                        "buyer_username": buyer_username,
                        
                        # === 配送信息 ===
                        "ship_city": ship_city,
                        "ship_state": ship_state,
                        "ship_zip": ship_zip,
                        "ship_country": ship_country,
                        
                        # === 金额汇总 ===
                        "order_total": total_amount,
                        
                        # === 数据来源标记 ===
                        "source": "ebay_api",
                    }
                    
                    transactions.append(transaction)
            
            except Exception as e:
                self.log(f"⚠️ Failed to transform order {order.get('orderId')}: {e}", level="warning")
                continue
        
        self.log(f"✅ Transformed {len(transactions)} transactions from {len(orders)} orders")
        return transactions
