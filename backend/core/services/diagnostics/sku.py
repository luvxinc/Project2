# File: backend/core/services/diagnostics/sku.py
"""
# ==============================================================================
# 模块名称: SKU 供应链健康度诊断分析器
# ==============================================================================
#
# [Purpose / 用途]
# 基于财务指标和库存数据，对 SKU 进行多维度健康度诊断。
# 针对 eBay 汽配电商场景优化，关注盈利率、周转率、退货率。
#
# [Architecture / 架构]
# - Layer: Domain Service (Diagnostics)
# - Input: Financial Metrics (Cur/Prev), Inventory Map, Order Map, Transit Map
# - Output: Diagnostic DataFrame, Actionable Suggestions
#
# [2026-01-13 优化]
# - 移除emoji，专业化输出
# - 调整汽配行业阈值
# - 新增利润率专项标签
# ==============================================================================
"""

import pandas as pd
import numpy as np
from backend.core.services.diagnostics.base import BaseDiagnostician

class SkuDiagnostician(BaseDiagnostician):

    def __init__(self, metrics_cur: dict, metrics_prev: dict, inventory_map: dict,
                 order_map: dict = None, transit_map: dict = None):
        super().__init__(metrics_cur, metrics_prev)
        self.inventory_map = inventory_map
        self.order_map = order_map or {}
        self.transit_map = transit_map or {}

    def _prepare_features(self) -> pd.DataFrame:
        """特征工程: 将字典转为 DataFrame 并计算衍生指标"""
        data = []
        for sku, cur in self.m_cur.items():
            # 1. 基础财务
            sales = cur.get("net_qty", 0)
            rev = cur.get("total_rev", 0)
            profit = cur.get("profit", 0)
            margin = profit / rev if rev > 0 else 0

            # 2. 风险指标
            bad_qty = (cur.get("return_qty", 0) + cur.get("request_qty", 0) + cur.get("claim_qty", 0))
            total_qty = cur.get("total_qty", 0)
            ret_rate = bad_qty / total_qty if total_qty > 0 else 0

            # 广告费比
            ad_cost = cur.get("net_ad_fee", 0)
            acos = ad_cost / rev if rev > 0 else 0

            # 3. 趋势指标 (环比)
            prev_sales = self.m_prev.get(sku, {}).get("net_qty", 0)
            if prev_sales > 0:
                growth = (sales - prev_sales) / prev_sales
            else:
                growth = 1.0 if sales > 0 else 0.0

            # 4. 供应链指标 (DOS)
            curr_inv = self.inventory_map.get(sku, 0)
            order_qty = self.order_map.get(sku, 0)
            transit_qty = self.transit_map.get(sku, 0)
            total_supply = curr_inv + order_qty + transit_qty
            
            daily_sales = sales / 30 if sales > 0 else 0
            dos = curr_inv / daily_sales if daily_sales > 0 else 999
            dos_pipeline = total_supply / daily_sales if daily_sales > 0 else 999

            data.append({
                "SKU": sku, "Sales": sales, "Revenue": rev, "Profit": profit,
                "Margin": margin, "ACOS": acos, "ReturnRate": ret_rate,
                "Growth": growth, "DOS": dos, "DOS_Pipeline": dos_pipeline,
                "Inventory": curr_inv, "OrderQty": order_qty, "TransitQty": transit_qty,
                "TotalSupply": total_supply
            })

        return pd.DataFrame(data)

    def diagnose(self) -> pd.DataFrame:
        df = self._prepare_features()
        if df.empty: return df

        # 动态分位数计算
        q_sales_high = df["Sales"].quantile(0.8) if not df["Sales"].empty else 0
        q_sales_low = df["Sales"].quantile(0.2) if not df["Sales"].empty else 0
        q_margin_high = df["Margin"].quantile(0.8) if not df["Margin"].empty else 0
        q_margin_low = df["Margin"].quantile(0.2) if not df["Margin"].empty else 0

        results = []
        for _, row in df.iterrows():
            tags, sugs = [], []

            # ========== 1. BCG 产品矩阵 ==========
            if row["Sales"] > q_sales_high:
                if row["Margin"] > q_margin_high:
                    tags.append("[STAR] 明星产品")
                    sugs.append("核心SKU: 优先保障库存，可适当涨价测试市场承受力。")
                else:
                    tags.append("[COW] 现金牛")
                    sugs.append("走量产品: 严控成本，考虑捆绑销售提升客单价。")
            elif row["Sales"] < q_sales_low:
                if row["Margin"] < q_margin_low:
                    tags.append("[DOG] 负资产")
                    sugs.append("停止补货: 立即清仓促销或下架，释放资金。")
                else:
                    tags.append("[QUESTION] 潜力观察")
                    sugs.append("流量不足: 优化Title/Specifics，检查Fitment覆盖度。")
            else:
                tags.append("[AVERAGE] 普通产品")

            # ========== 2. 利润率专项分析 (汽配核心关注) ==========
            if row["Margin"] > 0.40:
                tags.append("[HIGH-MARGIN] 高毛利")
                sugs.append("定价优势: 保护定价权，警惕跟卖压价。")
            elif row["Margin"] > 0.15:
                tags.append("[NORMAL-MARGIN] 正常毛利")
            elif row["Margin"] > 0:
                tags.append("[LOW-MARGIN] 微利")
                sugs.append("利润薄弱: 优化采购成本或提价，否则风险大于收益。")
            else:
                tags.append("[LOSS] 亏损")
                sugs.append("立即止损: 当前售价无法覆盖成本，必须涨价或停售。")

            # ========== 3. 趋势监控 ==========
            if row["Growth"] > 0.3:
                tags.append("[RISING] 销量飙升")
                sugs.append("趋势向好: 加大库存储备，考虑Promoted Listings推广。")
            elif row["Growth"] < -0.3:
                tags.append("[DECLINING] 销量下滑")
                sugs.append("需关注: 检查竞品动态、价格变化、Listing质量。")

            # ========== 4. 退货率分析 (eBay汽配关键指标) ==========
            if row["ReturnRate"] > 0.10:
                tags.append("[HIGH-RETURN] 高退货")
                sugs.append("适配风险: 检查Fitment数据是否准确，Listing描述是否清晰。")
            elif row["ReturnRate"] > 0.05:
                tags.append("[WATCH-RETURN] 退货关注")

            # ========== 5. 广告效率 ==========
            if row["ACOS"] > 0.30:
                tags.append("[AD-INEFFICIENT] 广告低效")
                sugs.append("ROI偏低: 优化关键词，降低Promoted Listings费率。")

            # ========== 6. 库存健康度 (汽配调整: 365天滞销) ==========
            if row["DOS"] < 14:
                tags.append("[STOCK-ALERT] 库存紧张")
                sugs.append("补货提醒: 库存不足2周销量，考虑空运或加急采购。")
            elif row["DOS"] > 365:
                tags.append("[OVERSTOCK] 滞销积压")
                sugs.append("去库存: 超过1年库存，建议eBay促销或站外清仓。")
            
            # ========== 7. 供应链Pipeline分析 ==========
            if row["DOS"] < 14 and row["DOS_Pipeline"] >= 45:
                tags.append("[IN-TRANSIT] 在途补给中")
                sugs.append("无需紧急采购: 在途+下订可覆盖6周需求。")
            
            if row["TotalSupply"] > 0 and row["DOS_Pipeline"] > 365:
                tags.append("[OVER-ORDER] 过度备货")
                sugs.append("采购过量: 总供应超过1年销量，暂停采购。")

            # ========== 8. 新品识别 ==========
            if row["Sales"] == 0 and row["Inventory"] > 0:
                tags.append("[NEW-SKU] 新品观察")
                sugs.append("新品上架: 关注首单转化，优化Listing可见度。")

            results.append({
                "SKU": row["SKU"],
                "诊断标签": " | ".join(tags),
                "运营建议": " ".join(sugs) if sugs else "维持现状",
                "销量": int(row["Sales"]),
                "收入": round(row["Revenue"], 2),
                "利润": round(row["Profit"], 2),
                "利润率": f"{row['Margin']:.1%}",
                "退货率": f"{row['ReturnRate']:.1%}",
                "ACOS": f"{row['ACOS']:.1%}",
                "当前库存": int(row["Inventory"]),
                "在途数": int(row["TransitQty"]),
                "下订数": int(row["OrderQty"]),
                "总供应": int(row["TotalSupply"]),
                "库存天数": round(row["DOS"], 0),
                "Pipeline天数": round(row["DOS_Pipeline"], 0),
                "环比增长": f"{row['Growth']:.1%}"
            })

        return pd.DataFrame(results)

    @staticmethod
    def get_tag_definitions() -> list:
        return [
            "SKU 供应链诊断体系说明 (eBay汽配版):",
            "=================================================================================",
            "1. [BCG矩阵] 基于本期销量和利润率分位数动态划分:",
            "   - [STAR] 明星产品: 高销量+高利润，核心SKU需重点保护",
            "   - [COW] 现金牛: 高销量+低利润，走量产品提供现金流",
            "   - [QUESTION] 潜力观察: 低销量+高利润，需优化流量获取",
            "   - [DOG] 负资产: 低销量+低利润，建议清仓或淘汰",
            "",
            "2. [利润率分析] 汽配行业核心指标:",
            "   - [HIGH-MARGIN] 高毛利(>40%): 有定价权，需防止跟卖",
            "   - [LOW-MARGIN] 微利(0-15%): 利润薄，风险高于收益",
            "   - [LOSS] 亏损(<0%): 必须立即涨价或停售",
            "",
            "3. [库存健康度] 汽配慢周转行业标准:",
            "   - [STOCK-ALERT] 库存紧张(<14天): 需要补货",
            "   - [OVERSTOCK] 滞销积压(>365天): 资金占用过高",
            "   - [IN-TRANSIT] 在途补给中: 在途充足无需紧急采购",
            "   - [OVER-ORDER] 过度备货(>365天Pipeline): 暂停采购",
            "",
            "4. [风险控制] eBay平台相关:",
            "   - [HIGH-RETURN] 高退货(>10%): 检查Fitment和描述准确性",
            "   - [AD-INEFFICIENT] 广告低效(ACOS>30%): 优化Promoted Listings",
            "================================================================================="
        ]