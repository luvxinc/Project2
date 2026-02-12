# core/services/inventory/repository.py
"""
文件说明: 库存与档案数据仓库 (Inventory Repository)
主要功能:
1. 负责 Data_COGS (档案) 和 Data_Inventory (库存) 的 CRUD 操作。
2. 提供 "获取最新库存月份" 的智能逻辑。
3. 提供原子性的 SKU 创建接口。
"""

from typing import List, Dict, Any, Optional
import pandas as pd
from sqlalchemy import text

from core.components.db.client import DBClient


class InventoryRepository:

    def get_all_cogs(self) -> pd.DataFrame:
        """获取所有 SKU 的成本信息 (用于利润计算) - 静态成本表"""
        return DBClient.read_df("SELECT * FROM Data_COGS")

    def get_fifo_avg_cost(self) -> pd.DataFrame:
        """
        [FIFO] 获取所有 SKU 的加权平均成本
        计算方式: SUM(qty_remaining × landed_price) / SUM(qty_remaining)
        Returns: DataFrame with columns [SKU, AvgCost]
        """
        sql = """
            SELECT 
                f.sku as SKU,
                CASE 
                    WHEN SUM(f.qty_remaining) > 0 
                    THEN SUM(f.qty_remaining * COALESCE(p.landed_price_usd, f.unit_cost)) / SUM(f.qty_remaining)
                    ELSE 0 
                END as AvgCost
            FROM in_dynamic_fifo_layers f
            LEFT JOIN in_dynamic_landed_price p 
                ON f.sku = p.sku AND f.po_num = p.po_num
            WHERE f.qty_remaining > 0
            GROUP BY f.sku
        """
        return DBClient.read_df(sql)

    def get_pending_and_transit_qty(self) -> pd.DataFrame:
        """
        [动态库存] 获取所有 SKU 的 已定未发 和 在途未到 数量
        - order_qty: 已定未发 = PO数量 - 已发货数量
        - transit_qty: 在途未到 = 已发货数量 - 已收货数量
        Returns: DataFrame with columns [SKU, order_qty, transit_qty]
        """
        sql = """
            WITH po_data AS (
                SELECT po_sku as SKU, SUM(po_quantity) as po_qty
                FROM in_po_final
                GROUP BY po_sku
            ),
            sent_data AS (
                SELECT po_sku as SKU, SUM(sent_quantity) as sent_qty
                FROM in_send_final
                GROUP BY po_sku
            ),
            recv_data AS (
                SELECT po_sku as SKU, SUM(receive_quantity) as recv_qty
                FROM in_receive_final
                GROUP BY po_sku
            )
            SELECT 
                p.SKU,
                GREATEST(0, COALESCE(p.po_qty, 0) - COALESCE(s.sent_qty, 0)) as order_qty,
                GREATEST(0, COALESCE(s.sent_qty, 0) - COALESCE(r.recv_qty, 0)) as transit_qty
            FROM po_data p
            LEFT JOIN sent_data s ON p.SKU = s.SKU
            LEFT JOIN recv_data r ON p.SKU = r.SKU
        """
        return DBClient.read_df(sql)

    def get_historical_volatility(self, months: int = 12) -> pd.DataFrame:
        """
        [企业级] 计算每个 SKU 的历史销售波动率 (标准差)
        基于最近 N 个月的月销量数据
        Returns: DataFrame with columns [SKU, AvgMonthly, StdMonthly, CV]
        - AvgMonthly: 月均销量
        - StdMonthly: 月销量标准差
        - CV: 变异系数 (Coefficient of Variation) = std/avg
        """
        sql = f"""
            WITH monthly_sales AS (
                SELECT 
                    sku1 as SKU,
                    DATE_FORMAT(`order date`, '%Y-%m') as month,
                    SUM(quantity) as qty
                FROM Data_Clean_Log
                WHERE `order date` >= DATE_SUB(CURDATE(), INTERVAL {months} MONTH)
                GROUP BY sku1, DATE_FORMAT(`order date`, '%Y-%m')
            )
            SELECT 
                SKU,
                AVG(qty) as AvgMonthly,
                STDDEV(qty) as StdMonthly,
                CASE 
                    WHEN AVG(qty) > 0 THEN STDDEV(qty) / AVG(qty)
                    ELSE 0 
                END as CV
            FROM monthly_sales
            GROUP BY SKU
        """
        return DBClient.read_df(sql)

    def get_sku_moq(self) -> pd.DataFrame:
        """
        [企业级] 获取每个 SKU 的最小订货量 (MOQ)
        Returns: DataFrame with columns [SKU, MOQ]
        """
        return DBClient.read_df("SELECT SKU, COALESCE(MOQ, 100) as MOQ FROM Data_COGS")

    def get_valid_skus(self) -> List[str]:
        """获取系统内所有有效的 SKU 列表 (用于校验和纠错)"""
        df = DBClient.read_df("SELECT DISTINCT SKU FROM Data_COGS")
        if df.empty:
            return []
        # 归一化：去空、大写
        return df["SKU"].dropna().astype(str).str.strip().str.upper().tolist()

    def get_inventory_latest(self) -> pd.DataFrame:
        """
        [智能逻辑] 获取当前最新的库存数据
        逻辑：扫描 Data_Inventory 表结构，找到所有类似 'YYYY-MM' 的列，取最大的一个。
        """
        # 1. 读表结构 (只读0行，极快)
        schema_df = DBClient.read_df("SELECT * FROM Data_Inventory LIMIT 0")

        # 2. 筛选包含 '-' 的列 (假设月份列格式为 2025-10)
        date_cols = [c for c in schema_df.columns if '-' in str(c)]

        if not date_cols:
            # 如果没有月份列，返回仅包含 SKU 的空表
            return pd.DataFrame(columns=["SKU", "Quantity"])

        # 3. 排序取最新
        latest_col = sorted(date_cols)[-1]

        # 4. 动态构造查询
        # 注意：列名必须加反引号，防止 '2025-10' 被识别为减法
        sql = f"SELECT SKU, `{latest_col}` as Quantity FROM Data_Inventory"
        return DBClient.read_df(sql)

    def get_distinct_values(self, column: str) -> List[str]:
        """获取分类下拉选项 (Category, SubCategory, Type)"""
        allowed = ['Category', 'SubCategory', 'Type']
        if column not in allowed:
            return []

        sql = f"SELECT DISTINCT `{column}` FROM Data_COGS WHERE `{column}` IS NOT NULL AND `{column}` != '' ORDER BY `{column}`"
        df = DBClient.read_df(sql)
        return df[column].tolist()

    def create_sku_transactional(self, sku_data: dict) -> bool:
        """
        [原子事务] 创建新 SKU
        必须同时在 Data_COGS 插入档案，并在 Data_Inventory 插入库存行 (历史月份填0)。
        """
        try:
            with DBClient.atomic_transaction() as conn:
                # 1. 插入 Data_COGS
                cols = ", ".join(sku_data.keys())
                params_str = ", ".join([f":{k}" for k in sku_data.keys()])
                sql_cogs = text(f"INSERT INTO Data_COGS ({cols}) VALUES ({params_str})")
                conn.execute(sql_cogs, sku_data)

                # 2. 插入 Data_Inventory (自动补全历史月份为 0)
                # 先获取当前 Inventory 表的所有列
                schema_df = pd.read_sql("SELECT * FROM Data_Inventory LIMIT 0", conn)
                inv_cols = schema_df.columns.tolist()

                # 构造插入值
                inv_vals = []
                for col in inv_cols:
                    if col.upper() == 'SKU':
                        inv_vals.append(f"'{sku_data['SKU']}'")
                    else:
                        inv_vals.append("0")  # 历史月份默认填 0

                col_str = ", ".join([f"`{c}`" for c in inv_cols])
                val_str = ", ".join(inv_vals)

                sql_inv = text(f"INSERT INTO Data_Inventory ({col_str}) VALUES ({val_str})")
                conn.execute(sql_inv)

            return True
        except Exception as e:
            # 异常会向上传递，由 Service 层捕获记录日志
            raise e