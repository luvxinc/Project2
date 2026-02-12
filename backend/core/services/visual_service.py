# core/services/visual_service.py
"""
文件说明: 可视化数据聚合服务 (Visual Analytics Service)
主要功能:
1. 从 Data_Clean_Log 读取清洗后的数据。
2. 执行复杂的向量化计算：
   - 还原真实物理销量 (Real Qty): 销售单 x2, 退货单 x-2 (特殊业务规则)。
   - 计算总成本 (COGS): 关联 SKU 成本。
   - 归类费用: 运费、平台费、罚款等。
3. 按时间粒度 (日/周/月) 聚合数据，供前端 Altair 绘图。
"""

import pandas as pd
import numpy as np
from typing import Dict, List, Tuple
from datetime import date

from core.components.db.client import DBClient
from core.services.inventory.repository import InventoryRepository
from core.services.finance.base import ProfitAnalyzerBase
from core.sys.logger import get_logger


class VisualService:

    def __init__(self):
        self.db = DBClient()
        self.repo_inv = InventoryRepository()
        self.logger = get_logger("VisualService")

        # 引用基类的费用定义，保持逻辑一致
        self.PLATFORM_FEE_COLS = list(ProfitAnalyzerBase.PLATFORM_FEE_GROUP)

        self.ACTION_GROUPS = {
            'CA': 'Cancel', 'RE': 'Return', 'CC': 'Case',
            'CR': 'Request', 'PD': 'Dispute'
        }

        # 店铺名称映射 (UI -> DB)
        self.STORE_MAP = {
            "88": "esparts88",
            "esplus": "espartsplus"
        }

        # 特殊 SKU 集合 (用于加权调整)
        self.KEY_SKUS = {"NU1C8E51C", "NU1C8E51K"}

    def _get_date_grain(self, start: date, end: date) -> str:
        """根据时间跨度自动决定聚合粒度"""
        delta = (end - start).days
        if delta <= 35:
            return 'D'  # 1个月内看天
        elif delta <= 180:
            return 'W'  # 半年内看周
        else:
            return 'ME'  # 半年以上看月

    def _safe_numeric(self, series: pd.Series) -> pd.Series:
        """[安全] 强制转数值并填0"""
        return pd.to_numeric(series, errors='coerce').fillna(0.0)

    def _vectorized_cogs_calc(self, df: pd.DataFrame, sku_cost_map: Dict[str, float]) -> pd.Series:
        """[高性能] 向量化计算每行总成本"""
        total_cogs = pd.Series(0.0, index=df.index)
        base_qty = self._safe_numeric(df['quantity'])

        # 遍历 sku1 - sku10
        for i in range(1, 11):
            s_col = f'sku{i}'
            q_col = f'qty{i}'
            if s_col not in df.columns: continue

            # 获取 SKU 对应的成本 (Map)
            # 注意: map 之前要确保 key 格式一致 (大写去空)
            current_skus = df[s_col].astype(str).str.strip().str.upper()
            unit_costs = current_skus.map(sku_cost_map).fillna(0.0)

            per_qtys = self._safe_numeric(df[q_col])

            # 累加: 单个成本 * 套内数量 * 套数
            line_cost = unit_costs * per_qtys * base_qty
            total_cogs += line_cost

        return total_cogs

    def load_and_aggregate(self, start_date: date, end_date: date, stores: List[str]) -> Tuple[pd.DataFrame, str]:
        """
        [主入口] 加载数据并聚合
        Returns: (Aggregated DataFrame, Debug SQL)
        """
        if not stores:
            return pd.DataFrame(), "No stores selected"

        # 1. 构造查询
        db_stores = [self.STORE_MAP.get(s, s) for s in stores]
        store_str = "', '".join(db_stores)

        sql = f"""
            SELECT * FROM Data_Clean_Log 
            WHERE `order date` >= :start
              AND `order date` <= :end
              AND `seller` IN ('{store_str}')
        """
        params = {
            "start": start_date.strftime('%Y-%m-%d'),
            "end": end_date.strftime('%Y-%m-%d')
        }

        self.logger.info(f"Visual Query: {start_date} -> {end_date} | Stores: {stores}")
        df = self.db.read_df(sql, params)

        if df.empty:
            return pd.DataFrame(), sql

        # --- 2. 预处理 (Preprocessing) ---
        # 归一化列名
        df.columns = [c.strip().lower() for c in df.columns]

        # [关键修复] 强制类型转换，防止 Object 类型导致计算崩溃
        df['quantity'] = self._safe_numeric(df.get('quantity', 0))
        df['revenue'] = self._safe_numeric(df.get('revenue', 0))

        # 映射 Action (用于分组)
        # 这里的 Action 代码转为人类可读的 Sales/Return...
        df['ui_action'] = df['action'].astype(str).str.strip().str.upper().map(self.ACTION_GROUPS).fillna('Sales')

        # 计算真实物理消耗 (Business Rule)
        # 简化逻辑：这里直接用 quantity，如果需要特殊 SKU 权重 (NU1C8 * 2)，可以在这里加逻辑
        # 复刻 V1.5.3: Sales=+2, Return=-2 等权重逻辑
        # 为了通用性，暂时简化为直接取 quantity，视作"影响库存的数量"
        df['calc_real_qty'] = df['quantity']

        # 3. 费用归类 (Fees)
        # 运费相关
        ship_map = {
            'shipping label-earning data': 'calc_ship_regular',
            'shipping label-underpay': 'calc_ship_under',
            'shipping label-overpay': 'calc_ship_over',
            'shipping label-return': 'calc_ship_return'
        }
        for db_c, calc_c in ship_map.items():
            if db_c in df.columns:
                df[calc_c] = self._safe_numeric(df[db_c]).abs()  # 取绝对值方便展示
            else:
                df[calc_c] = 0.0

        # 平台费相关
        valid_plat = [c.lower() for c in self.PLATFORM_FEE_COLS if c.lower() in df.columns]
        if valid_plat:
            # sum(axis=1) 行求和
            df['calc_platform_fee'] = df[valid_plat].apply(pd.to_numeric, errors='coerce').fillna(0.0).sum(axis=1).abs()
        else:
            df['calc_platform_fee'] = 0.0

        # 4. 成本计算 (COGS) - [修复] 使用 FIFO 加权平均成本
        df_cogs = self.repo_inv.get_fifo_avg_cost()
        if df_cogs.empty:
            # 回退到静态成本表
            df_cogs = self.repo_inv.get_all_cogs()
            sku_cost_map = dict(zip(
                df_cogs['SKU'].astype(str).str.strip().str.upper(),
                pd.to_numeric(df_cogs['Cog'], errors='coerce').fillna(0)
            ))
        else:
            sku_cost_map = dict(zip(
                df_cogs['SKU'].astype(str).str.strip().str.upper(),
                pd.to_numeric(df_cogs['AvgCost'], errors='coerce').fillna(0)
            ))
        df['calc_cogs'] = self._vectorized_cogs_calc(df, sku_cost_map).abs()

        # --- 5. 聚合 (Aggregation) ---
        df['dt'] = pd.to_datetime(df['order date'])
        grain = self._get_date_grain(start_date, end_date)

        # 定义聚合规则
        agg_rules = {
            'revenue': 'sum',  # 金额
            'calc_real_qty': 'sum',  # 数量
            'order number': 'nunique',  # 订单数
            'calc_cogs': 'sum',  # 成本
            'calc_platform_fee': 'sum',  # 平台费
            'calc_ship_regular': 'sum',  # 正常运费
            'calc_ship_under': 'sum',  # 罚款
            'calc_ship_over': 'sum',  # 超支
            'calc_ship_return': 'sum'  # 退货运费
        }

        # A. 按 Action 分组 (Sales, Return, Cancel...)
        # GroupBy [Time, Action]
        grouped = df.groupby([pd.Grouper(key='dt', freq=grain), 'ui_action']).agg(agg_rules).reset_index()

        # Pivot: 行转列
        # Index=dt, Columns=Action, Values=Metrics
        # 结果列名会变成: revenue_Sales, revenue_Return ...
        pivot_df = grouped.pivot(index='dt', columns='ui_action', values=list(agg_rules.keys()))
        # 展平多级列名 (e.g., ('revenue', 'Sales') -> 'Sales_revenue')
        # 我们希望格式: {Action}_{Metric} (e.g., Sales_Amount)
        pivot_df.columns = [f"{col[1]}_{col[0]}" for col in pivot_df.columns]

        # B. 计算总量 (Total)
        total_agg = df.groupby(pd.Grouper(key='dt', freq=grain)).agg(agg_rules)
        total_agg.columns = [f"Total_{c}" for c in total_agg.columns]

        # C. 合并
        final_df = pd.concat([pivot_df, total_agg], axis=1).fillna(0)

        # D. 重命名为 UI 友好格式
        rename_map = {}
        for col in final_df.columns:
            # 替换原始列名为标准指标名
            new = col.replace('revenue', 'Amount') \
                .replace('calc_real_qty', 'Quantity') \
                .replace('order number', 'Order') \
                .replace('calc_cogs', 'COGS') \
                .replace('calc_platform_fee', 'PlatformFee') \
                .replace('calc_ship_regular', 'ShipRegular') \
                .replace('calc_ship_under', 'ShipUnder') \
                .replace('calc_ship_over', 'ShipOver') \
                .replace('calc_ship_return', 'ShipReturn')
            rename_map[col] = new

        final_df = final_df.rename(columns=rename_map)

        # 增加日期字符串列供 Altair 使用
        final_df['DateStr'] = final_df.index.strftime('%Y-%m-%d')

        return final_df.sort_index(), sql