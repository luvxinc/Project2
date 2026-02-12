# File: backend/core/services/finance/profit_listing.py
"""
# ==============================================================================
# 模块名称: Listing 级利润分析器 (Listing Profit Analyzer)
# ==============================================================================
#
# [Purpose / 用途]
# 按 Item ID 归集财务数据，调用 ListingDiagnostician 生成销售表现诊断。
#
# [Architecture / 架构]
# - Layer: Domain Service (Finance)
# - Parent: ProfitAnalyzerBase
# - Dependency: ListingDiagnostician
#
# [重构优化 2026-01-13]
# 使用基类公共方法消除重复代码，逻辑保持完全一致
# ==============================================================================
"""

import pandas as pd
from collections import defaultdict

from backend.core.services.finance.base import ProfitAnalyzerBase
from backend.core.services.diagnostics.listing import ListingDiagnostician

class ListingProfitAnalyzer(ProfitAnalyzerBase):

    def _aggregate(self, df: pd.DataFrame) -> dict:
        metrics = defaultdict(lambda: defaultdict(float))
        if df.empty: return metrics

        records = df.to_dict('records')
        for row in records:
            raw_id = str(row.get("item id", ""))
            # 移除 .0 后缀并去空格
            item_id = raw_id.strip().replace(".0", "")
            if not item_id or item_id == '0': continue

            # 记录 Title
            if "title" not in metrics[item_id]:
                metrics[item_id]["title"] = str(row.get("item title", "")).strip()

            qty_sets = int(float(row.get("quantity", 0)))
            action = str(row.get("action", "")).strip().upper()
            revenue = float(row.get("revenue", 0))
            refund = float(row.get("Refund", 0))

            # [重构] 使用基类公共方法累加 action 相关指标
            # Listing 维度无需分摊权重，weight=1.0
            self._accumulate_action_metrics(metrics, item_id, action, qty_sets, revenue, refund, weight=1.0)

            # [重构] 使用基类公共方法计算成本
            row_cost = self._calculate_row_cost(row, qty_sets, include_special_sku=True)
            metrics[item_id]["cog_value"] += -row_cost
            
            # 累加费用
            self._accumulate_fees(row, metrics, item_id, weight=1.0)

        return metrics

    def run(self):
        self._load_basics()

        if self.df_cur is None or self.df_cur.empty:
            self.log("⚠️ 本期无数据，无法分析")
            return

        self.log(f"📊 已加载原始记录: {len(self.df_cur)} 条")

        self.log("正在聚合本期数据...")
        m_cur = self._calculate_net_profit(self._aggregate(self.df_cur))

        self.log("正在聚合上期数据...")
        m_prev = self._calculate_net_profit(self._aggregate(self.df_prev))

        tables = self.generate_full_report_suite(m_cur, m_prev, key_name="Item ID")

        self.log("正在执行 AI 智能诊断...")
        diag = ListingDiagnostician(m_cur, m_prev)
        df_diag = diag.diagnose()
        tables.append(("C1_智能诊断表 (AI Diagnostics)", df_diag))
        explanation_lines = diag.get_tag_definitions()

        filename = f"Profit_Analysis_Listing_{self.file_suffix}.csv"

        # [重构] 使用基类公共方法保存
        save_path = self.save_multi_table_csv(filename, tables, explanation_lines)
        if save_path:
            self.log(f"✅ Listing 利润报表已生成: {filename}")