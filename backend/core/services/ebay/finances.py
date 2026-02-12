# File: backend/core/services/ebay/finances.py
"""
# ==============================================================================
# 模块名称: eBay Finances API 服务 (财务数据)
# ==============================================================================
#
# [Purpose / 用途]
# 封装 eBay Finances API，用于获取财务数据（收益、费用、付款）。
# 替代原有的 Order Earnings Report CSV 上传流程。
#
# [API Reference]
# https://developer.ebay.com/api-docs/sell/finances/overview.html
#
# [Key Endpoints]
# - GET /sell/finances/v1/transaction - 获取交易明细
# - GET /sell/finances/v1/payout - 获取付款记录
# - GET /sell/finances/v1/payout_summary - 获取付款汇总
#
# ==============================================================================
"""

from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any

from core.services.base import BaseService
from .client import EbayAPIClient
from .config import EbayConfig


class FinancesService(BaseService):
    """
    eBay Finances API 服务
    
    用于获取销售收益、eBay 费用、付款等财务数据。
    """
    
    # API 版本
    API_VERSION = "v1"
    BASE_ENDPOINT = f"/sell/finances/{API_VERSION}"
    
    def __init__(self, config: Optional[EbayConfig] = None):
        super().__init__()
        self.client = EbayAPIClient(config)
    
    def get_transactions(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        transaction_type: Optional[str] = None,
        limit: int = 200,
        max_items: Optional[int] = None,
    ) -> Dict[str, Any]:
        """
        获取财务交易明细
        
        Args:
            start_date: 开始日期 (默认 30 天前)
            end_date: 结束日期 (默认 今天)
            transaction_type: 交易类型筛选
                - SALE: 销售
                - REFUND: 退款
                - CREDIT: 信用
                - DISPUTE: 争议
                - SHIPPING_LABEL: 运输标签
                - NON_SALE_CHARGE: 非销售费用
            limit: 每页数量
            max_items: 最大获取数量
            
        Returns:
            {
                "success": bool,
                "transactions": List[Dict],
                "total": int,
            }
        """
        self.log(f"💰 Fetching financial transactions...")
        
        # 默认日期范围
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()
        
        # 构建筛选条件
        filters = []
        
        # 交易日期范围
        date_filter = (
            f"transactionDate:[{start_date.strftime('%Y-%m-%dT00:00:00.000Z')}.."
            f"{end_date.strftime('%Y-%m-%dT23:59:59.999Z')}]"
        )
        filters.append(date_filter)
        
        # 交易类型
        if transaction_type:
            filters.append(f"transactionType:{{{transaction_type}}}")
        
        params = {
            "filter": ",".join(filters),
        }
        
        try:
            transactions = self.client.get_paginated(
                endpoint=f"{self.BASE_ENDPOINT}/transaction",
                params=params,
                limit=limit,
                max_items=max_items,
            )
            
            self.log(f"✅ Fetched {len(transactions)} financial transactions")
            
            return {
                "success": True,
                "transactions": transactions,
                "total": len(transactions),
                "date_range": {
                    "start": start_date.isoformat(),
                    "end": end_date.isoformat(),
                }
            }
        
        except Exception as e:
            self.log(f"❌ Failed to fetch transactions: {e}", level="error")
            return {"success": False, "transactions": [], "error": str(e)}
    
    def get_payouts(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        payout_status: Optional[str] = None,
        limit: int = 200,
    ) -> Dict[str, Any]:
        """
        获取付款记录
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            payout_status: 付款状态 (INITIATED, SUCCEEDED, RETRYABLE_FAILED, TERMINAL_FAILED)
            limit: 每页数量
            
        Returns:
            付款记录列表
        """
        self.log(f"💵 Fetching payouts...")
        
        if not start_date:
            start_date = datetime.now() - timedelta(days=90)
        if not end_date:
            end_date = datetime.now()
        
        filters = []
        date_filter = (
            f"payoutDate:[{start_date.strftime('%Y-%m-%dT00:00:00.000Z')}.."
            f"{end_date.strftime('%Y-%m-%dT23:59:59.999Z')}]"
        )
        filters.append(date_filter)
        
        if payout_status:
            filters.append(f"payoutStatus:{{{payout_status}}}")
        
        params = {"filter": ",".join(filters)}
        
        try:
            payouts = self.client.get_paginated(
                endpoint=f"{self.BASE_ENDPOINT}/payout",
                params=params,
                limit=limit,
            )
            
            self.log(f"✅ Fetched {len(payouts)} payouts")
            return {"success": True, "payouts": payouts, "total": len(payouts)}
        
        except Exception as e:
            self.log(f"❌ Failed to fetch payouts: {e}", level="error")
            return {"success": False, "payouts": [], "error": str(e)}
    
    def get_payout_summary(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        获取付款汇总
        
        Returns:
            {
                "totalMarketplaceFee": {"value": X, "currency": "USD"},
                "adjustmentAmount": {...},
                "balanceTransferAmount": {...},
                ...
            }
        """
        self.log(f"📊 Fetching payout summary...")
        
        if not start_date:
            start_date = datetime.now() - timedelta(days=30)
        if not end_date:
            end_date = datetime.now()
        
        filters = []
        date_filter = (
            f"payoutDate:[{start_date.strftime('%Y-%m-%dT00:00:00.000Z')}.."
            f"{end_date.strftime('%Y-%m-%dT23:59:59.999Z')}]"
        )
        filters.append(date_filter)
        
        params = {"filter": ",".join(filters)}
        
        result = self.client.get(f"{self.BASE_ENDPOINT}/payout_summary", params=params)
        
        if result["success"]:
            return {"success": True, "summary": result["data"]}
        else:
            return {"success": False, "error": result.get("error")}
    
    def transform_to_earning_format(self, transactions: List[Dict]) -> List[Dict]:
        """
        将 eBay Finances API 数据转换为系统 Order Earning 表格式
        
        Args:
            transactions: eBay Finances API 返回的交易列表
            
        Returns:
            符合 Data_Order_Earning 表结构的记录列表
        """
        earnings = []
        
        for txn in transactions:
            try:
                # 交易基本信息
                txn_id = txn.get("transactionId", "")
                txn_date = txn.get("transactionDate", "")
                txn_type = txn.get("transactionType", "")
                
                # 订单关联
                order_id = txn.get("orderId", "")
                
                # 金额信息
                amount = txn.get("amount", {})
                amount_value = float(amount.get("value", 0))
                currency = amount.get("currency", "USD")
                
                # 费用明细
                total_fee = txn.get("totalFeeBasisAmount", {})
                total_fee_value = float(total_fee.get("value", 0))
                
                # 付款信息
                payout_id = txn.get("payoutId", "")
                
                # 订单行项 (如有)
                order_line_items = txn.get("orderLineItems", [])
                
                if order_line_items:
                    # 多行项订单：为每个行项创建一条记录
                    for item in order_line_items:
                        earning = {
                            "transaction_id": txn_id,
                            "transaction_date": txn_date[:10] if txn_date else "",
                            "transaction_type": txn_type,
                            "order_id": order_id,
                            "item_id": item.get("legacyItemId", ""),
                            "line_item_id": item.get("lineItemId", ""),
                            "sku": item.get("sku", ""),
                            
                            # 金额
                            "gross_amount": amount_value,
                            "total_fee": total_fee_value,
                            "net_amount": amount_value - total_fee_value,
                            "currency": currency,
                            
                            # 费用细分 (如 API 提供)
                            "final_value_fee": self._extract_fee(txn, "FINAL_VALUE_FEE"),
                            "fixed_fee": self._extract_fee(txn, "FIXED_FEE"),
                            "international_fee": self._extract_fee(txn, "INTERNATIONAL_FEE"),
                            
                            # 付款关联
                            "payout_id": payout_id,
                            
                            # 来源标记
                            "source": "ebay_api",
                        }
                        earnings.append(earning)
                else:
                    # 非订单交易 (如费用、调整)
                    earning = {
                        "transaction_id": txn_id,
                        "transaction_date": txn_date[:10] if txn_date else "",
                        "transaction_type": txn_type,
                        "order_id": order_id,
                        "item_id": "",
                        "line_item_id": "",
                        "sku": "",
                        "gross_amount": amount_value,
                        "total_fee": total_fee_value,
                        "net_amount": amount_value - total_fee_value,
                        "currency": currency,
                        "payout_id": payout_id,
                        "source": "ebay_api",
                    }
                    earnings.append(earning)
            
            except Exception as e:
                self.log(f"⚠️ Failed to transform transaction {txn.get('transactionId')}: {e}", level="warning")
                continue
        
        self.log(f"✅ Transformed {len(earnings)} earnings from {len(transactions)} transactions")
        return earnings
    
    def _extract_fee(self, transaction: Dict, fee_type: str) -> float:
        """从交易中提取特定类型的费用"""
        marketplace_fees = transaction.get("marketplaceFees", [])
        for fee in marketplace_fees:
            if fee.get("feeType") == fee_type:
                return float(fee.get("amount", {}).get("value", 0))
        return 0.0
