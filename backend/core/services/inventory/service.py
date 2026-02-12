# core/services/inventory/service.py
"""
文件说明: 库存管理业务服务 (Inventory Service) - User Date Logic
主要功能:
1. 校验上传的库存 CSV 文件。
2. [Mod] 动态修改数据库表结构: 直接使用用户输入的日期 (YYYY-MM-DD) 作为列名。
3. 高性能批量同步库存数据。
4. 注册新 SKU。
"""

import pandas as pd
from typing import Tuple, List, Dict
from sqlalchemy import text
from sqlalchemy.types import Integer, String
# [Removed] 不需要 pandas.tseries.offsets 了

from backend.common.settings import settings
from core.components.db.client import DBClient
from core.sys.logger import get_logger
from core.sys.context import get_current_user
from core.services.inventory.repository import InventoryRepository


class InventoryService:

    def __init__(self):
        self.logger = get_logger("InventoryService")
        self.repo = InventoryRepository()
        self.table_inv = "Data_Inventory"

    def _normalize_date_str(self, date_val: str) -> str:
        """
        [Mod] 日期规范化 (忠实记录)
        直接将用户输入的日期转换为标准 ISO 格式 YYYY-MM-DD。
        不进行月末推算，以用户实际录入时间为准。
        """
        try:
            # 无论是 datetime 对象还是字符串，统一转为 YYYY-MM-DD
            dt = pd.to_datetime(str(date_val).strip())
            return dt.strftime("%Y-%m-%d")
        except Exception as e:
            self.logger.warning(f"日期格式化失败 [{date_val}]: {e}，回退使用原始值")
            return str(date_val)

    def validate_csv(self, file_path: str) -> Tuple[bool, List[str], pd.DataFrame]:
        """[校验] 检查上传的库存 CSV 文件"""
        self.logger.info(f"正在校验库存文件...")
        try:
            df = pd.read_csv(file_path, dtype=str, encoding='utf-8-sig', on_bad_lines='skip')
            df.columns = [str(c).strip().lower() for c in df.columns]

            sku_col = next((c for c in df.columns if 'sku' in c), None)
            qty_col = next((c for c in df.columns if any(k in c for k in ['qty', 'quantity', 'amount'])), None)

            if not sku_col or not qty_col:
                return False, ["CSV 格式错误: 未找到 'SKU' 或 'Quantity' 列"], pd.DataFrame()

            df = df[[sku_col, qty_col]].rename(columns={sku_col: 'SKU', qty_col: 'Quantity'})
            df['SKU'] = df['SKU'].astype(str).str.strip().str.upper()
            df = df[~df['SKU'].isin(['NAN', 'NONE', '', 'NULL'])]
            df['Quantity'] = pd.to_numeric(df['Quantity'], errors='coerce').fillna(0).astype(int)

            valid_skus = set(self.repo.get_valid_skus())
            upload_skus = set(df['SKU'].unique())

            unknown = list(upload_skus - valid_skus)

            if not unknown:
                return True, [], df
            else:
                return False, unknown, df

        except Exception as e:
            self.logger.error(f"库存文件读取失败: {e}")
            return False, [f"读取错误: {str(e)}"], pd.DataFrame()

    def sync_inventory_to_db(self, df: pd.DataFrame, target_date_input: str) -> str:
        """
        [执行] 同步库存
        :param target_date_input: 用户在 UI 选择的日期 (如 '2025-06-15')
        """
        if df.empty: return "数据为空，未执行。"

        user = get_current_user()

        # 1. [Mod] 仅做格式化，不做偏移
        norm_col_name = self._normalize_date_str(target_date_input)

        self.logger.info(f"开始同步库存: {target_date_input} -> 列名: [{norm_col_name}]",
                         extra={"action": "INVENTORY_SYNC", "user": user})

        # 2. 动态 DDL: 确保该日期列存在
        self._ensure_column_exists(norm_col_name)

        # 3. 写入数据
        temp_table = "Temp_Inventory_Upload"
        try:
            with DBClient.get_engine().begin() as conn:
                df.to_sql(temp_table, conn, if_exists='replace', index=False,
                          dtype={'SKU': String(100), 'Quantity': Integer()})

                # 统一 collation 以避免 JOIN 时的字符集冲突
                conn.execute(text(f"""
                    ALTER TABLE `{temp_table}` 
                    MODIFY COLUMN SKU VARCHAR(100) 
                    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
                """))

                # 更新目标列
                sql = text(f"""
                    UPDATE `{self.table_inv}` T1
                    INNER JOIN `{temp_table}` T2 ON T1.SKU = T2.SKU
                    SET T1.`{norm_col_name}` = T2.Quantity
                """)
                res = conn.execute(sql)
                updated_rows = res.rowcount

                conn.execute(text(f"DROP TABLE IF EXISTS `{temp_table}`"))

            msg = f"库存同步完成。数据已写入列 [{norm_col_name}]，更新了 {updated_rows} 条记录。"
            self.logger.info(msg)
            return msg

        except Exception as e:
            self.logger.error(f"库存同步失败: {e}")
            raise e

    def _ensure_column_exists(self, col_name: str):
        """检查数据库列是否存在，不存在则执行 ALTER TABLE"""
        sql = """
              SELECT COUNT(*) \
              FROM information_schema.COLUMNS
              WHERE TABLE_SCHEMA = :db \
                AND TABLE_NAME = :table \
                AND COLUMN_NAME = :col \
              """
        params = {"db": settings.DB_NAME, "table": self.table_inv, "col": col_name}

        exists = DBClient.read_df(sql, params).iloc[0, 0] > 0

        if not exists:
            self.logger.info(f"Schema 自动扩展: 添加列 [{col_name}]")
            # 确保列名被反引号包裹，防止特殊字符报错
            safe_col = f"`{col_name.replace('`', '')}`"
            DBClient.execute_stmt(f"ALTER TABLE `{self.table_inv}` ADD COLUMN {safe_col} INT DEFAULT 0")

    def register_sku(self, sku_data: Dict) -> bool:
        try:
            cost = float(sku_data.get('Cost', 0))
            freight = float(sku_data.get('Freight', 0))
            sku_data['Cog'] = round(cost + freight, 5)
            sku_data['SKU'] = str(sku_data['SKU']).strip().upper()

            self.repo.create_sku_transactional(sku_data)
            self.logger.info(f"新 SKU 注册成功: {sku_data['SKU']}")
            return True
        except Exception as e:
            self.logger.error(f"SKU 注册失败: {e}")
            raise e