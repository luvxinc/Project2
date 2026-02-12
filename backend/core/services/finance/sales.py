# File: backend/core/services/finance/sales.py
"""
# ==============================================================================
# 模块名称: SKU 销量统计分析 (Sales Quantity Analyzer)
# ==============================================================================
#
# [Purpose / 用途]
# 统计每个 SKU 在不同店铺 (88/Plus) 和不同动作 (Sale/Cancel/Return) 下的数量。
#
# [Architecture / 架构]
# - Layer: Domain Service (Finance)
# - Parent: ProfitAnalyzerBase
#
# ==============================================================================
"""

import pandas as pd
import numpy as np
import tqdm
from collections import defaultdict

from backend.common.settings import settings
from backend.core.services.finance.base import ProfitAnalyzerBase

class SalesQtyAnalyzer(ProfitAnalyzerBase):

    def run(self):
        self.log(f"🚀 开始分析销量: {self.start_date} -> {self.end_date}")

        # 1. 加载数据 (利用基类)
        # 注意: SalesAnalyzer 不依赖成本数据，所以可以手动调用 repo 查询，
        # 但为了复用基类的日期处理，我们调用 _load_basics (虽然它会加载成本，但这无害且保证一致性)
        self._load_basics()

        if self.df_cur.empty:
            self.log("⚠️ 期间无数据")
            return

        self.log(f"📊 已加载原始记录: {len(self.df_cur)} 条")

        stats = defaultdict(lambda: defaultdict(int))
        records = self.df_cur.to_dict('records')

        for row in tqdm.tqdm(records, desc="计算销量"):
            self._process_row(row, stats)

        if not stats:
            self.log("⚠️ 统计结果为空")
            return

        # 转换为 DataFrame
        df_res = pd.DataFrame.from_dict(stats, orient='index').reset_index()
        df_res.rename(columns={'index': 'SKU'}, inplace=True)
        df_res.fillna(0, inplace=True)

        # 计算净值和百分比
        R = settings.LOSS_RATES
        prefixes = ["88", "plus", "total"]
        metrics = ["Canceled", "Returned", "Cased", "Request", "Dispute"]

        for prefix in prefixes:
            if f"{prefix}_Sold" not in df_res.columns:
                df_res[f"{prefix}_Sold"] = 0
            sold = df_res[f"{prefix}_Sold"]

            for metric in metrics:
                col_name = f"{prefix}_{metric}"
                if col_name not in df_res.columns: df_res[col_name] = 0

                # 计算百分比
                df_res[f"{prefix}_{metric}_%"] = (
                    (df_res[col_name] / sold)
                    .replace([np.inf, -np.inf], 0)
                    .fillna(0)
                    .apply(lambda x: f"{x:.2%}")
                )

            # 计算 Net
            df_res[f"{prefix}_Net"] = (
                    df_res[f"{prefix}_Sold"]
                    - df_res[f"{prefix}_Canceled"]
                    - df_res[f"{prefix}_Returned"] * R.get('RETURN', 0.3)
                    - df_res[f"{prefix}_Cased"] * R.get('CASE', 0.6)
                    - df_res[f"{prefix}_Request"] * R.get('REQUEST', 0.5)
                    - df_res[f"{prefix}_Dispute"] * R.get('DISPUTE', 1.0)
            ).astype(int)

        # 整理列顺序
        cols = ["SKU"]
        for p in prefixes:
            cols.extend([
                f"{p}_Sold", f"{p}_Canceled", f"{p}_Canceled_%",
                f"{p}_Returned", f"{p}_Returned_%", f"{p}_Cased", f"{p}_Cased_%",
                f"{p}_Request", f"{p}_Request_%", f"{p}_Dispute", f"{p}_Dispute_%",
                f"{p}_Net"
            ])

        # 补全缺失列
        for c in cols:
            if c not in df_res.columns: df_res[c] = 0
        df_res = df_res[cols]

        filename = f"SKU_Sold_{self.file_suffix}.csv"

        footer = [
            " ", "备注说明：",
            "1. 取消的订单不算库存消耗",
            f"2. Case为客户投诉退货,平台介入强制退款,耗损率{int(R.get('CASE', 0.6) * 100)}%",
            f"3. Request为客户申请退货,平台介入,卖家退款,耗损率{int(R.get('REQUEST', 0.5) * 100)}%",
            f"4. Return为客户申请退货,无平台介入,卖家退款, 耗损率{int(R.get('RETURN', 0.3) * 100)}%",
            f"5. Dispute为客户通过银行投诉, 平台强制退款, 耗损率{int(R.get('DISPUTE', 1.0) * 100)}%",
        ]

        self.save_csv(df_res, filename, footer)

    def _process_row(self, row, stats_dict):
        """处理单行数据"""
        raw_seller = str(row.get("seller", "")).strip().lower()
        action = str(row.get("action", "")).strip().upper()

        try:
            quantity_val = int(float(row.get("quantity", 0)))
        except:
            quantity_val = 0

        # 解析 SKU 列表 (从 Clean Log 的 sku1..qty1 列)
        sku_list = []
        for i in range(1, 11):
            s_key = f"sku{i}"
            q_key = f"qty{i}"

            if s_key not in row: break

            sku_val = row.get(s_key)
            if sku_val and str(sku_val).strip() not in ["", "None", "nan", "NaN", "0"]:
                try:
                    q = int(float(row.get(q_key, 0)))
                except:
                    q = 0
                sku_clean = str(sku_val).strip().upper()
                sku_list.append((sku_clean, q))
            else:
                break

        # 特殊 SKU 规则
        if any(sku in ["NU1C8E51C", "NU1C8E51K"] for sku, _ in sku_list):
            sku_list.append(("NU1C8SKT7", 2))

        # 归属判定
        action_map = {
            "88": ["esparts88"],
            "plus": ["espartsplus"],
            "total": None
        }
        code_map = {
            "Canceled": "CA", "Returned": "RE", "Cased": "CC",
            "Request": "CR", "Dispute": "PD"
        }

        for prefix, target_sellers in action_map.items():
            if target_sellers is not None and raw_seller not in target_sellers:
                continue

            for sku, qtyp in sku_list:
                total_qty = quantity_val * qtyp
                stats_dict[sku][f"{prefix}_Sold"] += total_qty

                for label, code in code_map.items():
                    if action == code:
                        stats_dict[sku][f"{prefix}_{label}"] += total_qty