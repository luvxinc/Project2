# core/repository/sku_repo.py
"""
文件说明: SKU 与库存数据仓库 (SKU Repository)
主要功能:
1. 获取最新的库存快照。
2. 获取所有 SKU 的成本信息。
3. 提供有效的 SKU 列表。
"""

import pandas as pd
from typing import List
from core.components.db.client import DBClient


class SkuRepository:

    def get_inventory_latest(self) -> pd.DataFrame:
        """
        获取最新的库存数据 (自动识别最后一个日期列)
        Returns: DataFrame [SKU, Quantity]
        """
        # 1. 读表结构
        try:
            schema_df = DBClient.read_df("SELECT * FROM Data_Inventory LIMIT 0")
        except:
            return pd.DataFrame(columns=["SKU", "Quantity"])

        # 2. 找日期列 (含有 '-')
        date_cols = [c for c in schema_df.columns if '-' in str(c)]
        if not date_cols:
            return pd.DataFrame(columns=["SKU", "Quantity"])

        # 3. 取最新
        latest_col = sorted(date_cols)[-1]

        # 4. 查询
        sql = f"SELECT SKU, `{latest_col}` as Quantity FROM Data_Inventory"
        df = DBClient.read_df(sql)

        # 归一化 SKU
        if not df.empty:
            df['SKU'] = df['SKU'].astype(str).str.strip().str.upper()
            df['Quantity'] = pd.to_numeric(df['Quantity'], errors='coerce').fillna(0)

        return df

    def get_all_cogs(self) -> pd.DataFrame:
        """获取 SKU 档案 (含成本)"""
        df = DBClient.read_df("SELECT * FROM Data_COGS")
        if not df.empty and 'SKU' in df.columns:
            df['SKU'] = df['SKU'].astype(str).str.strip().str.upper()
        return df

    def get_valid_skus(self) -> List[str]:
        """获取所有有效 SKU"""
        df = self.get_all_cogs()
        if df.empty: return []
        return df['SKU'].dropna().unique().tolist()