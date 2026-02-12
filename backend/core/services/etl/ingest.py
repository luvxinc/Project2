# core/services/etl/ingest.py
"""
文件说明: 数据摄入服务 (Ingest Service)
主要功能:
1. 读取 Transaction 和 Earning 的 CSV 文件。
2. 智能识别 Seller (通过文件内容或文件名) 和 Header 行。
3. **数据清洗**: 关键修复 - 对所有字符串列执行 strip()，去除隐形空格。
4. **数据入库**: 使用 Hash 去重 + APPEND 模式，保留历史数据。

[V2.0 变更 - 2026-01-12]
- 移除 truncate_raw_tables，改为保留历史数据
- 使用 row_hash 进行整行去重
- 改为 APPEND 模式，只追加新数据
"""

import pandas as pd
import numpy as np
import csv
import io
import hashlib
from typing import List, Tuple, Optional, Any
from pathlib import Path
from sqlalchemy.types import Text

from core.components.db.client import DBClient
from core.sys.logger import get_logger
from core.services.etl.repository import ETLRepository
from dateutil import parser as dateutil_parser

# 抑制 Pandas 警告
pd.set_option('future.no_silent_downcasting', True)


def normalize_date_value(date_val) -> str:
    """
    [V2.1] 日期格式化
    Input: 'Jun 30, 2025', '2025-06-30', '30-Jun-25', 'Jan-02-2025 03:45:12 PM PST'
    Output: '2025-06-30'
    """
    if pd.isna(date_val) or str(date_val).strip() == "":
        return ""
    
    s = str(date_val).strip()
    try:
        dt = pd.to_datetime(s, errors='raise')
        return dt.strftime('%Y-%m-%d')
    except:
        try:
            dt = dateutil_parser.parse(s, fuzzy=True)
            return dt.strftime('%Y-%m-%d')
        except:
            return s  # 解析失败，返回原值


