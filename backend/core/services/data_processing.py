# File: backend/core/services/data_processing.py
"""
# ==============================================================================
# 模块名称: 数据处理服务基类 (Data Processing Service Example)
# ==============================================================================
#
# [Purpose / 用途]
# 专为 ETL/Finance/Reporting 等重数据处理场景设计。
# 封装 Pandas 操作、CSV 导出、目录管理等通用逻辑。
#
# [Architecture / 架构]
# - Inherits: BaseService
# - Key Features:
#   - Safe CSV Save (Atomic Write)
#   - Numeric Cleaning (NaN handling)
#   - Directory Isolation (User-based output)
#
# [ISO Compliance / 合规性]
# - 数据完整性: 导出文件必须保证原子性，防止写入中断导致文件损坏。
# - 隔离性: 每个用户的导出文件应存放在独立目录。
#
# ==============================================================================
"""

import os
import pandas as pd
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from backend.common.settings import settings
from backend.core.services.base import BaseService
from core.sys.context import get_current_user

class DataProcessingService(BaseService):
    def __init__(self, file_suffix: str = "", *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.file_suffix = file_suffix
        self._output_dir_cache = None

    @property
    def output_dir(self) -> Path:
        """动态获取用户隔离的输出目录（每次调用时重新读取用户上下文）"""
        user = get_current_user() or "system"
        # 简单过滤非法字符
        safe_user = "".join([c for c in user if c.isalnum() or c in ('_', '-')])
        sub_dir = safe_user if safe_user else "default"

        path = settings.OUTPUT_DIR / sub_dir
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
        return path

    def clean_numeric_cols(self, df: pd.DataFrame, cols: List[str] = None) -> pd.DataFrame:
        """
        [通用清洗] 强制将指定列转换为数值，NaN 转 0
        """
        if df.empty:
            return df
        
        target_cols = cols if cols else []
        for col in target_cols:
            # 模糊匹配 (忽略大小写)
            match_col = next((c for c in df.columns if c.lower() == col.lower()), None)
            if match_col:
                df[match_col] = pd.to_numeric(df[match_col], errors='coerce').fillna(0.0)
        return df

    def save_csv_atomic(self, df: pd.DataFrame, filename: str, footer: List[str] = None) -> str:
        """
        [安全导出] 原子写入 CSV 文件
        """
        if not filename.endswith(".csv"):
            filename += ".csv"
        
        save_path = self.output_dir / filename
        temp_path = save_path.with_suffix(".tmp")
        
        status_tag = "[EMPTY]" if df.empty else f"[{len(df)} ROWS]"
        
        try:
            with open(temp_path, "w", encoding="utf-8-sig") as f:
                df.to_csv(f, index=False)
                if footer:
                    f.write("\n")
                    for line in footer:
                        f.write(f"{line}\n")
            
            # 原子重命名
            if save_path.exists():
                save_path.unlink()
            temp_path.rename(save_path)
            
            self.log(f"💾 {status_tag} Exported: {filename}")
            return str(save_path)
        
        except Exception as e:
            self.log(f"❌ Save Failed [{filename}]: {e}", level="error")
            if temp_path.exists():
                temp_path.unlink()
            return ""
    
    def load_df_safe(self, loader_func, *args, **kwargs) -> pd.DataFrame:
        """安全加载 DataFrame (自动处理异常)"""
        try:
            df = loader_func(*args, **kwargs)
            if df is None:
                return pd.DataFrame()
            return df
        except Exception as e:
            self.log(f"⚠️ Data Load Error: {e}", level="warning")
            return pd.DataFrame()
