# File: backend/core/services/finance/base.py
"""
# ==============================================================================
# 模块名称: 利润分析通用基类 (Profit Analyzer Base) - V3.0 Enterprise
# ==============================================================================
#
# [Purpose / 用途]
# 继承自 DataProcessingService，复用标准化的 I/O 和日志能力。
#
# [Architecture / 架构]
# - Layer: Domain Service (Base)
# - Parent: DataProcessingService
# - Children: CRM, Logistics, ProfitService
#
# ==============================================================================
"""

import pandas as pd
from typing import List, Tuple, Dict, Any, Optional
from datetime import date

from backend.common.settings import settings
from backend.core.services.data_processing import DataProcessingService
from backend.core.services.etl.repository import ETLRepository
from backend.core.services.inventory.repository import InventoryRepository

class ProfitAnalyzerBase(DataProcessingService):
    # 费用列定义
    FEE_COLUMNS = [
        "Shipping and handling", "Refund Shipping and handling",
        "Seller collected tax", "eBay collected tax",
        "Refund Seller collected tax", "Refund eBay collected tax",
        "Final Value Fee - fixed", "Final Value Fee - variable",
        "Regulatory operating fee", "International fee",
        "Charity donation", "Deposit processing fee",
        "Refund Final Value Fee - fixed", "Refund Final Value Fee - variable",
        "Refund Regulatory operating fee", "Refund International fee",
        "Refund Charity donation", "Refund Deposit processing fee",
        'Very high "item not as described" fee', 'Refund Very high "item not as described" fee',
        "Below standard performance fee", "Refund Below standard performance fee",
        "Payments dispute fee", "Promoted Listings fee", "Refund Promoted Listings fee",
        "Shipping label-Earning data", "Shipping label-Return"
    ]

    PLATFORM_FEE_GROUP = {
        "Final Value Fee - fixed", "Final Value Fee - variable",
        "Regulatory operating fee", "International fee",
        "Charity donation", "Deposit processing fee",
        "Refund Final Value Fee - fixed", "Refund Final Value Fee - variable",
        "Refund Regulatory operating fee", "Refund International fee",
        "Refund Charity donation", "Refund Deposit processing fee"
    }

    def __init__(self, start_date: date, end_date: date, file_suffix: str = ""):
        # 调用父类初始化 (自动处理 Logger 和 Output Dir)
        super().__init__(file_suffix=file_suffix)
        
        self.start_date = start_date
        self.end_date = end_date
        
        # 实例化仓库
        self.etl_repo = ETLRepository()
        self.inv_repo = InventoryRepository()

        self.sku_cost_map = {}
        self.df_cur = pd.DataFrame()
        self.df_prev = pd.DataFrame()

    def save_csv(self, df: pd.DataFrame, filename: str, footer: List[str] = None) -> str:
        """
        [兼容性封装] 代理到父类的 save_csv_atomic
        """
        return self.save_csv_atomic(df, filename, footer)

    def _clean_data(self, df: pd.DataFrame) -> pd.DataFrame:
        if df.empty: return df
        
        # 1. 业务特定的排除逻辑
        exclude = {"action", "order date", "seller", "order number", "item id", "item title", "buyer username",
                   "full sku"}
        
        # 2. 识别需要转换的列
        cols_to_convert = []
        for col in df.columns:
            if str(col).lower().startswith("sku"): continue
            if col in exclude: continue
            cols_to_convert.append(col)
            
        # 3. 使用父类的高性能清洗
        return self.clean_numeric_cols(df, cols_to_convert)

    def _load_basics(self):
        """
        加载基础数据
        
        [2026-01-13 优化] 成本来源优先级 (FIFO四表架构):
        1. in_dynamic_landed_price (完整landed成本，含物流费用分摊) - 最准确
        2. in_dynamic_fifo_layers (原始采购价 unit_cost) - 次选
        3. DATA_COGS (固定成本 Cog) - 回退默认值
        """
        from core.components.db.client import DBClient
        
        # ========== 1. 加载 landed_price (最完整的成本) ==========
        self.log("正在加载 FIFO landed_price (in_dynamic_landed_price)...")
        
        # 计算每个SKU的加权平均landed成本
        # 使用 in_dynamic_fifo_layers 和 in_dynamic_landed_price 联合查询
        df_landed = DBClient.read_df("""
            SELECT 
                f.sku,
                CASE 
                    WHEN SUM(f.qty_remaining) > 0 
                    THEN SUM(f.qty_remaining * COALESCE(p.landed_price_usd, f.unit_cost)) / SUM(f.qty_remaining)
                    ELSE 0 
                END as avg_cost
            FROM in_dynamic_fifo_layers f
            LEFT JOIN in_dynamic_landed_price p 
                ON f.sku = p.sku AND f.po_num = p.po_num
            WHERE f.qty_remaining > 0
            GROUP BY f.sku
        """)
        
        fifo_cost_map = {}
        if not df_landed.empty:
            fifo_cost_map = {
                str(k).strip().upper(): float(v) if pd.notna(v) and float(v) > 0 else 0.0
                for k, v in zip(df_landed["sku"], df_landed["avg_cost"])
            }
            self.log(f"  FIFO landed成本: {len(fifo_cost_map)} 个 SKU")
        
        # ========== 2. 加载 DATA_COGS 作为回退 ==========
        self.log("正在加载 DATA_COGS 固定成本 (作为回退)...")
        df_cogs = self.inv_repo.get_all_cogs()
        cogs_cost_map = {
            str(k).strip().upper(): pd.to_numeric(v, errors='coerce')
            for k, v in zip(df_cogs["SKU"], df_cogs["Cog"])
        }
        self.log(f"  DATA_COGS 成本: {len(cogs_cost_map)} 个 SKU")
        
        # ========== 3. 合并: FIFO 优先，DATA_COGS 回退 ==========
        self.sku_cost_map = {}
        all_skus = set(fifo_cost_map.keys()) | set(cogs_cost_map.keys())
        
        fifo_count = 0
        cogs_count = 0
        for sku in all_skus:
            if sku in fifo_cost_map and fifo_cost_map[sku] > 0:
                self.sku_cost_map[sku] = fifo_cost_map[sku]
                fifo_count += 1
            elif sku in cogs_cost_map:
                cost = cogs_cost_map[sku]
                self.sku_cost_map[sku] = cost if pd.notna(cost) else 0.0
                cogs_count += 1
        
        self.log(f"  成本来源统计: FIFO={fifo_count}, DATA_COGS={cogs_count}, 总计={len(self.sku_cost_map)}")

        # ========== 4. 加载交易数据 ==========
        self.log(f"正在加载本期数据: {self.start_date} -> {self.end_date}")
        self.df_cur = self._clean_data(self.etl_repo.get_transactions_by_date(self.start_date, self.end_date))

        end_dt = pd.to_datetime(self.end_date)
        start_dt = pd.to_datetime(self.start_date)
        delta = end_dt - start_dt
        prev_end = start_dt - pd.Timedelta(days=1)
        prev_start = prev_end - delta

        self.log(f"正在加载上期数据: {prev_start.date()} -> {prev_end.date()}")
        self.df_prev = self._clean_data(self.etl_repo.get_transactions_by_date(prev_start.date(), prev_end.date()))
        if self.df_prev.empty:
            self.log("⚠️ 上期数据为空，环比将无法计算。")

    def _accumulate_fees(self, row: dict, metrics_dict: dict, key: str, weight: float = 1.0):
        for col in self.FEE_COLUMNS:
            val = float(row.get(col, 0))
            if val != 0:
                metrics_dict[key][col] += val * weight

    # =========================================================================
    # [重构优化] 以下公共方法从子类提取，消除重复代码
    # =========================================================================

    def _accumulate_action_metrics(self, metrics: dict, key: str, action: str, 
                                   qty: float, revenue: float, refund: float, weight: float = 1.0):
        """
        [公共方法] 累加 action 相关的数量和金额指标
        从 profit_sku.py/profit_listing.py/profit_combo.py 精确提取
        
        Args:
            metrics: 累加目标字典
            key: 聚合键 (SKU/Item ID/Full SKU)
            action: 动作类型 (CA/RE/CR/CC/PD)
            qty: 数量
            revenue: 收入
            refund: 退款金额
            weight: 分摊权重 (SKU级分析需要, Listing/Combo级为1.0)
        """
        # 累加数量
        metrics[key]["total_qty"] += qty
        if action == "CA":
            metrics[key]["cancel_qty"] += qty
        elif action == "RE":
            metrics[key]["return_qty"] += qty
        elif action == "CR":
            metrics[key]["request_qty"] += qty
        elif action == "CC":
            metrics[key]["claim_qty"] += qty
        elif action == "PD":
            metrics[key]["dispute_qty"] += qty

        # 累加金额 (按权重)
        metrics[key]["total_rev"] += revenue * weight
        if action == "CA":
            metrics[key]["cancel_rev"] += refund * weight
        elif action == "RE":
            metrics[key]["return_rev"] += refund * weight
        elif action == "CR":
            metrics[key]["request_rev"] += refund * weight
        elif action == "CC":
            metrics[key]["claim_rev"] += refund * weight
        elif action == "PD":
            metrics[key]["dispute_rev"] += refund * weight

    def _calculate_row_cost(self, row: dict, qty_sets: int, include_special_sku: bool = False) -> float:
        """
        [公共方法] 计算单行的总成本
        从 profit_listing.py/profit_combo.py 精确提取
        
        Args:
            row: 数据行字典
            qty_sets: 套数 (quantity 字段值)
            include_special_sku: 是否包含特殊SKU成本逻辑 (NU1C8E51C/K)
        
        Returns:
            float: 该行的总成本 (正值)
        """
        total_cost = 0.0
        for i in range(1, 11):
            s_key, q_key = f"sku{i}", f"qty{i}"
            if s_key not in row:
                break
            
            raw_sku = str(row.get(s_key, ""))
            if not raw_sku or raw_sku.lower() in ['nan', 'none', '0', '']:
                continue
            sku = raw_sku.strip().upper()
            
            try:
                q_per = float(row.get(q_key, 0))
            except:
                q_per = 0
            
            unit_cost = self.sku_cost_map.get(sku, 0.0)
            total_cost += (unit_cost * q_per * qty_sets)
            
            # 特殊 SKU 成本逻辑 (精确复制自 profit_listing.py:82-84)
            if include_special_sku and sku in ["NU1C8E51C", "NU1C8E51K"]:
                extra_cost = self.sku_cost_map.get("NU1C8SKT7", 0.0)
                total_cost += (extra_cost * 2 * qty_sets)
        
        return total_cost

    def save_multi_table_csv(self, filename: str, tables: list, footer_lines: list = None) -> str:
        """
        [公共方法] 保存多表格到单个CSV文件
        从 profit_sku.py/profit_listing.py/profit_combo.py 精确提取
        
        Args:
            filename: 文件名
            tables: [(表名, DataFrame), ...] 列表
            footer_lines: 可选的尾部说明行
        
        Returns:
            str: 保存路径，失败返回 None
        """
        save_path = self.save_csv(pd.DataFrame(), filename)
        if not save_path:
            return None
        
        try:
            with open(save_path, "w", encoding="utf-8-sig") as f:
                for name, df in tables:
                    f.write(f"=== {name} ===\n")
                    df.to_csv(f, index=False)
                    f.write("\n\n")
                
                if footer_lines:
                    f.write("\n")
                    for line in footer_lines:
                        f.write(f"{line}\n")
            
            return save_path
        except Exception as e:
            self.log(f"❌ 保存文件失败: {e}")
            return None

    def _calculate_net_profit(self, metrics: dict) -> dict:
        R = settings.LOSS_RATES
        for k, m in metrics.items():
            m["net_qty"] = (
                    m["total_qty"]
                    - m.get("cancel_qty", 0)
                    - m.get("return_qty", 0) * R.get('RETURN', 0.3)
                    - m.get("request_qty", 0) * R.get('REQUEST', 0.5)
                    - m.get("claim_qty", 0) * R.get('CASE', 0.6)
                    - m.get("dispute_qty", 0) * R.get('DISPUTE', 1.0)
            )
            m["net_rev"] = (
                    m["total_rev"] + m.get("cancel_rev", 0) + m.get("return_rev", 0) +
                    m.get("request_rev", 0) + m.get("claim_rev", 0) + m.get("dispute_rev", 0)
            )
            m["net_shipping"] = m.get("Shipping and handling", 0) + m.get("Refund Shipping and handling", 0)
            m["net_tax"] = (
                    m.get("Seller collected tax", 0) + m.get("eBay collected tax", 0) +
                    m.get("Refund Seller collected tax", 0) + m.get("Refund eBay collected tax", 0)
            )
            m["net_platform_fee"] = sum(v for field, v in m.items() if field in self.PLATFORM_FEE_GROUP)
            m["net_high_return_fee"] = m.get('Very high "item not as described" fee', 0) + m.get(
                'Refund Very high "item not as described" fee', 0)
            m["net_low_rating_fee"] = m.get("Below standard performance fee", 0) + m.get(
                "Refund Below standard performance fee", 0)
            m["net_third_party_fee"] = m.get("Payments dispute fee", 0)
            m["net_ad_fee"] = m.get("Promoted Listings fee", 0) + m.get("Refund Promoted Listings fee", 0)
            m["net_postage_cost"] = m.get("Shipping label-Earning data", 0)
            m["net_return_postage"] = m.get("Shipping label-Return", 0)

            m["profit"] = (
                    m["net_rev"] + m["cog_value"] + m["net_shipping"] +
                    m["net_platform_fee"] + m["net_high_return_fee"] + m["net_low_rating_fee"] +
                    m["net_third_party_fee"] + m["net_ad_fee"] + m["net_postage_cost"] + m["net_return_postage"]
            )
        return metrics

    def generate_full_report_suite(self, m_cur: dict, m_prev: dict, key_name: str) -> List[Tuple[str, pd.DataFrame]]:
        map_a = {"总销量": "total_qty", "总取消数": "cancel_qty", "总退货数(无平台介入)": "return_qty",
                 "总退货数(平台介入)": "request_qty", "总退货数(平台强制退款)": "claim_qty",
                 "强制退货(仅退款)": "dispute_qty", "净销售": "net_qty"}
        map_b = {"总销售额": "total_rev", "总取消额": "cancel_rev", "总退货额(无平台介入)": "return_rev",
                 "总退货额(平台介入)": "request_rev", "总退货额(平台强制退款)": "claim_rev",
                 "强制退款(仅退款)": "dispute_rev", "净销售": "net_rev", "净销售产品成本": "cog_value",
                 "净买家支付邮费": "net_shipping", "净销售税": "net_tax", "净固定平台费用": "net_platform_fee",
                 "净高退货产品罚款": "net_high_return_fee", "净低账户评级罚款": "net_low_rating_fee",
                 "净第三方投诉罚款": "net_third_party_fee", "净广告开销": "net_ad_fee",
                 "退货包邮费用": "net_return_postage", "净邮费支出": "net_postage_cost", "盈亏": "profit"}

        def build_df(mets, mapping):
            data = []
            for k in sorted(mets.keys()):
                row = {key_name: k}
                for label, field in mapping.items(): row[label] = round(mets[k].get(field, 0), 2)
                data.append(row)
            return pd.DataFrame(data) if data else pd.DataFrame(columns=[key_name] + list(mapping.keys()))

        df_a1 = build_df(m_cur, map_a)
        df_pa1 = build_df(m_prev, map_a)
        df_a2 = self._format_pct(self._calc_pct(df_a1, "总销量"))
        df_a3 = self._calc_mom(self._calc_pct(df_a1, "总销量"), self._calc_pct(df_pa1, "总销量"), key_name)
        df_b1 = build_df(m_cur, map_b)
        df_pb1 = build_df(m_prev, map_b)
        df_b2 = self._format_pct(self._calc_pct(df_b1, "总销售额"))
        df_b3 = self._calc_mom(self._calc_pct(df_b1, "总销售额"), self._calc_pct(df_pb1, "总销售额"), key_name)

        return [("A1_数量表", df_a1), ("A2_数量占比表", df_a2), ("A3_数量结构环比表", df_a3),
                ("B1_金额表", df_b1), ("B2_金额占比表", df_b2), ("B3_费用结构环比表", df_b3)]

    def _calc_pct(self, df, base_col):
        res = df.copy()
        if res.empty: return res
        for c in res.columns[1:]:
            if c != base_col: res[c] = res.apply(lambda r: 0 if r[base_col] == 0 else r[c] / r[base_col], axis=1)
        if base_col in res.columns: res[base_col] = 1.0
        return res

    def _format_pct(self, df):
        res = df.copy()
        if res.empty: return res
        for c in res.columns[1:]:
            if pd.api.types.is_numeric_dtype(res[c]): res[c] = res[c].apply(lambda x: f"{x:.2%}")
        return res

    def _calc_mom(self, cur, prev, key):
        res = cur.copy()
        if prev.empty or key not in prev.columns:
            for c in res.columns:
                if c != key: res[c] = "New"
            return res
        prev_map = prev.set_index(key)
        for idx in res.index:
            k_val = res.at[idx, key]
            for c in res.columns:
                if c == key: continue
                if k_val in prev_map.index and c in prev_map.columns:
                    try:
                        v1 = float(str(res.at[idx, c]).strip('%'))
                        v0 = float(str(prev_map.at[k_val, c]).strip('%'))
                        if v0 == 0:
                            res.at[idx, c] = "N/A"
                        else:
                            res.at[idx, c] = f"{(v1 - v0) / abs(v0):.2%}"
                    except:
                        res.at[idx, c] = "-"
                else:
                    res.at[idx, c] = "New"
        return res

    def run(self):
        pass

    def _aggregate(self, df):
        return {}