# File: backend/core/services/etl/repository.py
"""
# ==============================================================================
# 模块名称: ETL 数据仓库 (ETL Repository)
# ==============================================================================
#
# [Purpose / 用途]
# 提供对原始表和结果表的访问，继承自 BaseRepository (Standardized)。
#
# [Architecture / 架构]
# - Layer: Data Access Layer
# - Parent: BaseRepository
#
# ==============================================================================
"""

import pandas as pd
from typing import Optional, List
from datetime import date
from backend.core.repository.base import BaseRepository

class ETLRepository(BaseRepository):
    # 定义需要强制转换为数值的列
    NUMERIC_COLS = [
        'quantity', 'revenue', 'profit', 'Shipping and handling',
        'Seller collected tax', 'eBay collected tax', 'Refund',
        'Shipping label-Earning data', 'Shipping label-underpay',
        'Shipping label-overpay', 'Shipping label-Return',
        'Final Value Fee - fixed', 'Final Value Fee - variable',
        'Promoted Listings fee'
    ]

    def get_transactions_by_date(self, start_date: date, end_date: date) -> pd.DataFrame:
        """
        [核心查询] 查询清洗后 (Clean Log) 的数据
        """
        sql = """
              SELECT *
              FROM Data_Clean_Log
              WHERE `order date` >= :start_date
                AND `order date` <= :end_date
              """
        params = {
            "start_date": start_date.strftime("%Y-%m-%d"),
            "end_date": end_date.strftime("%Y-%m-%d")
        }

        df = self.query_df(sql, params)
        if df.empty:
            return df

        # [标准化] 使用 BaseRepository 的清洗方法
        df = self.clean_numeric_cols(df, self.NUMERIC_COLS)

        if "order date" in df.columns:
            df["order date"] = pd.to_datetime(df["order date"], errors='coerce')

        return df



    def get_raw_transaction_data(self) -> pd.DataFrame:
        """获取原始交易数据"""
        return self.query_df("SELECT * FROM Data_Transaction")

    def get_raw_earning_data(self) -> pd.DataFrame:
        """获取原始资金数据"""
        return self.query_df("SELECT * FROM Data_Order_Earning")