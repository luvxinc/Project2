# File: backend/core/services/diagnostics/listing.py
"""
# ==============================================================================
# 模块名称: Listing (Item ID) 销售表现诊断 (Listing Diagnostics)
# ==============================================================================
#
# [Purpose / 用途]
# 对 eBay Listing 进行分层，监控链接权重趋势，识别广告亏损。
# 针对汽配电商，关注Fitment、描述准确性、广告效率。
#
# [Architecture / 架构]
# - Layer: Domain Service (Diagnostics)
# - Parent: BaseDiagnostician
#
# [2026-01-13 优化]
# - 移除emoji，专业化输出
# - 调整eBay汽配场景阈值
# ==============================================================================
"""

import pandas as pd
from backend.core.services.diagnostics.base import BaseDiagnostician

class ListingDiagnostician(BaseDiagnostician):
    """
    [策略服务] Listing (Item ID) 销售表现诊断专家
    核心关注：链接权重(Weight)、流量价值(Traffic Value)、生命周期(Lifecycle)。
    """

    def diagnose(self) -> pd.DataFrame:
        data = []
        for iid, cur in self.m_cur.items():
            sales = cur.get("net_qty", 0)
            rev = cur.get("total_rev", 0)
            profit = cur.get("profit", 0)
            margin = profit / rev if rev > 0 else 0

            ad_cost = cur.get("net_ad_fee", 0)
            acos = ad_cost / rev if rev > 0 else 0

            # 环比增长
            prev_sales = self.m_prev.get(iid, {}).get("net_qty", 0)
            if prev_sales > 0:
                growth = (sales - prev_sales) / prev_sales
            else:
                growth = 1.0 if sales > 0 else 0.0

            # 退货率
            total_qty = cur.get("total_qty", 0)
            bad_qty = cur.get("return_qty", 0) + cur.get("claim_qty", 0)
            ret_rate = bad_qty / total_qty if total_qty > 0 else 0

            data.append({
                "item id": iid,
                "item title": cur.get("title", ""),
                "Sales": sales,
                "Revenue": rev,
                "Profit": profit,
                "Margin": margin,
                "ACOS": acos,
                "Growth": growth,
                "ReturnRate": ret_rate
            })

        df = pd.DataFrame(data)
        if df.empty: return df

        # 动态分位数
        q_sales_high = df["Sales"].quantile(0.8) if not df["Sales"].empty else 0
        q_sales_low = df["Sales"].quantile(0.2) if not df["Sales"].empty else 0
        q_margin_high = df["Margin"].quantile(0.8) if not df["Margin"].empty else 0
        q_margin_low = df["Margin"].quantile(0.2) if not df["Margin"].empty else 0

        results = []
        for _, row in df.iterrows():
            tags, sugs = [], []

            # ========== 1. 链接分层策略 ==========
            if row["Sales"] > q_sales_high:
                if row["Margin"] > q_margin_high:
                    tags.append("[ACE] 王牌Listing")
                    sugs.append("核心资产: 链接权重高，防守竞品跟卖，优化Best Offer策略。")
                else:
                    tags.append("[TRAFFIC] 引流Listing")
                    sugs.append("流量入口: 利用关联销售带动高利款，考虑涨价测试。")
            elif row["Sales"] < q_sales_low:
                if row["Margin"] < q_margin_low:
                    tags.append("[TRASH] 垃圾Listing")
                    sugs.append("沉没成本: 建议下架重做或删除，释放刊登额度。")
                else:
                    tags.append("[LONGTAIL] 长尾Listing")
                    sugs.append("精准流量: 优化长尾关键词，维持高ROI。")
            else:
                tags.append("[AVERAGE] 腰部Listing")

            # ========== 2. 利润率分析 ==========
            if row["Margin"] > 0.40:
                tags.append("[HIGH-MARGIN] 高毛利")
            elif row["Margin"] < 0:
                tags.append("[LOSS] 亏损Listing")
                sugs.append("立即涨价: 当前价格无法盈利。")

            # ========== 3. 趋势与权重 ==========
            if row["Growth"] > 0.3:
                tags.append("[RISING] 权重上升")
                sugs.append("趋势向好: 链接权重正在积累，加大曝光。")
            elif row["Growth"] < -0.3:
                tags.append("[DECLINING] 权重下滑")
                sugs.append("需关注: 检查价格竞争力、Listing质量、是否被跟卖。")

            # ========== 4. 退货风险 (汽配关键) ==========
            if row["ReturnRate"] > 0.10:
                tags.append("[HIGH-RETURN] 高退货")
                sugs.append("适配问题: 检查Fitment数据、Item Specifics是否准确。")
            elif row["ReturnRate"] > 0.05:
                tags.append("[WATCH-RETURN] 退货关注")

            # ========== 5. 广告效率 ==========
            if row["ACOS"] > 0.30:
                tags.append("[AD-LOSS] 广告亏损")
                sugs.append("ROI过低: 降低Promoted Listings费率或暂停推广。")

            # ========== 6. 新Listing识别 ==========
            if row["Sales"] == 0:
                tags.append("[NEW-LISTING] 新品Listing")
                sugs.append("新品观察: 关注首单转化，检查曝光量。")

            results.append({
                "Item ID": row["item id"],
                "Item Title": row["item title"],
                "诊断标签": " | ".join(tags),
                "运营建议": " ".join(sugs) if sugs else "维持现状",
                "销量": int(row["Sales"]),
                "收入": round(row["Revenue"], 2),
                "利润": round(row["Profit"], 2),
                "利润率": f"{row['Margin']:.1%}",
                "退货率": f"{row['ReturnRate']:.1%}",
                "环比增长": f"{row['Growth']:.1%}",
                "ACOS": f"{row['ACOS']:.1%}"
            })

        return pd.DataFrame(results)

    @staticmethod
    def get_tag_definitions() -> list:
        return [
            "Listing 销售表现诊断说明 (eBay汽配版):",
            "=================================================================================",
            "1. [链接分层策略]:",
            "   - [ACE] 王牌Listing: 高流量+高利润，品牌旗舰需重点保护。",
            "   - [TRAFFIC] 引流Listing: 高流量+低利润，用于抢占类目排名。",
            "   - [LONGTAIL] 长尾Listing: 低流量+高利润，满足特定配件需求。",
            "   - [TRASH] 垃圾Listing: 无流量+无利润，建议下架释放资源。",
            "",
            "2. [eBay权重监控]:",
            "   - [RISING] 权重上升: 销量环比增长>30%，链接权重在积累。",
            "   - [DECLINING] 权重下滑: 销量环比下降>30%，需排查原因。",
            "",
            "3. [汽配关键指标]:",
            "   - [HIGH-RETURN] 高退货(>10%): 检查Fitment和Item Specifics准确性。",
            "   - [AD-LOSS] 广告亏损(ACOS>30%): Promoted Listings效率低。",
            "================================================================================="
        ]