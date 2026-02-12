# File: core/sys/utils.py
import json
from typing import Dict, Any, Tuple


class DiffsHelper:
    """
    负责计算配置字典或数据记录的 Before/After 差异，用于审计日志的 Details 字段。
    """

    @staticmethod
    def calculate_config_diff(before_dict: Dict[str, Any], after_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        计算配置字典的差异，只返回修改过的、新增的或删除的项。
        """
        changes = {
            "summary": "Config/Setting Changes",
            "changed_keys": [],
            "before": {},
            "after": {}
        }

        all_keys = set(before_dict.keys()) | set(after_dict.keys())

        for key in sorted(list(all_keys)):
            old_value = before_dict.get(key)
            new_value = after_dict.get(key)

            # 检查差异
            if old_value != new_value:
                changes["changed_keys"].append(key)

                # 记录变更前的值 (若新增，则为 null)
                changes["before"][key] = old_value if key in before_dict else "新增"

                # 记录变更后的值 (若删除，则为 null)
                changes["after"][key] = new_value if key in after_dict else "删除"

        return changes

    @staticmethod
    def create_data_summary(table_names: str, inserted: int = 0, updated: int = 0, deleted: int = 0) -> Dict[str, Any]:
        """
        [Req 1.1.2] 创建 SQL 数据操作的摘要信息。
        """
        if not (inserted + updated + deleted):
            return {"summary": "No Data Changes"}

        return {
            "summary": f"Data Mutation on: {table_names}",
            "tables": table_names.split('|'),
            "rows_inserted": inserted,
            "rows_updated": updated,
            "rows_deleted": deleted,
            "total_rows_affected": inserted + updated + deleted
        }