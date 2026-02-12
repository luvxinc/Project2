# File: backend/core/repository/base.py
"""
# ==============================================================================
# 模块名称: 仓库基类 (Base Repository)
# ==============================================================================
#
# [Purpose / 用途]
# 所有数据仓库 (Repository) 的基类。
# 封装 DBClient 的底层调用，提供统一的查询接口和错误处理。
#
# [Architecture / 架构]
# - Layer: Data Access Layer
# - Capabilities:
#   - SQL Execution: execute_sql
#   - DataFrame Loading: query_df
#   - Type Cleaning: clean_numeric
#
# ==============================================================================
"""

import pandas as pd
from typing import List, Dict, Any, Optional
from backend.core.components.db.client import DBClient
from backend.core.sys.logger import get_logger

class BaseRepository:
    def __init__(self):
        self.logger = get_logger(self.__class__.__name__)

    def execute_sql(self, sql: str, params: Optional[Dict] = None) -> bool:
        """执行 SQL (Update/Insert/Delete)"""
        try:
            with DBClient.atomic_transaction() as conn:
                from sqlalchemy import text
                conn.execute(text(sql), params or {})
            return True
        except Exception as e:
            self.logger.error(f"SQL Execute Failed: {e}")
            raise e

    def query_df(self, sql: str, params: Optional[Dict] = None) -> pd.DataFrame:
        """查询并返回 DataFrame"""
        try:
            return DBClient.read_df(sql, params)
        except Exception as e:
            self.logger.error(f"Query DF Failed: {e}")
            return pd.DataFrame()

    def clean_numeric_cols(self, df: pd.DataFrame, cols: List[str]) -> pd.DataFrame:
        """
        [工具方法] 清洗数值列 (修复 Object 类型问题)
        """
        if df.empty:
            return df
        
        for c in cols:
            # 模糊匹配
            match = next((col for col in df.columns if col.lower() == c.lower()), None)
            if match:
                df[match] = pd.to_numeric(df[match], errors='coerce').fillna(0.0)
        return df
