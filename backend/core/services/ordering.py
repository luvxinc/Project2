# core/services/ordering.py
"""
企业级智能补货决策系统 (Enterprise Ordering Decision Support)
Features:
- ABC 分类 (Pareto Analysis)
- 基于历史数据的需求波动率计算
- MOQ 从数据库读取
- 多层级决策标签 (紧急/建议/可延迟/不需要)
- 资金占用分析
"""

import os
import numpy as np
import pandas as pd
from math import ceil, floor, sqrt
from typing import Tuple
from tqdm import tqdm

from backend.common.settings import settings
from core.services.finance.base import ProfitAnalyzerBase
from core.repository.sku_repo import SkuRepository
from core.services.inventory.repository import InventoryRepository


class OrderingService(ProfitAnalyzerBase):
    # 服务水平对应的 Z-Score
    Z_SCORES = {0.98: 2.05, 0.95: 1.65, 0.90: 1.28, 0.85: 1.04}
    
    # 紧急程度阈值
    URGENCY_THRESHOLDS = {
        'critical': 0.3,    # 可用库存 < 30% 目标库存 → 紧急
        'high': 0.6,        # 可用库存 < 60% 目标库存 → 高优
        'medium': 0.9,      # 可用库存 < 90% 目标库存 → 建议
        'low': 1.0          # 可用库存 >= 90% → 可延迟或不需要
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.sku_repo = SkuRepository()
        self.inv_repo = InventoryRepository()
        self.lead_time = float(settings.LEAD_MONTH)
        self.min_safety = float(settings.MIN_SAFETY_MONTH)

    def _load_data_sources(self) -> Tuple[pd.DataFrame, ...]:
        self.log("📥 [Ordering] 正在加载数据源...")

        # 1. Prediction (预测数据)
        pred_path = os.path.join(self.output_dir, "Estimated_Monthly_SKU.csv")
        df_pred = pd.DataFrame()
        if os.path.exists(pred_path):
            try:
                df_pred = pd.read_csv(pred_path)
                if "SKU" in df_pred.columns:
                    mask = ~df_pred["SKU"].astype(str).str.contains("说明|生成|:", regex=True, na=False)
                    df_pred = df_pred[mask]
                    df_pred["SKU"] = df_pred["SKU"].astype(str).str.strip().str.upper()
                    df_pred.rename(columns={"BestForecast": "预测月消耗"}, inplace=True)
            except Exception as e:
                self.log(f"⚠️ 读取预测失败: {e}")

        # 2. Inventory (理论库存)
        df_inv = self.sku_repo.get_inventory_latest()
        if not df_inv.empty:
            df_inv["SKU"] = df_inv["SKU"].astype(str).str.strip().str.upper()
            df_inv["Quantity"] = pd.to_numeric(df_inv["Quantity"], errors='coerce').fillna(0)
            df_inv = df_inv.groupby("SKU", as_index=False)["Quantity"].sum()

        # 3. COGS (使用 FIFO 加权平均成本)
        df_fifo_cost = self.inv_repo.get_fifo_avg_cost()
        if not df_fifo_cost.empty:
            df_fifo_cost["SKU"] = df_fifo_cost["SKU"].astype(str).str.strip().str.upper()
            df_fifo_cost["Cog"] = pd.to_numeric(df_fifo_cost["AvgCost"], errors='coerce').fillna(0)
            df_cogs = df_fifo_cost[["SKU", "Cog"]].groupby("SKU", as_index=False)["Cog"].max()
        else:
            df_cogs = self.sku_repo.get_all_cogs()[["SKU", "Cog"]]
            if not df_cogs.empty:
                df_cogs["SKU"] = df_cogs["SKU"].astype(str).str.strip().str.upper()
                df_cogs["Cog"] = pd.to_numeric(df_cogs["Cog"], errors='coerce').fillna(0)
                df_cogs = df_cogs.groupby("SKU", as_index=False)["Cog"].max()

        # 4. 已定未发和在途未到
        df_pending = self.inv_repo.get_pending_and_transit_qty()
        if not df_pending.empty:
            df_pending["SKU"] = df_pending["SKU"].astype(str).str.strip().str.upper()
            df_pending["order_qty"] = pd.to_numeric(df_pending["order_qty"], errors='coerce').fillna(0)
            df_pending["transit_qty"] = pd.to_numeric(df_pending["transit_qty"], errors='coerce').fillna(0)

        # 5. [企业级] 历史波动率
        df_volatility = self.inv_repo.get_historical_volatility(months=12)
        if not df_volatility.empty:
            df_volatility["SKU"] = df_volatility["SKU"].astype(str).str.strip().str.upper()
            df_volatility["StdMonthly"] = pd.to_numeric(df_volatility["StdMonthly"], errors='coerce').fillna(0)
            df_volatility["CV"] = pd.to_numeric(df_volatility["CV"], errors='coerce').fillna(0.5)

        # 6. [企业级] MOQ (从数据库读取)
        df_moq = self.inv_repo.get_sku_moq()
        if not df_moq.empty:
            df_moq["SKU"] = df_moq["SKU"].astype(str).str.strip().str.upper()
            df_moq["MOQ"] = pd.to_numeric(df_moq["MOQ"], errors='coerce').fillna(100).astype(int)

        return df_pred, df_inv, df_cogs, df_pending, df_volatility, df_moq

    def _calc_abc_classification(self, df: pd.DataFrame) -> pd.DataFrame:
        """ABC 分类 (帕累托分析)"""
        df["预测月消耗"] = pd.to_numeric(df["预测月消耗"], errors='coerce').fillna(0)
        df["Cog"] = pd.to_numeric(df["Cog"], errors='coerce').fillna(0)
        df["预估销售额"] = df["预测月消耗"] * df["Cog"]
        df = df.sort_values("预估销售额", ascending=False).reset_index(drop=True)

        total_val = df["预估销售额"].sum()
        if total_val <= 0:
            df["ABC等级"] = "C"
            df["目标服务水平"] = 0.90
            return df

        df["累计占比"] = df["预估销售额"].cumsum() / total_val
        conditions = [(df["累计占比"] <= 0.80), (df["累计占比"] <= 0.95)]
        df["ABC等级"] = np.select(conditions, ["A", "B"], default="C")
        df["目标服务水平"] = np.select(conditions, [0.98, 0.95], default=0.90)
        return df

    def _calculate_logic_row(self, row: pd.Series) -> pd.Series:
        """[企业级] 单行补货决策计算"""
        forecast = float(row["预测月消耗"])
        theory_inv = float(row["Quantity"])
        order_qty = float(row.get("order_qty", 0))
        transit_qty = float(row.get("transit_qty", 0))
        sl = float(row["目标服务水平"])
        cog = float(row.get("Cog", 0))
        moq = int(row.get("MOQ", 100))
        
        # [企业级] 使用历史波动率，回退到预测值的50%
        volatility = float(row.get("StdMonthly", forecast * 0.5))
        if volatility <= 0:
            volatility = forecast * 0.5

        # 安全库存计算
        z_score = self.Z_SCORES.get(sl, 1.28)
        ss_stat = z_score * sqrt(self.lead_time) * volatility
        ss_min = self.min_safety * forecast
        safety_stock = max(ss_stat, ss_min)

        # 目标库存 和 可用库存
        target_stock = (self.lead_time * forecast) + safety_stock
        available_stock = theory_inv + order_qty + transit_qty
        gap = target_stock - available_stock

        # [企业级] 决策标签
        if target_stock > 0:
            stock_ratio = available_stock / target_stock
        else:
            stock_ratio = 1.0

        if gap <= 0:
            suggest_qty = 0
            urgency = "不需要"
            note = "库存充足"
        elif (forecast * 6) < moq:
            suggest_qty = 0
            urgency = "不需要"
            note = f"销量过低 (6月预测 < MOQ:{moq})"
        else:
            # MOQ 向上取整逻辑
            factor = gap / moq
            remainder = factor - int(factor)
            rounds = ceil(factor) if remainder >= 0.33 else floor(factor)
            suggest_qty = max(rounds * moq, 0)

            # 紧急程度判断
            if stock_ratio < self.URGENCY_THRESHOLDS['critical']:
                urgency = "🔴 紧急"
                note = f"库存告急 ({stock_ratio:.0%})"
            elif stock_ratio < self.URGENCY_THRESHOLDS['high']:
                urgency = "🟠 高优"
                note = f"建议尽快补货 ({stock_ratio:.0%})"
            elif stock_ratio < self.URGENCY_THRESHOLDS['medium']:
                urgency = "🟡 建议"
                note = "正常补货"
            else:
                urgency = "🟢 可延迟"
                note = "可延迟下单"

            if suggest_qty == 0:
                urgency = "不需要"
                note = "缺口微小"

        # [企业级] 资金占用分析
        inv_value = theory_inv * cog  # 库存金额
        order_value = suggest_qty * cog  # 建议订货金额
        
        # 周转天数 = (库存 / 月销) × 30
        turnover_days = (theory_inv / forecast * 30) if forecast > 0 else 999

        return pd.Series({
            "安全库存": round(safety_stock, 1),
            "目标库存": round(target_stock, 1),
            "理论库存": round(theory_inv, 1),
            "已定未发": round(order_qty, 1),
            "在途未到": round(transit_qty, 1),
            "可用库存": round(available_stock, 1),
            "缺口": round(gap, 1),
            "建议订货": int(suggest_qty),
            "紧急程度": urgency,
            "备注": note,
            "库存金额": round(inv_value, 2),
            "订货金额": round(order_value, 2),
            "周转天数": round(turnover_days, 1),
            "波动率": round(volatility, 2)
        })

    def run(self):
        self.log(f"🚀 [企业级] 启动智能补货计算 (Lead={self.lead_time}, Safety={self.min_safety})...")

        df_pred, df_inv, df_cogs, df_pending, df_volatility, df_moq = self._load_data_sources()

        output_cols = [
            "SKU", "ABC等级", "紧急程度", "建议订货", "备注",
            "预测月消耗", "目标服务水平", "安全库存", "目标库存",
            "理论库存", "已定未发", "在途未到", "可用库存", "缺口",
            "库存金额", "订货金额", "周转天数", "波动率", "Cog", "MOQ"
        ]

        if df_pred.empty:
            self.log("⚠️ 预测数据为空，生成空补货表。")
            df_final = pd.DataFrame(columns=output_cols)
        else:
            self.log("🔗 关联库存、成本、波动率、MOQ...")
            df_main = pd.merge(df_pred, df_inv, on="SKU", how="left")
            df_main = pd.merge(df_main, df_cogs, on="SKU", how="left")
            if not df_pending.empty:
                df_main = pd.merge(df_main, df_pending, on="SKU", how="left")
            if not df_volatility.empty:
                df_main = pd.merge(df_main, df_volatility[["SKU", "StdMonthly", "CV"]], on="SKU", how="left")
            if not df_moq.empty:
                df_main = pd.merge(df_main, df_moq, on="SKU", how="left")
            df_main.fillna(0, inplace=True)
            # MOQ 默认值
            if "MOQ" not in df_main.columns or df_main["MOQ"].sum() == 0:
                df_main["MOQ"] = 100

            self.log("📊 执行 ABC 分级与补货计算...")
            df_main = self._calc_abc_classification(df_main)

            tqdm.pandas(desc="Computing")
            logic_results = df_main.progress_apply(self._calculate_logic_row, axis=1)
            df_final = pd.concat([df_main, logic_results], axis=1)
            
            # 排序：紧急程度 > 建议订货量
            urgency_order = {"🔴 紧急": 0, "🟠 高优": 1, "🟡 建议": 2, "🟢 可延迟": 3, "不需要": 4}
            df_final["_urgency_sort"] = df_final["紧急程度"].map(urgency_order).fillna(4)
            df_final = df_final.sort_values(["_urgency_sort", "建议订货"], ascending=[True, False])
            df_final = df_final.drop(columns=["_urgency_sort"])

        # 补全列
        for c in output_cols:
            if c not in df_final.columns:
                df_final[c] = 0

        # 汇总统计
        urgent_count = len(df_final[df_final["紧急程度"].str.contains("紧急|高优", na=False)])
        total_order_value = df_final["订货金额"].sum()
        total_inv_value = df_final["库存金额"].sum()

        filename = f"Smart_Ordering_Plan_{self.file_suffix}.csv"
        footer = [
            "📘 企业级智能补货系统说明:",
            f"1. 参数: Lead={self.lead_time}月, MinSafety={self.min_safety}月",
            "2. 安全库存公式: Z × √(LeadTime) × σ (历史波动率)",
            "3. 目标库存公式: Forecast × LeadTime + SafetyStock",
            f"4. 紧急/高优SKU: {urgent_count} 个",
            f"5. 总库存金额: ${total_inv_value:,.2f}",
            f"6. 建议订货金额: ${total_order_value:,.2f}"
        ]

        self.save_csv(df_final[output_cols], filename, footer)
        self.log(f"✅ 补货计划生成完成: {filename}")