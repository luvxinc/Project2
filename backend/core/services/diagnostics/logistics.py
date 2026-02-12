# core/services/diagnostics/logistics.py
"""
文件说明: 物流效益诊断专家 (Logistics Diagnostics)
主要功能:
1. 分析物流成本结构，识别异常费用 (罚款、超支)。
2. 评估物流费效比 (Shipping Ratio)。
3. 输出优化建议 (如校准重量、优化包装)。

[2026-01-13 优化]
- 移除emoji，专业化输出
- 调整汽配大件物流阈值
"""

import pandas as pd
from .base import BaseDiagnostician


class LogisticsDiagnostician(BaseDiagnostician):

    def diagnose(self) -> pd.DataFrame:
        df = self.m_cur.copy()
        if df.empty: return df

        results = []
        for _, row in df.iterrows():
            tags, sugs = [], []

            # 提取核心指标
            combo = row.get("Combo", "Unknown")
            total_shipping_cost = row.get("原始邮费", 0)

            # 细分费用
            penalty = row.get("邮费罚款", 0)
            overpay = row.get("超支邮费", 0)
            return_ship = row.get("包邮退货邮费", 0)

            # 基础运费估算
            base_cost_pure = total_shipping_cost - penalty - overpay - return_ship

            # =========================================================
            # 1. 异常管控 (Cost Control)
            # =========================================================

            # 规则A: 罚款黑洞
            if base_cost_pure > 0 and (penalty / base_cost_pure) > 0.15:
                tags.append("[PENALTY] 罚款黑洞")
                sugs.append("尺寸/重量异常: 实际发货规格与申报严重不符，需复核仓库SOP。")

            # 规则B: 超支预警 (汽配调整: 大件超支阈值提高到$20)
            if overpay > 20:
                tags.append("[OVERPAY] 重量超支")
                sugs.append("渠道错配: 可能使用了不适合该重量段的物流服务。")

            # 规则C: 退货运费杀手
            if total_shipping_cost > 0 and return_ship > (total_shipping_cost * 0.25):
                tags.append("[RETURN-SHIP] 退货运费高")
                sugs.append("退货损耗: 大量物流费浪费在退货面单上。")

            # =========================================================
            # 2. 效益分析 (Efficiency)
            # =========================================================

            total_orders = row.get("原始单数", 0)
            avg_cost = total_shipping_cost / total_orders if total_orders > 0 else 0

            # 汽配调整: 大件物流阈值
            if avg_cost > 0:
                if avg_cost < 15:
                    tags.append("[SMALL] 小件")
                elif avg_cost > 80:
                    tags.append("[HEAVY] 大件物流")
                    sugs.append("大件运费: 确认物流折扣是否最优。")
                else:
                    tags.append("[NORMAL] 正常运费")

            if not tags:
                tags.append("[OK] 正常")

            results.append({
                "Combo组合": combo,
                "物流诊断": " | ".join(tags),
                "优化建议": " ".join(sugs) if sugs else "暂无",
                "总单量": int(total_orders),
                "总运费": round(total_shipping_cost, 5),
                "单均运费": round(avg_cost, 5),
                "罚款金额": round(penalty, 5),
                "超支金额": round(overpay, 5),
                "退货运费": round(return_ship, 5)
            })

        # 按总运费降序
        return pd.DataFrame(results).sort_values("总运费", ascending=False)

    @staticmethod
    def get_tag_definitions() -> list:
        return [
            "物流效益诊断说明 (eBay汽配版):",
            "=================================================================================",
            "1. [异常管控]:",
            "   - [PENALTY] 罚款黑洞: 罚款超过基础运费的15%，检查尺寸测量SOP。",
            "   - [OVERPAY] 重量超支: 存在>$20的补缴记录，需校准电子秤。",
            "   - [RETURN-SHIP] 退货运费高: 退货产生的面单费用占总运费25%以上。",
            "",
            "2. [类型标签] (汽配大件调整):",
            "   - [SMALL] 小件: 单均运费<$15。",
            "   - [NORMAL] 正常: 单均运费$15-$80。",
            "   - [HEAVY] 大件物流: 单均运费>$80，需重点关注物流渠道折扣。",
            "================================================================================="
        ]