# File: backend/core/services/ebay/sync.py
"""
# ==============================================================================
# 模块名称: eBay 数据同步服务 (Sync Service)
# ==============================================================================
#
# [Purpose / 用途]
# 自动同步 eBay 订单和财务数据到本地数据库。
# 将 API 数据转换为系统现有的表结构。
#
# [Sync Strategy / 同步策略]
# 1. 增量同步: 只拉取上次同步后的新数据
# 2. 全量同步: 拉取指定日期范围的所有数据
# 3. 冲突处理: 以 API 数据为准，更新本地记录
#
# ==============================================================================
"""

from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List

from core.services.base import BaseService
from .config import EbayConfig
from .fulfillment import FulfillmentService
from .finances import FinancesService


class EbaySyncService(BaseService):
    """
    eBay 数据同步服务
    
    统一管理订单和财务数据的同步任务。
    """
    
    def __init__(self, config: Optional[EbayConfig] = None):
        super().__init__()
        self.config = config or EbayConfig.get_sandbox_config()
        self.fulfillment = FulfillmentService(self.config)
        self.finances = FinancesService(self.config)
        
        # 同步状态
        self._last_sync_time: Optional[datetime] = None
        self._sync_in_progress = False
    
    def sync_orders(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        save_to_db: bool = True,
    ) -> Dict[str, Any]:
        """
        同步订单数据
        
        Args:
            start_date: 开始日期 (默认: 上次同步时间或30天前)
            end_date: 结束日期 (默认: 现在)
            save_to_db: 是否保存到数据库
            
        Returns:
            {
                "success": bool,
                "orders_fetched": int,
                "transactions_saved": int,
                "errors": List[str],
            }
        """
        if self._sync_in_progress:
            return {"success": False, "error": "Sync already in progress"}
        
        self._sync_in_progress = True
        self.log(f"🔄 Starting order sync...")
        self.start_timer()
        
        try:
            # 确定日期范围
            if not start_date:
                start_date = self._last_sync_time or (datetime.now() - timedelta(days=30))
            if not end_date:
                end_date = datetime.now()
            
            # 1. 获取订单
            result = self.fulfillment.get_orders(
                start_date=start_date,
                end_date=end_date,
            )
            
            if not result["success"]:
                return {
                    "success": False,
                    "error": result.get("error"),
                    "orders_fetched": 0,
                }
            
            orders = result["orders"]
            
            # 2. 转换为系统格式
            transactions = self.fulfillment.transform_to_transaction_format(orders)
            
            # 3. 保存到数据库
            saved_count = 0
            errors = []
            
            if save_to_db and transactions:
                save_result = self._save_transactions(transactions)
                saved_count = save_result.get("saved", 0)
                errors = save_result.get("errors", [])
            
            # 更新同步时间
            self._last_sync_time = end_date
            
            self.end_timer("Order Sync")
            
            return {
                "success": True,
                "orders_fetched": len(orders),
                "transactions_generated": len(transactions),
                "transactions_saved": saved_count,
                "date_range": result.get("date_range"),
                "errors": errors,
            }
        
        except Exception as e:
            self.log(f"❌ Order sync failed: {e}", level="error")
            return {"success": False, "error": str(e)}
        
        finally:
            self._sync_in_progress = False
    
    def sync_finances(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        save_to_db: bool = True,
    ) -> Dict[str, Any]:
        """
        同步财务数据
        
        Args:
            start_date: 开始日期
            end_date: 结束日期
            save_to_db: 是否保存到数据库
            
        Returns:
            同步结果
        """
        if self._sync_in_progress:
            return {"success": False, "error": "Sync already in progress"}
        
        self._sync_in_progress = True
        self.log(f"🔄 Starting financial sync...")
        self.start_timer()
        
        try:
            if not start_date:
                start_date = self._last_sync_time or (datetime.now() - timedelta(days=30))
            if not end_date:
                end_date = datetime.now()
            
            # 1. 获取财务交易
            result = self.finances.get_transactions(
                start_date=start_date,
                end_date=end_date,
            )
            
            if not result["success"]:
                return {"success": False, "error": result.get("error")}
            
            transactions = result["transactions"]
            
            # 2. 转换格式
            earnings = self.finances.transform_to_earning_format(transactions)
            
            # 3. 保存到数据库
            saved_count = 0
            errors = []
            
            if save_to_db and earnings:
                save_result = self._save_earnings(earnings)
                saved_count = save_result.get("saved", 0)
                errors = save_result.get("errors", [])
            
            self._last_sync_time = end_date
            self.end_timer("Financial Sync")
            
            return {
                "success": True,
                "transactions_fetched": len(transactions),
                "earnings_generated": len(earnings),
                "earnings_saved": saved_count,
                "date_range": result.get("date_range"),
                "errors": errors,
            }
        
        except Exception as e:
            self.log(f"❌ Financial sync failed: {e}", level="error")
            return {"success": False, "error": str(e)}
        
        finally:
            self._sync_in_progress = False
    
    def sync_all(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        完整同步 (订单 + 财务)
        
        Returns:
            综合同步结果
        """
        self.log(f"🚀 Starting full eBay sync...")
        
        order_result = self.sync_orders(start_date=start_date, end_date=end_date)
        finance_result = self.sync_finances(start_date=start_date, end_date=end_date)
        
        return {
            "success": order_result["success"] and finance_result["success"],
            "orders": order_result,
            "finances": finance_result,
            "timestamp": datetime.now().isoformat(),
        }
    
    def _save_transactions(self, transactions: List[Dict]) -> Dict[str, Any]:
        """
        保存交易数据到 Data_Transaction 表
        
        TODO: 实现实际的数据库写入逻辑
        """
        # 占位实现 - 需要与现有 ETL 模块集成
        self.log(f"💾 [PLACEHOLDER] Would save {len(transactions)} transactions to database")
        
        # TODO: 
        # from backend.core.services.etl.ingest import TransactionIngestor
        # ingestor = TransactionIngestor()
        # return ingestor.bulk_insert(transactions)
        
        return {"saved": 0, "errors": ["Database integration not implemented yet"]}
    
    def _save_earnings(self, earnings: List[Dict]) -> Dict[str, Any]:
        """
        保存收益数据到 Data_Order_Earning 表
        
        TODO: 实现实际的数据库写入逻辑
        """
        self.log(f"💾 [PLACEHOLDER] Would save {len(earnings)} earnings to database")
        
        # TODO:
        # from backend.core.services.etl.ingest import EarningIngestor
        # ingestor = EarningIngestor()
        # return ingestor.bulk_insert(earnings)
        
        return {"saved": 0, "errors": ["Database integration not implemented yet"]}
    
    def get_sync_status(self) -> Dict[str, Any]:
        """获取同步状态"""
        return {
            "is_configured": self.config.is_configured(),
            "has_valid_token": self.config.has_valid_token(),
            "last_sync_time": self._last_sync_time.isoformat() if self._last_sync_time else None,
            "sync_in_progress": self._sync_in_progress,
            "environment": self.config.environment.value,
        }
