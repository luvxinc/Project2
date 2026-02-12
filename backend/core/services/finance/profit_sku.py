# File: backend/core/services/finance/profit_sku.py
"""
# ==============================================================================
# 模块名称: SKU 级利润分析器 (SKU Profit Analyzer)
# ==============================================================================
#
# [Purpose / 用途]
# 计算 SKU 维度的净利润、退货率、广告占比等关键指标。
# 继承 ProfitAnalyzerBase 使用这一层的标准化 I/O。
#
# [Architecture / 架构]
# - Layer: Domain Service (Finance)
# - Parent: ProfitAnalyzerBase
# - Dependency: SkuDiagnostician
#
# ==============================================================================
"""

import os
import pandas as pd
from collections import defaultdict
# Note: tqdm removed - blocks in web request context

from backend.core.services.finance.base import ProfitAnalyzerBase
from backend.core.services.diagnostics.sku import SkuDiagnostician


class SkuProfitAnalyzer(ProfitAnalyzerBase):

    def _aggregate(self, df: pd.DataFrame) -> dict:
        """[核心逻辑] 数据聚合与分摊"""
        metrics = defaultdict(lambda: defaultdict(float))
        if df.empty: return metrics

        records = df.to_dict('records')
        for row in records:  # No tqdm - web request context
            qty_sets = int(float(row.get("quantity", 0)))
            action = str(row.get("action", "")).strip().upper()
            revenue = float(row.get("revenue", 0))
            refund = float(row.get("Refund", 0))

            # 1. 解析当前行包含的所有 SKU 及其价值
            current_sku_units = {}
            current_sku_value = {}
            order_total_cost_val = 0.0

            for i in range(1, 11):
                s_key = f"sku{i}"
                q_key = f"qty{i}"
                if s_key not in row: break

                # 归一化去重
                raw_sku = str(row.get(s_key, ""))
                if not raw_sku or raw_sku.lower() in ['nan', 'none', '0', '']: continue
                sku = raw_sku.strip().upper()

                try:
                    per_qty = float(row.get(q_key, 0))
                except:
                    per_qty = 0

                units = per_qty * qty_sets
                unit_cost = self.sku_cost_map.get(sku, 0.0)
                val = units * unit_cost  # 货值 = 数量 * 成本

                current_sku_units[sku] = units
                current_sku_value[sku] = val
                order_total_cost_val += val

            if not current_sku_units: continue

            # 防御：如果总成本为0（例如全是赠品），按数量均摊
            if order_total_cost_val == 0:
                total_units = sum(current_sku_units.values())
                for s, u in current_sku_units.items():
                    # 价值权重退化为数量权重
                    current_sku_value[s] = u
                order_total_cost_val = total_units

            # 2. 分摊计算
            for sku, units in current_sku_units.items():
                # 计算分摊权重 (Weight)
                w = 0.0
                if order_total_cost_val > 0:
                    w = current_sku_value[sku] / order_total_cost_val

                # 累加数量
                metrics[sku]["total_qty"] += units
                if action == "CA":
                    metrics[sku]["cancel_qty"] += units
                elif action == "RE":
                    metrics[sku]["return_qty"] += units
                elif action == "CR":
                    metrics[sku]["request_qty"] += units
                elif action == "CC":
                    metrics[sku]["claim_qty"] += units
                elif action == "PD":
                    metrics[sku]["dispute_qty"] += units

                # 累加金额 (按权重)
                metrics[sku]["total_rev"] += revenue * w
                if action == "CA":
                    metrics[sku]["cancel_rev"] += refund * w
                elif action == "RE":
                    metrics[sku]["return_rev"] += refund * w
                elif action == "CR":
                    metrics[sku]["request_rev"] += refund * w
                elif action == "CC":
                    metrics[sku]["claim_rev"] += refund * w
                elif action == "PD":
                    metrics[sku]["dispute_rev"] += refund * w

                # 累加成本 (直接计算，不分摊)
                unit_cost = self.sku_cost_map.get(sku, 0.0)
                metrics[sku]["cog_value"] += -(unit_cost * units)  # 成本是负支出

                # 累加各项费用 (调用基类 Helper)
                self._accumulate_fees(row, metrics, sku, weight=w)

        return metrics

    def run(self):
        """主执行流程"""
        from core.components.db.client import DBClient
        
        # 1. 加载数据
        self._load_basics()

        if self.df_cur is None or self.df_cur.empty:
            self.log("⚠️ 本期无数据，无法分析")
            return

        self.log(f"📊 已加载原始记录: {len(self.df_cur)} 条")

        # 2. 聚合
        self.log("正在聚合本期数据...")
        m_cur = self._calculate_net_profit(self._aggregate(self.df_cur))

        self.log("正在聚合上期数据(用于环比)...")
        m_prev = self._calculate_net_profit(self._aggregate(self.df_prev))

        # 3. 生成基础报表
        tables = self.generate_full_report_suite(m_cur, m_prev, key_name="SKU")

        # 4. 执行诊断
        self.log("正在执行 AI 智能诊断...")

        # 获取库存数据用于 DOS 计算
        df_inv = self.inv_repo.get_inventory_latest()
        if df_inv.empty:
            inv_map = {}
        else:
            inv_map = dict(zip(
                df_inv["SKU"].astype(str).str.strip().str.upper(),
                pd.to_numeric(df_inv["Quantity"], errors='coerce').fillna(0)
            ))

        # [2026-01-13] 获取在途数和订货数用于供应链分析
        self.log("正在计算在途数和订货数...")
        
        # PO订单
        po_df = DBClient.read_df("""
            SELECT po_sku, SUM(po_quantity) as qty
            FROM in_po_final
            GROUP BY po_sku
        """)
        
        # 已发货
        sent_df = DBClient.read_df("""
            SELECT po_sku, SUM(sent_quantity) as qty
            FROM in_send_final
            GROUP BY po_sku
        """)
        
        # 已收货
        recv_df = DBClient.read_df("""
            SELECT po_sku, SUM(receive_quantity) as qty
            FROM in_receive_final
            GROUP BY po_sku
        """)
        
        po_map = {}
        if not po_df.empty:
            po_map = dict(zip(
                po_df['po_sku'].astype(str).str.strip().str.upper(),
                po_df['qty']
            ))
        
        sent_map_total = {}
        if not sent_df.empty:
            sent_map_total = dict(zip(
                sent_df['po_sku'].astype(str).str.strip().str.upper(),
                sent_df['qty']
            ))
        
        recv_map_total = {}
        if not recv_df.empty:
            recv_map_total = dict(zip(
                recv_df['po_sku'].astype(str).str.strip().str.upper(),
                recv_df['qty']
            ))
        
        # 计算在途数和订货数
        order_map = {}   # 下订数 = PO - Sent
        transit_map = {} # 在途数 = Sent - Received
        
        all_skus = set(po_map.keys()) | set(sent_map_total.keys()) | set(recv_map_total.keys())
        for sku in all_skus:
            po_qty = int(po_map.get(sku, 0) or 0)
            sent_qty = int(sent_map_total.get(sku, 0) or 0)
            recv_qty = int(recv_map_total.get(sku, 0) or 0)
            
            order_map[sku] = max(0, po_qty - sent_qty)
            transit_map[sku] = max(0, sent_qty - recv_qty)

        diagnostician = SkuDiagnostician(m_cur, m_prev, inv_map, order_map, transit_map)
        df_diag = diagnostician.diagnose()

        tables.append(("C1_智能诊断表 (AI Diagnostics)", df_diag))
        explanation_lines = diagnostician.get_tag_definitions()

        # 5. 保存 [重构优化: 使用基类公共方法]
        filename = f"Profit_Analysis_SKU_{self.file_suffix}.csv"

        save_path = self.save_multi_table_csv(filename, tables, explanation_lines)
        if save_path:
            self.log(f"✅ SKU 利润与诊断报表已生成: {filename}")