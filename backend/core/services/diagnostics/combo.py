# File: backend/core/services/diagnostics/combo.py
"""
# ==============================================================================
# 模块名称: Combo 组合策略诊断 (Bundling Diagnostics)
# ==============================================================================
#
# [Purpose / 用途]
# 评估打包策略的有效性 (黄金组合 vs 无效捆绑)，识别连坐风险。
# 汽配场景: 刹车片+刹车盘、轮毂+螺母等组合销售效益分析。
#
# [Architecture / 架构]
# - Layer: Domain Service (Diagnostics)
# - Parent: BaseDiagnostician
#
# [2026-01-13 优化]
# - 移除emoji，专业化输出
# - 添加利润率分析
# ==============================================================================
"""

import pandas as pd
from backend.core.services.diagnostics.base import BaseDiagnostician

class ComboDiagnostician(BaseDiagnostician):
    """
    [策略服务] Combo (Full SKU) 捆绑策略诊断专家
    核心关注：捆绑有效性(Bundling Efficiency)、连坐风险(Risk Association)。
    """

    def diagnose(self) -> pd.DataFrame:
        data = []
        for sku, cur in self.m_cur.items():
            sales = cur.get("net_qty", 0)
            rev = cur.get("total_rev", 0)
            profit = cur.get("profit", 0)
            margin = profit / rev if rev > 0 else 0

            # 环比
            prev_sales = self.m_prev.get(sku, {}).get("net_qty", 0)
            if prev_sales > 0:
                growth = (sales - prev_sales) / prev_sales
            else:
                growth = 1.0 if sales > 0 else 0.0

            # 连坐风险检查
            bad_qty = cur.get("return_qty", 0) + cur.get("claim_qty", 0)
            total_qty = cur.get("total_qty", 0)
            ret_rate = bad_qty / total_qty if total_qty > 0 else 0

            data.append({
                "full sku": sku,
                "Sales": sales,
                "Revenue": rev,
                "Profit": profit,
                "Margin": margin,
                "Growth": growth,
                "ReturnRate": ret_rate
            })

        df = pd.DataFrame(data)
        if df.empty: return df

        # 分位数
        q_sales_high = df["Sales"].quantile(0.8) if not df["Sales"].empty else 0
        q_sales_low = df["Sales"].quantile(0.2) if not df["Sales"].empty else 0
        q_margin_high = df["Margin"].quantile(0.8) if not df["Margin"].empty else 0
        q_margin_low = df["Margin"].quantile(0.2) if not df["Margin"].empty else 0

        results = []
        for _, row in df.iterrows():
            tags, sugs = [], []

            # ========== 1. 组合效益分析 ==========
            if row["Sales"] > q_sales_high:
                if row["Margin"] > q_margin_high:
                    tags.append("[GOLDEN] 黄金组合")
                    sugs.append("策略成功: 捆绑销售成功提升了客单价(AOV)与利润。")
                else:
                    tags.append("[TRAFFIC-BUNDLE] 引流包")
                    sugs.append("走量工具: 通过低价打包抢占市场份额。")
            elif row["Sales"] < q_sales_low:
                if row["Margin"] > q_margin_high:
                    tags.append("[POTENTIAL] 潜力组合")
                    sugs.append("高毛利低量: 组合利润率高但销量低，需优化流量获取。")
                else:
                    tags.append("[INVALID] 无效捆绑")
                    sugs.append("策略失败: 客户不买账，建议解绑或更换组合方式。")
            else:
                tags.append("[AVERAGE] 普通组合")

            # ========== 2. 利润率分析 ==========
            if row["Margin"] > 0.40:
                tags.append("[HIGH-MARGIN] 高毛利")
            elif row["Margin"] < 0:
                tags.append("[LOSS] 亏损组合")
                sugs.append("立即调整: 组合定价无法覆盖成本。")

            # ========== 3. 趋势分析 ==========
            if row["Growth"] > 0.3:
                tags.append("[RISING] 热度上升")
                sugs.append("趋势向好: 可加大库存储备。")
            elif row["Growth"] < -0.3:
                tags.append("[DECLINING] 热度下滑")

            # ========== 4. 连坐风险 ==========
            if row["ReturnRate"] > 0.10:
                tags.append("[RISK] 连坐风险")
                sugs.append("严重警告: 退货率过高，排查Combo中是否存在低质量子SKU。")

            results.append({
                "Full SKU": row["full sku"],
                "诊断标签": " | ".join(tags),
                "运营建议": " ".join(sugs) if sugs else "维持现状",
                "销量": int(row["Sales"]),
                "收入": round(row["Revenue"], 2),
                "利润": round(row["Profit"], 2),
                "利润率": f"{row['Margin']:.1%}",
                "退货率": f"{row['ReturnRate']:.1%}",
                "环比增长": f"{row['Growth']:.1%}"
            })

        return pd.DataFrame(results)

    @staticmethod
    def get_tag_definitions() -> list:
        return [
            "Combo 捆绑策略诊断说明 (eBay汽配版):",
            "=================================================================================",
            "1. [组合效益分析]:",
            "   - [GOLDEN] 黄金组合: 1+1>2，成功让客户为高客单价买单。",
            "   - [TRAFFIC-BUNDLE] 引流包: 高销量低利润，用于抢占市场份额。",
            "   - [POTENTIAL] 潜力组合: 高毛利但销量低，需优化流量获取。",
            "   - [INVALID] 无效捆绑: 1+1<2，客户更倾向于单独购买。",
            "",
            "2. [连坐风险 (汽配特有)]:",
            "   - [RISK] 连坐风险: 因组合中某个配件质量差，导致整个高价包裹被退货。",
            "   - 典型案例: 赠品螺丝生锈导致几百刀的轮毂被退货。",
            "================================================================================="
        ]