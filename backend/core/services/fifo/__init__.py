# core/services/fifo/__init__.py
"""FIFO 库存管理服务"""

from core.services.fifo.sales_sync import SalesFifoSyncService

__all__ = ['SalesFifoSyncService']