def normalize_date_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    [V2.1] 对 DataFrame 中所有日期列进行格式化
    识别列名包含 'date' 的列（不区分大小写）
    """
    for col in df.columns:
        if 'date' in str(col).lower():
            df[col] = df[col].apply(normalize_date_value)
    return df


# [V2.1] Data_Order_Earning 用业务键 hash (邮费会延迟更新，需要覆盖)
EARNING_HASH_KEY_COLUMNS = [
    'order creation date',
    'order number',
    'item id',
    'item title',
    'buyer name',
    'custom label',
    'seller',
]


def compute_row_hash_full(row: pd.Series) -> str:
    """
    [Data_Transaction 专用] 整行 hash
    - 任何列变化 → hash 变化 → 插入新行
    """
    values = row.drop('row_hash', errors='ignore')
    content = '|'.join(str(v).strip() for v in values.values)
    return hashlib.md5(content.encode('utf-8')).hexdigest()


def compute_row_hash_key(row: pd.Series) -> str:
    """
    [Data_Order_Earning 专用] 业务键 hash
    - 只用不变列计算 hash
    - 邮费等列变化 → hash 不变 → 覆盖旧数据
    """
    row_lower = {str(k).lower(): v for k, v in row.items()}
    
    key_values = []
    for col in EARNING_HASH_KEY_COLUMNS:
        val = row_lower.get(col, '')
        key_values.append(str(val).strip())
    
    content = '|'.join(key_values)
    return hashlib.md5(content.encode('utf-8')).hexdigest()


class IngestService:

    def __init__(self):
        self.logger = get_logger("IngestService")
        self.repo = ETLRepository()

    def run_ingest_pipeline(self, transaction_files: List[Any], earning_files: List[Any]) -> dict:
        """
        [主入口] 执行完整的摄入流程
        
        [V2.3] 返回结构体，包含日期范围供后续处理使用
        
        Returns:
            {
                'status': 'success' | 'empty' | 'error',
                'message': str,
                'date_range': (date_min, date_max),  # 本次上传的日期范围
                'trans_count': int,
                'earn_count': int,
            }
        """
        if not transaction_files and not earning_files:
            return {"status": "empty", "message": "没有收到任何文件"}

        self.logger.info("正在处理文件 (Hash 去重模式)...")

        date_min, date_max = None, None
        trans_count, earn_count = 0, 0
        msg = []

        # 处理 Transaction
        if transaction_files:
            result = self._process_files(transaction_files, "Data_Transaction", "Order number")
            trans_count = result['new_count']
            msg.append(f"Transaction: 新增 {result['new_count']} 条, 跳过 {result['skip_count']} 条")
            if result['date_min'] and result['date_max']:
                date_min = result['date_min']
                date_max = result['date_max']

        # 处理 Earning
        if earning_files:
            result = self._process_files(earning_files, "Data_Order_Earning", "Order number")
            earn_count = result['new_count']
            msg.append(f"Earning: 新增 {result['new_count']} 条, 覆盖 {result['skip_count']} 条")
            # Earning 的日期范围也合并
            if result['date_min']:
                date_min = min(date_min, result['date_min']) if date_min else result['date_min']
            if result['date_max']:
                date_max = max(date_max, result['date_max']) if date_max else result['date_max']

        final_msg = " | ".join(msg)
        self.logger.info(f"✅ 数据摄入完成: {final_msg}")
        self.logger.info(f"📅 日期范围: {date_min} ~ {date_max}")
        
        return {
            "status": "success",
            "message": final_msg,
            "date_range": (date_min, date_max),
            "trans_count": trans_count,
            "earn_count": earn_count,
        }

    def _process_files(self, files: List[Any], table_name: str, key_col: str) -> dict:
        """
        通用文件处理逻辑
        
        [V2.3] 返回字典，包含日期范围
        
        Returns:
            {'new_count': int, 'skip_count': int, 'date_min': str, 'date_max': str}
        """
        all_chunks = []

        for file_obj in files:
            try:
                # 1. 探测元数据 (Seller, Skiprows)
                seller, skiprows = self._detect_metadata(file_obj, key_col)

                # 2. 兜底 Seller
                if not seller and hasattr(file_obj, 'name'):
                    seller = self._infer_seller_from_name(file_obj.name)

                if not seller:
                    name = getattr(file_obj, 'name', 'Unknown')
                    self.logger.warning(f"无法识别 Seller，跳过文件: {name}")
                    continue

                # 3. 读取内容 (重置指针)
                if hasattr(file_obj, 'seek'): file_obj.seek(0)

                df = pd.read_csv(
                    file_obj,
                    skiprows=skiprows,
                    dtype=str,
                    encoding='utf-8-sig',
                    on_bad_lines='skip'
                )

                if df.empty: continue

                # [关键修复] 全局去空格：对所有 object 类型列执行 strip
                df = df.apply(lambda x: x.str.strip() if x.dtype == "object" else x)

                # 4. 注入元数据与清洗
                df["Seller"] = seller
                df.columns = [str(c).strip() for c in df.columns]

                # 校验关键列
                if key_col not in df.columns:
                    self.logger.warning(f"文件结构异常 (缺失 {key_col})")
                    continue

                # 清理空值
                df = df.replace(['--', '-', 'N/A', 'null', 'nan', 'None'], np.nan)
                df = df.dropna(how='all')

                # [V2.1] 日期列格式化 (写入前统一为 YYYY-MM-DD)
                df = normalize_date_columns(df)

                if not df.empty:
                    all_chunks.append(df)

            except Exception as e:
                import traceback
                name = getattr(file_obj, 'name', 'Unknown')
                self.logger.error(f"文件处理失败 ({name}): {e}\n{traceback.format_exc()}")

        if not all_chunks:
            return {'new_count': 0, 'skip_count': 0, 'date_min': None, 'date_max': None}

        # 5. 合并数据
        try:
            final_df = pd.concat(all_chunks, ignore_index=True)
            
            # [V2.3] 提取日期范围
            date_col = None
            for col in final_df.columns:
                if 'order' in col.lower() and 'date' in col.lower():
                    date_col = col
                    break
                elif 'transaction' in col.lower() and 'date' in col.lower():
                    date_col = col
                    break
            
            date_min, date_max = None, None
            if date_col and date_col in final_df.columns:
                date_series = pd.to_datetime(final_df[date_col], errors='coerce')
                date_min = date_series.min().strftime('%Y-%m-%d') if pd.notna(date_series.min()) else None
                date_max = date_series.max().strftime('%Y-%m-%d') if pd.notna(date_series.max()) else None
            
            # [V2.1] 根据表名使用不同的 hash 策略
            is_earning_table = (table_name == "Data_Order_Earning")
            
            if is_earning_table:
                final_df['row_hash'] = final_df.apply(compute_row_hash_key, axis=1)
            else:
                final_df['row_hash'] = final_df.apply(compute_row_hash_full, axis=1)
            
            # 获取已存在的 hash
            try:
                existing_df = DBClient.read_df(f"SELECT row_hash FROM `{table_name}`")
                existing_hashes = set(existing_df['row_hash'].tolist()) if not existing_df.empty else set()
            except Exception:
                existing_hashes = set()
            
            total_count = len(final_df)
            new_hashes = set(final_df['row_hash'].tolist())
            overlap_hashes = existing_hashes & new_hashes
            pure_new_hashes = new_hashes - existing_hashes
            
            if is_earning_table:
                new_count = len(pure_new_hashes)
                update_count = len(overlap_hashes)
                
                if overlap_hashes:
                    overlap_list = list(overlap_hashes)
                    batch_size = 500
                    for i in range(0, len(overlap_list), batch_size):
                        batch = overlap_list[i:i+batch_size]
                        placeholders = ', '.join([f"'{h}'" for h in batch])
                        DBClient.execute_stmt(f"DELETE FROM `{table_name}` WHERE row_hash IN ({placeholders})")
                    self.logger.info(f"{table_name}: 删除 {update_count} 条旧数据准备覆盖")
                
                final_df['Processed_E'] = 0
                
                dtype_map = {c: Text() for c in final_df.columns}
                final_df.to_sql(table_name, DBClient.get_engine(), if_exists='append', index=False, chunksize=2000, dtype=dtype_map)
                
                self.logger.info(f"{table_name}: 新增 {new_count} 条, 覆盖 {update_count} 条")
                return {'new_count': new_count, 'skip_count': update_count, 'date_min': date_min, 'date_max': date_max}
            
            else:
                df_new = final_df[~final_df['row_hash'].isin(existing_hashes)]
                new_count = len(df_new)
                skip_count = total_count - new_count
                
                if df_new.empty:
                    self.logger.info(f"{table_name}: 所有 {total_count} 条数据已存在，跳过")
                    return {'new_count': 0, 'skip_count': skip_count, 'date_min': date_min, 'date_max': date_max}
                
                df_new = df_new.copy()
                df_new['Processed_T'] = 0
                
                dtype_map = {c: Text() for c in df_new.columns}
                df_new.to_sql(table_name, DBClient.get_engine(), if_exists='append', index=False, chunksize=2000, dtype=dtype_map)
                
                self.logger.info(f"{table_name}: 新增 {new_count} 条, 跳过 {skip_count} 条重复")
                return {'new_count': new_count, 'skip_count': skip_count, 'date_min': date_min, 'date_max': date_max}
            
        except Exception as e:
            import traceback
            self.logger.error(f"数据库写入失败 ({table_name}): {e}\n{traceback.format_exc()}")
            return {'new_count': 0, 'skip_count': 0, 'date_min': None, 'date_max': None}

    def _detect_metadata(self, file_obj: Any, keyword: str) -> Tuple[Optional[str], int]:
        """智能嗅探 Seller 和 Header 行"""
        seller = None
        skiprows = 0
        target_key = keyword.lower()

        if hasattr(file_obj, 'seek'): file_obj.seek(0)

        try:
            # 兼容 Path 和 BytesIO
            if isinstance(file_obj, (str, Path)):
                f = open(file_obj, 'r', encoding='utf-8-sig', errors='replace')
                should_close = True
            else:
                # BytesIO 需要包装
                f = io.TextIOWrapper(file_obj, encoding='utf-8-sig', errors='replace')
                should_close = False

            reader = csv.reader(f)
            lines = []
            for _ in range(30):
                try:
                    lines.append(next(reader))
                except StopIteration:
                    break

            if should_close:
                f.close()
            else:
                f.detach()

            for i, row in enumerate(lines):
                if not row: continue
                clean_row = [str(x).lower().replace('"', '').strip() for x in row]

                # 找 Seller
                if len(clean_row) >= 2 and clean_row[0] == "seller":
                    if clean_row[1]: seller = clean_row[1]

                # 找 Header
                if target_key in clean_row:
                    skiprows = i

            return seller, skiprows

        except Exception as e:
            self.logger.warning(f"元数据探测异常: {e}")
            return None, 0

    def _infer_seller_from_name(self, filename: str) -> Optional[str]:
        fname = filename.lower()
        if "88" in fname:
            return "esparts88"
        elif "plus" in fname:
            return "espartsplus"
        return None