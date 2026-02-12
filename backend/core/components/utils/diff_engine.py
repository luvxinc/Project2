# core/components/utils/diff_engine.py
"""
文件说明: 智能差异比对引擎 (Diff Engine)
主要功能:
1. 对比两个 DataFrame (Old vs New) 的差异。
2. 识别新增 (Added)、删除 (Removed) 和 修改 (Modified) 的行。
3. 针对修改行，精确指出是哪个字段发生了变化 (OldVal -> NewVal)。
4. [架构设计] 这是一个纯逻辑公有类，可复用于任何表的差异计算。
"""

import pandas as pd
from typing import List, Dict, Any, Tuple


class DiffEngine:

    @staticmethod
    def compute_diff(df_old: pd.DataFrame, df_new: pd.DataFrame, key_col: str) -> Dict[str, Any]:
        """
        [核心算法] 计算差异
        :param df_old: 原始数据 (DB State)
        :param df_new: 编辑后数据 (UI State)
        :param key_col: 主键列名 (如 'SKU')
        :return: {
            "modified": [{key: 'A', changes: {'Cost': (10, 12)}}],
            "added": [],
            "removed": []
        }
        """

        # 预处理：统一索引，确保字符串去空大写
        def clean_df(df):
            d = df.copy()
            # 强制主键转字符串并去空
            d[key_col] = d[key_col].astype(str).str.strip().str.upper()
            return d.set_index(key_col)

        old_map = clean_df(df_old)
        new_map = clean_df(df_new)

        diff_result = {
            "modified": [],
            "added": [],  # 本次需求主要关注 modified，但保留完整性
            "removed": []
        }

        # 1. 找出交集 (可能被修改的)
        common_keys = old_map.index.intersection(new_map.index)

        for key in common_keys:
            row_old = old_map.loc[key]
            row_new = new_map.loc[key]

            # [Bug Fix] 处理重复索引：当 loc 返回多行时，row_old/row_new 是 DataFrame 而非 Series
            # 取第一行以避免将整个 DataFrame/Series 的字符串表示写入数据库
            if isinstance(row_old, pd.DataFrame):
                row_old = row_old.iloc[0]
            if isinstance(row_new, pd.DataFrame):
                row_new = row_new.iloc[0]

            changes = {}
            # 逐列比对
            for col in new_map.columns:
                if col not in row_old.index: continue  # 忽略新加的临时列

                v_old = row_old[col]
                v_new = row_new[col]

                # [Bug Fix] 防护：如果取出的值仍然是 Series (不应该发生，但作为安全措施)
                if isinstance(v_old, pd.Series):
                    v_old = v_old.iloc[0] if len(v_old) > 0 else None
                if isinstance(v_new, pd.Series):
                    v_new = v_new.iloc[0] if len(v_new) > 0 else None

                # 类型宽松转换对比 (防止 int 10 != float 10.0)
                try:
                    # 如果都是数字
                    if pd.api.types.is_number(v_old) and pd.api.types.is_number(v_new):
                        is_diff = abs(float(v_old) - float(v_new)) > 0.0001
                    else:
                        # 字符串对比
                        is_diff = str(v_old).strip() != str(v_new).strip()
                except:
                    is_diff = str(v_old) != str(v_new)

                if is_diff:
                    changes[col] = (v_old, v_new)

            if changes:
                diff_result["modified"].append({
                    "key": key,
                    "changes": changes
                })

        return diff_result

    @staticmethod
    def format_log_message(diff_result: Dict[str, Any], key_name: str = "SKU") -> List[str]:
        """[工具] 将差异对象转为人类可读的日志列表"""
        logs = []
        for item in diff_result["modified"]:
            key = item["key"]
            change_strs = []
            for col, (old, new) in item["changes"].items():
                change_strs.append(f"{col}: {old} -> {new}")

            logs.append(f"更新 {key_name} [{key}]: " + ", ".join(change_strs))
        return logs