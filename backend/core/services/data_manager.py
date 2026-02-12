# core/services/data_manager.py
"""
文件说明: 数据修改中心业务服务 (Data Manager Service) - V5.0 Smart Update
主要功能:
1. 库存修改: 读取/单点修改/整列删除 (含审计)。
2. [Mod] 档案精准维护: 使用 DiffEngine 识别变更，仅更新受影响行，记录精准日志。
3. [New] SKU 新增: 原子化创建 SKU 档案及库存记录。
"""

import pandas as pd
from typing import List, Tuple, Any, Dict
from sqlalchemy import text

from backend.common.settings import settings
from core.components.db.client import DBClient
from core.sys.logger import get_logger, get_audit_logger
from core.sys.context import get_current_user
from core.components.utils.diff_engine import DiffEngine  # [New] 引入差异引擎

IMMUTABLE_MARKER = "[[SECURITY_AUDIT]]"


class DataManager:

    def __init__(self):
        self.db = DBClient()
        self.logger = get_logger("DataManager")
        self.audit_logger = get_audit_logger()
        self.table_inv = "Data_Inventory"
        self.table_inv = "Data_Inventory"
        self.table_cogs = "Data_COGS"

    def _validate_weight(self, val: Any) -> int:
        """[Validation] Ensure Weight is an integer"""
        if val is None or str(val).strip() == "":
            return 0
        try:
            f_val = float(val)
            if not f_val.is_integer():
                raise ValueError(f"Weight '{val}' must be an integer (no decimals).")
            return int(f_val)
        except ValueError as e:
            if "must be an integer" in str(e): raise e
            raise ValueError(f"Weight '{val}' is not a valid integer.")

    # =========================================================================
    # 库存管理 (Inventory) - 保持不变
    # =========================================================================

    def get_inventory_columns(self) -> List[str]:
        try:
            df = self.db.read_df(f"SELECT * FROM `{self.table_inv}` LIMIT 0")
            cols = [c for c in df.columns if c.lower() not in ['id', 'sku', 'created_at', 'updated_at']]
            return sorted(cols, reverse=True)
        except Exception as e:
            self.logger.error(f"获取库存列失败: {e}")
            return []

    def get_all_skus(self) -> List[str]:
        try:
            df = self.db.read_df(f"SELECT DISTINCT SKU FROM `{self.table_inv}` ORDER BY SKU")
            return df["SKU"].dropna().astype(str).tolist()
        except Exception:
            return []

    def get_inventory_value(self, date_col: str, sku: str) -> int:
        try:
            sql = f"SELECT `{date_col}` FROM `{self.table_inv}` WHERE SKU = :sku"
            df = self.db.read_df(sql, {"sku": sku})
            if df.empty: return 0
            val = df.iloc[0, 0]
            return int(float(val)) if pd.notna(val) else 0
        except Exception:
            return 0

    def update_inventory_qty(self, date_col: str, sku: str, new_qty: int) -> Tuple[bool, str]:
        user = get_current_user()
        old_qty = self.get_inventory_value(date_col, sku)
        if old_qty == new_qty: return True, "数值未变化。"

        try:
            sql = f"UPDATE `{self.table_inv}` SET `{date_col}` = :qty WHERE SKU = :sku"
            success = self.db.execute_stmt(sql, {"qty": new_qty, "sku": sku})
            if success:
                msg = f"库存修正: {sku} [{date_col}] | {old_qty} -> {new_qty}"
                self.logger.warning(msg, extra={"action": "UPDATE_INVENTORY", "user": user})
                return True, f" 更新成功: {msg}"
            return False, "数据库写入失败"
        except Exception as e:
            self.logger.error(f"库存更新异常: {e}")
            return False, str(e)

    def drop_inventory_column(self, date_col: str, reason: str) -> Tuple[bool, str]:
        user = get_current_user()
        if date_col.lower() in ['id', 'sku', 'created_at', 'updated_at']:
            return False, "系统核心列不可删除"
        try:
            sql = f"ALTER TABLE `{self.table_inv}` DROP COLUMN `{date_col}`"
            success = self.db.execute_stmt(sql)
            if success:
                msg = f"{IMMUTABLE_MARKER} [DROP COLUMN] Target: {self.table_inv}.{date_col} | Reason: {reason}"
                self.audit_logger.critical(msg,
                                           extra={"action": "DROP_INV_COLUMN", "user": user, "table": self.table_inv})
                return True, f" 已成功删除列: {date_col}"
            return False, "删除列失败"
        except Exception as e:
            self.logger.error(f"删除列异常: {e}")
            return False, f"执行异常: {str(e)}"

    # =========================================================================
    # 档案维护 (COGS) - 升级版
    # =========================================================================

    def get_cogs_data(self) -> pd.DataFrame:
        """获取全量 SKU 档案数据"""
        return self.db.read_df(f"SELECT * FROM `{self.table_cogs}`")

    def get_distinct_options(self, column: str) -> List[str]:
        """获取选项"""
        allowed = ['Category', 'SubCategory', 'Type']
        if column not in allowed: return []
        try:
            sql = f"SELECT DISTINCT `{column}` FROM `{self.table_cogs}` WHERE `{column}` IS NOT NULL AND `{column}` != '' ORDER BY `{column}`"
            df = self.db.read_df(sql)
            return df[column].tolist()
        except:
            return []

    def get_all_cogs_skus(self) -> List[str]:
        """获取 Data_COGS 表中所有 SKU (用于重复检查)"""
        try:
            sql = f"SELECT DISTINCT `SKU` FROM `{self.table_cogs}` WHERE `SKU` IS NOT NULL ORDER BY `SKU`"
            df = self.db.read_df(sql)
            return df['SKU'].tolist()
        except:
            return []


    def update_cogs_smart(self, df_new: pd.DataFrame) -> Tuple[bool, str]:
        """
        [精准更新] 仅更新发生变化的行
        [2026-01-13] 新增: 同步更新FIFO期初数据的成本
        """
        if df_new.empty: return False, "数据为空"

        user = get_current_user()

        # 1. 获取 DB 现状
        df_old = self.get_cogs_data()

        # 2. 计算差异
        diff = DiffEngine.compute_diff(df_old, df_new, key_col="SKU")
        modifications = diff["modified"]

        if not modifications:
            return True, "没有检测到任何变更，无需更新。"

        try:
            updated_count = 0
            cog_changed_skus = []  # 记录Cog字段变化的SKU
            
            # 3. 逐行生成 SQL 并执行 (事务包裹)
            with self.db.atomic_transaction() as conn:
                for item in modifications:
                    sku = item["key"]
                    changes = item["changes"]  # dict {col: (old, new)}

                    # 构造 UPDATE 语句
                    set_clauses = []
                    params = {"sku": sku}

                    for col, (old_val, new_val) in changes.items():
                        # [Validation] Weight Column
                        if col == "Weight":
                            try:
                                new_val = self._validate_weight(new_val)
                            except ValueError as ve:
                                raise Exception(str(ve))
                        
                        # 记录Cog变化的SKU
                        if col == "Cog":
                            cog_changed_skus.append((sku, new_val))

                        # 安全处理列名
                        safe_col = f"`{col}`"
                        param_key = f"val_{col}"
                        set_clauses.append(f"{safe_col} = :{param_key}")
                        params[param_key] = new_val

                    if set_clauses:
                        sql = text(f"UPDATE `{self.table_cogs}` SET {', '.join(set_clauses)} WHERE SKU = :sku")
                        conn.execute(sql, params)
                        updated_count += 1

            # 4. 同步更新FIFO期初数据的成本
            if cog_changed_skus:
                self._sync_fifo_init_cost(cog_changed_skus)

            # 5. 生成精准日志
            log_msgs = DiffEngine.format_log_message(diff, key_name="SKU")

            # [Fix]: 返回完整的 changes 字典，供 Middleware 写入 Details 列
            changes_payload = {
                "summary": f"更新 {len(modifications)} 条 SKU 资料",
                "diff_records": log_msgs,
            }

            return True, f" 成功更新了 {updated_count} 条记录。", changes_payload

        except Exception as e:
            self.logger.error(f"精准更新失败: {e}")
            return False, f"更新失败: {e}", {}

    def _sync_fifo_init_cost(self, sku_cost_list: list):
        """
        同步更新FIFO期初数据的成本
        处理两种期初数据：
        1. INIT_20241231 - 2024年底期初库存
        2. INIT-2024 - 2024年订单2025年到货的货物
        
        :param sku_cost_list: [(sku, new_cost), ...]
        """
        try:
            init_po_nums = ['INIT_20241231', 'INIT-2024']
            updated_count = 0
            
            for sku, new_cost in sku_cost_list:
                # 获取所有期初类型的 record_id
                record_df = self.db.read_df(
                    """SELECT record_id FROM in_dynamic_tran 
                       WHERE po_num IN ('INIT_20241231', 'INIT-2024') AND sku = :sku""",
                    {"sku": sku}
                )
                
                if record_df.empty:
                    continue
                
                for _, row in record_df.iterrows():
                    record_id = int(row['record_id'])
                    
                    # 1. 更新 in_dynamic_tran
                    self.db.execute_stmt(
                        "UPDATE in_dynamic_tran SET price = :cost WHERE record_id = :rid",
                        {"cost": new_cost, "rid": record_id}
                    )
                    
                    # 2. 更新 in_dynamic_fifo_layers (通过 in_record_id)
                    self.db.execute_stmt(
                        "UPDATE in_dynamic_fifo_layers SET unit_cost = :cost WHERE in_record_id = :rid",
                        {"cost": new_cost, "rid": record_id}
                    )
                    
                    # 3. 更新 in_dynamic_landed_price (通过 in_record_id)
                    self.db.execute_stmt(
                        "UPDATE in_dynamic_landed_price SET landed_price_usd = :cost WHERE in_record_id = :rid",
                        {"cost": new_cost, "rid": record_id}
                    )
                    
                    updated_count += 1
            
            self.logger.info(f"同步FIFO期初成本: {len(sku_cost_list)} 个SKU, 更新 {updated_count} 条记录")
        except Exception as e:
            self.logger.warning(f"同步FIFO期初成本失败: {e}")

    def batch_create_skus(self, sku_list: List[Dict[str, Any]]) -> Tuple[bool, str]:
        """
        [新增 SKU] 批量创建 SKU
        :param sku_list: [{SKU, Category, ..., Initial_Qty}, ...]
        """
        if not sku_list: return False, "没有有效的 SKU 数据"

        user = get_current_user()

        # 1. 获取库存表最新月份列 (用于填入 Initial_Qty)
        date_cols = self.get_inventory_columns()
        latest_date_col = date_cols[0] if date_cols else None

        # 2. 获取库存表所有列 (用于补 0)
        # 这里需要读 schema
        try:
            inv_schema = self.db.read_df(f"SELECT * FROM `{self.table_inv}` LIMIT 0")
            inv_all_cols = inv_schema.columns.tolist()
        except:
            return False, "无法读取库存表结构"

        success_count = 0
        try:
            with self.db.atomic_transaction() as conn:
                for row in sku_list:
                    sku = str(row['SKU']).strip().upper()

                    # A. 插入 Data_COGS
                    # 剔除 Initial_Qty 字段，因为它不属于 COGS 表
                    cogs_data = {k: v for k, v in row.items() if k != 'Initial_Qty'}
                    
                    # [Validation] Weight Column
                    if 'Weight' in cogs_data:
                        try:
                            cogs_data['Weight'] = self._validate_weight(cogs_data['Weight'])
                        except ValueError as ve:
                            return False, str(ve)
                            
                    cogs_data['SKU'] = sku

                    # 简单查重 (虽然 DB 有 Unique 约束，但为了友好提示)
                    # 在事务内查重比较复杂，直接 try-catch IntegrityError 更稳

                    cols = ", ".join([f"`{k}`" for k in cogs_data.keys()])
                    vals = ", ".join([f":{k}" for k in cogs_data.keys()])
                    sql_cogs = text(f"INSERT INTO `{self.table_cogs}` ({cols}) VALUES ({vals})")
                    conn.execute(sql_cogs, cogs_data)

                    # B. 插入 Data_Inventory
                    # 构造插入字典
                    inv_data = {}
                    initial_qty = int(row.get('Initial_Qty', 0))

                    for col in inv_all_cols:
                        c_lower = col.lower()
                        if c_lower == 'sku':
                            inv_data[col] = sku
                        elif c_lower == 'id':
                            continue  # Auto Inc
                        elif c_lower in ['created_at', 'updated_at']:
                            continue  # Auto
                        elif latest_date_col and col == latest_date_col:
                            # 最新月份填初始值
                            inv_data[col] = initial_qty
                        else:
                            # 历史月份填 0
                            inv_data[col] = 0

                    i_cols = ", ".join([f"`{k}`" for k in inv_data.keys()])
                    i_vals = ", ".join([f":val_{i}" for i in range(len(inv_data))])
                    # 参数化 key 需要唯一
                    i_params = {f"val_{i}": v for i, v in enumerate(inv_data.values())}

                    sql_inv = text(f"INSERT INTO `{self.table_inv}` ({i_cols}) VALUES ({i_vals})")
                    conn.execute(sql_inv, i_params)

                    success_count += 1

            # 审计日志
            self.logger.warning(f"批量新增 SKU | Count: {success_count}",
                                extra={"action": "CREATE_SKU", "user": user})
            return True, f" 成功创建 {success_count} 个 SKU。"

        except Exception as e:
            if "Duplicate entry" in str(e):
                return False, f"部分 SKU 已存在，创建失败: {e}"
            self.logger.error(f"创建 SKU 失败: {e}")
            return False, f"创建失败: {e}"