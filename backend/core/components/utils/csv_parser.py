# core/components/utils/csv_parser.py
"""
文件说明: 复杂 CSV 解析工具
主要功能:
1. 解析包含多个子表的堆叠式 CSV 文件 (Multi-table CSV)。
2. 自动识别分隔符 (空行、标题行)。
3. 过滤注释行和无关元数据。
"""

import pandas as pd
import io
import re
from pathlib import Path
from typing import List, Tuple


def parse_compound_csv(file_path: Path) -> List[Tuple[str, pd.DataFrame]]:
    """
    [智能解析器] 解析包含多个子表的复杂 CSV 文件

    Returns:
        List of (Title, DataFrame)
    """
    if not file_path.exists():
        return []

    tables = []
    current_lines = []
    current_title = "Main Table"

    # 标题特征正则: === xxx ===, 表1, Table 1
    title_pattern = re.compile(r'^(===.+===|表\d+|Table\s*\d+)', re.IGNORECASE)

    try:
        with open(file_path, "r", encoding="utf-8-sig") as f:
            all_lines = f.readlines()

        for line in all_lines:
            stripped = line.strip()

            # Case 1: 空行 -> 可能是分隔符
            if not stripped:
                if current_lines:
                    _try_parse_buffer(current_lines, current_title, tables)
                    current_lines = []
                continue

            # Case 2: 标题行 -> 强制分隔
            # 特征：没有逗号，且符合标题正则
            if "," not in stripped and title_pattern.match(stripped):
                # 先保存之前的
                if current_lines:
                    _try_parse_buffer(current_lines, current_title, tables)
                    current_lines = []

                # 更新标题 (去除装饰符)
                current_title = stripped.replace("===", "").strip()
                continue

            # Case 3: 底部说明文字 (Footer)
            if (stripped.startswith("说明") or stripped.startswith("备注") or
                    "逻辑说明" in stripped or stripped.startswith("📘")):
                # 遇到 Footer，结束收集
                if current_lines:
                    _try_parse_buffer(current_lines, current_title, tables)
                    current_lines = []
                continue

            # Case 4: 数据行
            current_lines.append(line)

        # Loop 结束，处理最后一块
        if current_lines:
            _try_parse_buffer(current_lines, current_title, tables)

    except Exception as e:
        print(f"解析 CSV 失败: {e}")
        # 兜底：尝试全量读取
        try:
            df = pd.read_csv(file_path)
            return [("Raw Data", df)]
        except:
            return []

    return tables


def _try_parse_buffer(lines, title, tables_list):
    """辅助：尝试将文本行转为 DF"""
    try:
        # 过滤纯注释行 (#)
        valid_lines = [l for l in lines if not l.startswith("#")]
        if not valid_lines: return

        csv_io = io.StringIO("".join(valid_lines))
        # 宽容模式读取
        df = pd.read_csv(csv_io, on_bad_lines='skip')

        # 有效性检查：不仅要有列，还得有数据
        if not df.empty and len(df.columns) > 1:
            tables_list.append((title, df))
    except:
        pass