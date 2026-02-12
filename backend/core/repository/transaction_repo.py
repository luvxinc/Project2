# File: backend/core/repository/transaction_repo.py
"""
# ==============================================================================
# 模块名称: 交易数据通用仓库 (Transaction Repository)
# ==============================================================================
#
# [Purpose / 用途]
# 提供对 Data_Clean_Log 的标准化查询，继承自 BaseRepository。
#
# [Architecture / 架构]
# - Layer: Data Access Layer
# - Parent: BaseRepository
#
# ==============================================================================
"""

import pandas as pd
from datetime import date
from backend.core.repository.base import BaseRepository

class TransactionRepository(BaseRepository):
    # 核心数值列 (强制转换以防计算错误)
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
        查询清洗后的交易数据 (Clean Log)
        """
        sql = """
              SELECT *
              FROM Data_Clean_Log
              WHERE `order date` >= :start
                AND `order date` <= :end
              """
        params = {
            "start": start_date.strftime("%Y-%m-%d"),
            "end": end_date.strftime("%Y-%m-%d")
        }

        df = self.query_df(sql, params)
        if df.empty:
            return df

        # 复用 BaseRepository 的清洗逻辑
        df = self.clean_numeric_cols(df, self.NUMERIC_COLS)

        # 日期列单独处理 (因为 Base 只有数值清洗)
        if "order date" in df.columns:
            df["order date"] = pd.to_datetime(df["order date"], errors='coerce')

        return df