# core/services/diagnostics/crm.py
"""
文件说明: 客户价值与风险诊断 (CRM Diagnostics)
主要功能:
1. 基于 RFM 模型对客户进行价值分层 (鲸鱼/铁粉/沉睡)。
2. 识别高风险客户 (惯性退货/纠纷发起者)。
3. 输出运营建议 (拉黑/维护/召回)。

[2026-01-13 优化]
- 移除emoji，专业化输出
- 调整汽配行业阈值 (低换手率)
- 修复elif互斥问题，支持多标签
"""

import pandas as pd
from .base import BaseDiagnostician


class CustomerDiagnostician(BaseDiagnostician):

    def __init__(self, metrics_cur: pd.DataFrame, metrics_prev: pd.DataFrame = None, **kwargs):
        """
        初始化诊断器
        :param metrics_cur: 本期 RFM 数据 (DataFrame)
        :param metrics_prev: 上期数据 (CRM 暂未使用，设为 None)
        """
        self.m_cur = metrics_cur
        self.m_prev = metrics_prev
        self.kwargs = kwargs

    def diagnose(self) -> pd.DataFrame:
        df = self.m_cur.copy()
        if df.empty: return df

        # 动态阈值
        q_net_m_high = df["Net_Monetary"].quantile(0.8) if not df["Net_Monetary"].empty else 0
        q_net_m_top10 = df["Net_Monetary"].quantile(0.9) if not df["Net_Monetary"].empty else 0

        results = []

        for _, row in df.iterrows():
            tags, sugs = [], []

            # 提取核心指标
            user = row["buyer username"]
            freq = row["Frequency"]
            net_monetary = row["Net_Monetary"]
            gross_monetary = row["Gross_Monetary"]
            recency = row["Recency"]
            ret_rate = row["ReturnRate"]
            dispute = row["DisputeCount"]
            aov = row["AOV"]

            is_target_user = False
            is_safe_user = (ret_rate < 0.2) and (dispute == 0)

            # =========================================================
            # 1. 风险组 - 优先判断 (Risk Group)
            # =========================================================

            # 规则A: 纠纷黑名单
            if dispute > 0:
                tags.append("[DISPUTE] 纠纷发起者")
                sugs.append("高危预警: 曾发起Payment Dispute，建议拉黑。")
                is_target_user = True

            # 规则B: 惯性退货 (买得多退得多)
            if freq >= 2 and ret_rate > 0.3:
                tags.append("[SERIAL-RETURN] 惯性退货")
                sugs.append(f"利润杀手: 退货率{ret_rate:.0%}，实际净值仅${net_monetary:.2f}。")
                is_target_user = True

            # 规则C: 虚假大户 (Gross很高，Net很低)
            if gross_monetary > 1000 and (net_monetary / gross_monetary) < 0.2:
                tags.append("[FAKE-WHALE] 虚假大户")
                sugs.append("无效交易: 产生大量流水但无实际利润，浪费运费。")
                is_target_user = True

            # =========================================================
            # 2. 价值组 - 非互斥判断 (可以同时是鲸鱼+铁粉)
            # =========================================================

            if is_safe_user:
                # 规则D: 超级鲸鱼 (Top 10% Net)
                if net_monetary > q_net_m_top10:
                    tags.append("[WHALE] 超级鲸鱼")
                    sugs.append("VVIP客户: 净贡献极高，需专项维护防止流失。")
                    is_target_user = True

                # 规则E: 忠诚铁粉 (汽配调整: freq>=2即为忠诚，行业低换手率)
                if freq >= 2 and recency < 180:
                    tags.append("[LOYAL] 忠诚客户")
                    sugs.append("复购良好: 年内2次以上购买，适合新品推荐。")
                    is_target_user = True

                # 规则F: 潜力批发商/B端 (汽配调整: AOV>$1000)
                if aov > 1000:
                    tags.append("[B2B] 潜力B端")
                    sugs.append("批发商迹象: 单笔金额高，可能是修理厂或同行。")
                    is_target_user = True

                # 规则G: 沉睡大客户 (汽配调整: recency>180天)
                if net_monetary > q_net_m_high and recency > 180:
                    tags.append("[DORMANT] 沉睡大客户")
                    sugs.append("流失预警: 优质客户超半年未回购，建议邮件召回。")
                    is_target_user = True

            # =========================================================
            # 3. 新客户识别
            # =========================================================
            if freq == 1 and recency < 30:
                tags.append("[NEW] 新客户")
                sugs.append("首单客户: 关注购后体验，争取二次转化。")
                is_target_user = True

            # =========================================================
            # 4. 流失客户识别
            # =========================================================
            if freq >= 2 and recency > 365:
                tags.append("[CHURNED] 已流失")
                sugs.append("年度流失: 曾多次购买但1年未回购，考虑促销召回。")
                is_target_user = True

            if not is_target_user:
                continue

            results.append({
                "买家用户名": user,
                "客户标签": " | ".join(tags),
                "运营建议": " ".join(sugs),
                "净消费额(Net LTV)": round(net_monetary, 2),
                "总流水(Gross)": round(gross_monetary, 2),
                "订单数(1Y)": freq,
                "退货率(1Y)": f"{ret_rate:.1%}",
                "最近购买(天前)": int(recency),
                "客单价(Net AOV)": round(aov, 2)
            })

        return pd.DataFrame(results)

    @staticmethod
    def get_tag_definitions() -> list:
        return [
            "客户价值与风险诊断说明 (CRM - eBay汽配版):",
            "=================================================================================",
            "[核心逻辑] 数据基于过去365天。所有价值判断基于净消费额(Net LTV)。",
            "",
            "1. [风险控制] 需要警惕或拉黑的客户:",
            "   - [DISPUTE] 纠纷发起者: 有 Payment Dispute 记录，高危客户。",
            "   - [SERIAL-RETURN] 惯性退货: 购买>=2次且退货率>30%。",
            "   - [FAKE-WHALE] 虚假大户: 总流水高但净值极低(退款占比>80%)。",
            "",
            "2. [价值挖掘] 需要维护的优质客户 (前提: 退货率<20%):",
            "   - [WHALE] 超级鲸鱼: 净消费额 Top 10%。",
            "   - [LOYAL] 忠诚客户: 年购买>=2次且半年内有交易 (汽配行业标准)。",
            "   - [B2B] 潜力B端: 单笔净值>$1000，可能是修理厂/批发商。",
            "   - [DORMANT] 沉睡大客户: 历史净值高(Top20%)但>180天未回购。",
            "",
            "3. [生命周期] 客户发展阶段:",
            "   - [NEW] 新客户: 首单且30天内购买。",
            "   - [CHURNED] 已流失: 曾多次购买但超过1年未回购。",
            "================================================================================="
        ]