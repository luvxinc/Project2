# core/services/correction.py
"""
文件说明: SKU 纠错与记忆服务 (Correction Service)
主要功能:
1. 管理 "SKU 自动修正记忆库" (CSV文件)，记录用户的修正操作 (Learn)。
2. 提供智能推荐 (Fuzzy Match) 和自动匹配建议 (Suggest)。
3. 提供原子性的修复接口，同时更新数据库和记忆库。
"""

import pandas as pd
import difflib
from typing import List, Optional, Tuple, Dict, Any

from backend.common.settings import settings
from core.components.db.client import DBClient
from core.sys.logger import get_logger
from core.sys.context import get_current_user
# 引入库存仓库
from core.services.inventory.repository import InventoryRepository


class CorrectionService:

    def __init__(self):
        self.logger = get_logger("CorrectionService")
        self.db = DBClient()

        # 记忆文件路径
        self.memory_file = settings.KNOWLEDGE_BASE_DIR / "sku_correction_memory.csv"

        # [Fix] 实例化 InventoryRepository，而不是直接调用类方法
        self.inv_repo = InventoryRepository()
        self.valid_skus = set(self.inv_repo.get_valid_skus())

        # 加载记忆库
        self.memory_df = self._load_memory()

    def _load_memory(self) -> pd.DataFrame:
        """加载记忆库 CSV"""
        if self.memory_file.exists():
            try:
                # 全部按字符串读取，防止 '001' 变成 1
                return pd.read_csv(self.memory_file, dtype=str).fillna("")
            except Exception:
                return pd.DataFrame(columns=["CustomLabel", "BadSKU", "BadQty", "CorrectSKU", "CorrectQty"])
        else:
            return pd.DataFrame(columns=["CustomLabel", "BadSKU", "BadQty", "CorrectSKU", "CorrectQty"])

    def save_correction_memory(self, custom_label: str, bad_sku: str, bad_qty: str,
                               correct_sku: str, correct_qty: str):
        """
        [学习] 记录用户的修正操作
        """
        new_row = {
            "CustomLabel": str(custom_label).strip(),
            "BadSKU": str(bad_sku).strip().upper(),
            "BadQty": str(bad_qty).strip(),
            "CorrectSKU": str(correct_sku).strip().upper(),
            "CorrectQty": str(correct_qty).strip()
        }

        # 追加并去重 (保留最新的修正记录)
        self.memory_df = pd.concat([self.memory_df, pd.DataFrame([new_row])], ignore_index=True)
        self.memory_df.drop_duplicates(subset=["CustomLabel", "BadSKU"], keep='last', inplace=True)

        # 持久化
        try:
            self.memory_df.to_csv(self.memory_file, index=False, encoding='utf-8-sig')
        except Exception as e:
            self.logger.error(f"记忆库保存失败: {e}")

        # 动态更新内存中的有效 SKU 列表，无需查库
        if correct_sku not in self.valid_skus:
            self.valid_skus.add(correct_sku)

    def find_auto_fix(self, custom_label: str, bad_sku: str) -> Tuple[Optional[str], Optional[str]]:
        """
        [回忆] 从记忆库中寻找历史解决方案
        Returns: (CorrectSKU, CorrectQty)
        """
        if self.memory_df.empty: return None, None

        custom_label = str(custom_label).strip()
        bad_sku = str(bad_sku).strip().upper()

        # 精确匹配 Label 和 BadSKU
        match = self.memory_df[
            (self.memory_df["CustomLabel"] == custom_label) &
            (self.memory_df["BadSKU"] == bad_sku)
            ]

        if not match.empty:
            row = match.iloc[-1]
            return row["CorrectSKU"], row["CorrectQty"]
        return None, None

    def get_fuzzy_suggestions(self, bad_sku: str, n: int = 5) -> List[str]:
        """
        [建议] 模糊搜索有效 SKU
        """
        bad_sku = str(bad_sku).upper()
        # 1. 包含匹配
        contains = [s for s in self.valid_skus if bad_sku in s]
        # 2. 模糊匹配 (Levenshtein Distance)
        fuzzy = difflib.get_close_matches(bad_sku, self.valid_skus, n=n, cutoff=0.4)

        results = sorted(list(set(contains + fuzzy)))
        return results[:n]

    def is_valid_sku(self, sku: str) -> bool:
        """校验 SKU 是否存在于系统档案中"""
        return str(sku).strip().upper() in self.valid_skus

    def validate_quantity(self, val: str) -> bool:
        """[工具] 验证数量是否为正整数"""
        try:
            v = float(val)
            return v > 0 and v.is_integer()
        except:
            return False

    def apply_fix_transactional(self, order_id: str, col_idx: int,
                                custom_label: str, bad_sku: str, bad_qty: str,
                                new_sku: str, new_qty: str) -> bool:
        """
        [原子操作] 应用人工修复：同时更新 Data_Transaction 和 记忆库
        """
        user = get_current_user()

        # 1. 保存记忆
        self.save_correction_memory(custom_label, bad_sku, bad_qty, new_sku, new_qty)

        # 2. 更新数据库 (Raw Table)
        try:
            sku_col = f"P_SKU{col_idx}"
            qty_col = f"P_Quantity{col_idx}"

            # [Fix] 更新 SKU/数量 并将 P_Flag 设为 5（校验通过），避免重复查询到同一条记录
            sql = f"""
            UPDATE Data_Transaction 
            SET `{sku_col}` = :ns, `{qty_col}` = :nq, `P_Flag` = 5
            WHERE `Order number` = :oid
            """
            DBClient.execute_stmt(sql, {"ns": new_sku, "nq": new_qty, "oid": order_id})

            self.logger.info(f"人工修复: Order[{order_id}] {bad_sku}->{new_sku}",
                             extra={"action": "MANUAL_FIX_SKU", "user": user})
            return True
        except Exception as e:
            self.logger.error(f"修复提交失败: {e}")
            return False

    def get_next_pending_issue(self) -> Optional[pd.Series]:
        """获取下一条待处理异常 (P_Flag=99)"""
        try:
            # P_Flag=99 是 Parser 标记的“校验失败”状态
            sql = "SELECT * FROM Data_Transaction WHERE P_Flag = 99 LIMIT 1"
            df = DBClient.read_df(sql)
            if df.empty: return None
            return df.iloc[0]
        except Exception:
            return None

    def mark_as_skipped(self, order_id: str) -> None:
        """跳过记录 (强制标记为通过 P_Flag=5)"""
        user = get_current_user()
        sql = "UPDATE Data_Transaction SET P_Flag = 5 WHERE `Order number` = :oid"
        DBClient.execute_stmt(sql, {"oid": order_id})
        self.logger.warning(f"跳过异常记录: Order[{order_id}]", extra={"action": "SKIP_FIX", "user": user})

    def run_auto_parser(self) -> Dict[str, Any]:
        """
        [编排] 触发 ETL Parser 进行重扫
        (主要用于 UI 上的 '重新扫描' 按钮)
        """
        # 局部导入避免循环依赖
        from core.services.etl.parser import TransactionParser
        self.logger.info("启动自动解析与修复流程...")
        parser = TransactionParser()
        return parser.run()