# core/services/etl/parser.py
"""
文件说明: 交易数据解析器 (Transaction Parser)
主要功能:
1. 结构化解析: 从 'Custom label' 字段中提取 SKU 和 Quantity。
2. 模式识别: 支持 Single (单品), Dual (双品), Complex (多品/特殊符) 格式。
3. 数据校验: 验证提取出的 SKU 是否在系统资料库 (Data_COGS) 中存在。
4. [Fix] 逻辑修复: 强制重新校验 P_Flag=99 的行，解决“僵尸错误”问题。
"""

import pandas as pd
import numpy as np
import re
import tqdm
from typing import Dict, Any
from sqlalchemy.types import Text

from core.components.db.client import DBClient
from core.services.correction import CorrectionService
from core.sys.logger import get_logger

# 抑制 Pandas 的 FutureWarning
pd.set_option('future.no_silent_downcasting', True)


class TransactionParser:

    def __init__(self):
        self.db = DBClient()
        self.logger = get_logger("TransactionParser")
        self.corrector = CorrectionService()

        # 缓存修复字典 (BadSKU -> {sku, qty})，减少循环内的查找开销
        self.fix_map = self._build_fast_fix_map()

        # 定义输出列结构
        self.parse_cols = ['P_Flag', 'P_Key', 'P_Type', 'P_Check', 'Skufix_Check']
        for i in range(1, 11):
            self.parse_cols.extend([f'P_SKU{i}', f'P_Quantity{i}'])

    def _build_fast_fix_map(self) -> Dict[str, dict]:
        """[优化] 构建内存级快速修复查找表"""
        memory_dict = {}
        if not self.corrector.memory_df.empty:
            for _, row in self.corrector.memory_df.iterrows():
                bad = str(row.get('BadSKU', '')).strip().upper()
                if bad:
                    memory_dict[bad] = {
                        'sku': str(row.get('CorrectSKU', '')).strip().upper(),
                        'qty': str(row.get('CorrectQty', '')).strip()
                    }
        return memory_dict

    def run(self, date_range: tuple = None) -> Dict[str, Any]:
        """
        [主入口] 执行解析流程 (V2.3 - 日期区间增量处理)
        
        Args:
            date_range: (date_min, date_max) 日期范围，如 ('2025-01-01', '2025-01-31')
                        如果为 None，则使用 Processed_T=0 作为筛选条件
        """
        self.logger.info("🚀 [Parser] 开始解析交易数据...")
        
        # 1. 根据日期范围读取数据
        if date_range and date_range[0] and date_range[1]:
            date_min, date_max = date_range
            self.logger.info(f"📅 日期范围: {date_min} ~ {date_max}")
            df_all = self.db.read_df(f"""
                SELECT * FROM Data_Transaction 
                WHERE `Transaction creation date` BETWEEN '{date_min}' AND '{date_max}'
            """)
        else:
            # 兜底：读取待处理的数据
            df_all = self.db.read_df("""
                SELECT * FROM Data_Transaction 
                WHERE COALESCE(Processed_T, 0) = 0
            """)
        
        if df_all.empty:
            self.logger.info("没有需要处理的数据")
            return {"status": "empty", "auto_fixed": [], "pending_count": 0}

        self.logger.info(f"读取到 {len(df_all)} 条记录")

        # 2. 筛选待处理记录 (Processed_T=0 或 NULL)
        mask_pending = df_all['Processed_T'].isna() | (df_all['Processed_T'].astype(str) == '0')
        df_pending = df_all[mask_pending].copy()
        
        if df_pending.empty:
            self.logger.info("没有待处理的交易数据，跳过解析。")
            return {"status": "empty", "auto_fixed": [], "pending_count": 0, "df_all": df_all}

        self.logger.info(f"发现 {len(df_pending)} 条待处理记录 (总 {len(df_all)} 条)")
        df_pending = df_pending.reset_index(drop=True)

        # 3. 初始化列结构
        df_pending = self._init_columns(df_pending)

        # 4. 正则解析 (高性能向量化)
        df_pending = self._apply_regex_patterns(df_pending)

        # 5. 复杂解析 (迭代处理兜底)
        df_pending = self._process_complex_rows(df_pending)

        # 6. 校验与自动修复
        validation_result = self._validate_and_autofix(df_pending)
        df_parsed = validation_result["df"]

        # 7. 在内存中合并：用解析结果更新原表
        self.logger.info("💾 合并解析结果...")
        
        update_cols = ['P_Flag', 'P_Key', 'P_Type', 'P_Check', 'Skufix_Check']
        for i in range(1, 11):
            update_cols.extend([f'P_SKU{i}', f'P_Quantity{i}'])
        
        for col in update_cols:
            if col not in df_all.columns:
                df_all[col] = None
        
        df_all = df_all.set_index('row_hash')
        df_parsed = df_parsed.set_index('row_hash')
        
        for col in update_cols:
            if col in df_parsed.columns:
                df_all.loc[df_parsed.index, col] = df_parsed[col]
        
        # [V2.3] 在内存中标记为已处理 (待写入时一起更新)
        df_all.loc[df_parsed.index, 'Processed_T'] = 1
        
        df_all = df_all.reset_index()

        # [V2.3] 不写数据库，返回处理后的 DataFrame 供 Transformer 使用
        self.logger.info(f"✅ 解析完成: {len(df_parsed)} 条记录")
        
        return {
            "status": "success",
            "auto_fixed": validation_result["fixed_logs"],
            "pending_count": validation_result["failed_count"],
            "df_trans": df_all,  # 返回处理后的 DataFrame
            "date_range": date_range,
        }

    def _init_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """初始化必要的列"""
        # 标准化列名
        col_map = {c.lower().replace(" ", ""): c for c in df.columns}
        if 'customlabel' in col_map:
            df.rename(columns={col_map['customlabel']: 'Custom label'}, inplace=True)
        elif 'Custom label' not in df.columns:
            df['Custom label'] = ''

        # 初始化 P_* 列
        for col in self.parse_cols:
            if col not in df.columns:
                df[col] = None

        if 'Item title' not in df.columns:
            df['Item title'] = ''

        # 确保标记列为整数类型 (fillna 0)
        df['P_Flag'] = df['P_Flag'].fillna(0).astype(int)
        return df

    def _apply_regex_patterns(self, df: pd.DataFrame) -> pd.DataFrame:
        """[Stage 1] 向量化正则匹配"""
        self.logger.info(" 执行正则解析 (Vectorized)...")

        s_label = df['Custom label'].astype(str).str.strip()
        mask_todo = (df['P_Flag'] == 0)

        # Pattern 1: Single (e.g., "ABCD-1234.1")
        # 允许字符: A-Z, 0-9, -, /, _
        pat1 = r'^(?:[A-Za-z]{1}[A-Za-z0-9]{0,2}\.)?(?P<SKU>[A-Za-z0-9\-_/]{7,})\.(?P<Quantity>\d{1,3})(?P<QuantityKey>\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$'
        ext1 = s_label[mask_todo].str.extract(pat1)
        idx1 = ext1[ext1['SKU'].notna()].index

        if not idx1.empty:
            df.loc[idx1, 'P_Flag'] = 1
            df.loc[idx1, 'P_Type'] = 'single'
            df.loc[idx1, 'P_SKU1'] = ext1.loc[idx1, 'SKU']
            df.loc[idx1, 'P_Quantity1'] = ext1.loc[idx1, 'Quantity']
            df.loc[idx1, 'P_Key'] = ext1.loc[idx1, 'QuantityKey'].apply(lambda x: 2 if pd.notna(x) else 0)
            df.loc[idx1, 'Skufix_Check'] = 1

        # Pattern 2: Dual (e.g., "PART1.1+PART2.1")
        # [Fix] 稍微放宽前缀匹配，防止 ZD. 这种被漏掉 ([A-Za-z0-2] -> [A-Za-z0-9])
        mask_todo = (df['P_Flag'] == 0)
        pat2 = r'^(?:[A-Za-z]{1}[A-Za-z0-9]{0,2}\.)?(?P<S1>[A-Za-z0-9/\-_]{7,})\.(?P<Q1>\d{1,3})(?P<K1>\+2K)?[\+\.](?P<S2>[A-Za-z0-9/\-_]{7,})\.(?P<Q2>\d{1,3})(?P<K2>\+2K)?(?:\.[A-Za-z0-9_]*){0,2}$'
        ext2 = s_label[mask_todo].str.extract(pat2)
        idx2 = ext2[ext2['S1'].notna() & ext2['S2'].notna()].index

        if not idx2.empty:
            df.loc[idx2, 'P_Flag'] = 2
            df.loc[idx2, 'P_Type'] = 'dual'
            df.loc[idx2, 'P_SKU1'] = ext2.loc[idx2, 'S1']
            df.loc[idx2, 'P_Quantity1'] = ext2.loc[idx2, 'Q1']
            df.loc[idx2, 'P_SKU2'] = ext2.loc[idx2, 'S2']
            df.loc[idx2, 'P_Quantity2'] = ext2.loc[idx2, 'Q2']
            k1 = ext2.loc[idx2, 'K1'].notna().astype(int) * 2
            k2 = ext2.loc[idx2, 'K2'].notna().astype(int) * 2
            df.loc[idx2, 'P_Key'] = k1 + k2
            df.loc[idx2, 'Skufix_Check'] = 1

        return df

    def _process_complex_rows(self, df: pd.DataFrame) -> pd.DataFrame:
        """[Stage 2] 迭代解析复杂行"""
        mask_complex = (df['P_Flag'] == 0)
        count = mask_complex.sum()
        if count == 0: return df

        self.logger.info(f"🐢 处理 {count} 条复杂记录...")
        junk_chars = {'--', '-', 'N/A', 'NULL', 'NONE', '', 'NAN'}
        # [Fix] 放宽前缀匹配
        prefix_pattern = re.compile(r'^(?:[A-Za-z]{1}[A-Za-z0-9]{0,2}\.)?(?P<main>.+?)(?:\.[A-Za-z0-9_]*)?$')

        # [Fix] 转换为列表避免迭代时索引问题
        complex_indices = df[mask_complex].index.tolist()
        
        for idx in complex_indices:
            # [Fix] 安全获取值
            label_val = df.loc[idx, 'Custom label']
            if isinstance(label_val, pd.Series):
                label_val = label_val.iloc[0] if len(label_val) > 0 else ""
            raw_label = str(label_val).strip()
            
            match = prefix_pattern.match(raw_label)
            main_part = match.group('main') if match else raw_label

            parts = main_part.split('+')
            p_key = 0
            p_skus = []
            p_qtys = []
            valid_parse = False

            for seg in parts:
                seg = seg.strip()
                if not seg or seg.upper() in junk_chars: continue
                if seg.upper() == '2K':
                    p_key += 2
                    continue
                if '+2K' in seg:
                    p_key += 2
                    seg = seg.replace('+2K', '')

                arr = seg.split('.')
                code = arr[0].upper().strip()
                qty = arr[1] if len(arr) > 1 else '1'

                if code in junk_chars: continue

                # 快速查表修正 (Fast Fix)
                if code not in self.corrector.valid_skus and code in self.fix_map:
                    code = self.fix_map[code]['sku']

                p_skus.append(code)
                p_qtys.append(qty)
                valid_parse = True

            if valid_parse:
                limit = min(len(p_skus), 10)
                for i in range(limit):
                    df.loc[idx, f'P_SKU{i + 1}'] = p_skus[i]
                    df.loc[idx, f'P_Quantity{i + 1}'] = p_qtys[i]

                df.loc[idx, 'P_Flag'] = 5
                df.loc[idx, 'P_Key'] = p_key
                df.loc[idx, 'P_Check'] = 1
                df.loc[idx, 'Skufix_Check'] = 1

        return df

    def _validate_and_autofix(self, df: pd.DataFrame) -> Dict[str, Any]:
        """[Stage 3] 校验与自动修复"""
        self.logger.info("🔍 执行 SKU 校验与自动修复...")

        # [Critical Fix]
        # 之前逻辑: mask_check = (df['P_Flag'] > 0) & (df['P_Flag'] != 99)
        # 问题: 99 表示上次校验失败。如果用户去 DB 加了 SKU，下次跑必须重检 99 的行，否则永远是 99。
        # 修正: 只要有解析结果 (P_Flag > 0)，就必须重新校验。
        mask_check = (df['P_Flag'] > 0)

        fix_logs = []
        count_failed = 0

        # [Fix] 使用 iterrows 遍历，避免 df.at 返回 Series 的问题
        check_indices = df[mask_check].index.tolist()
        
        for idx in check_indices:
            is_row_valid = True
            
            # 安全获取标量值
            custom_label = str(df.loc[idx, 'Custom label']) if 'Custom label' in df.columns else ""
            order_num = str(df.loc[idx, 'Order number']) if 'Order number' in df.columns else ""

            for i in range(1, 11):
                sku_col = f'P_SKU{i}'
                qty_col = f'P_Quantity{i}'
                
                # 安全获取 SKU 值
                sku_val = df.loc[idx, sku_col] if sku_col in df.columns else None
                
                # [Fix] 确保是标量值
                if isinstance(sku_val, pd.Series):
                    sku_val = sku_val.iloc[0] if len(sku_val) > 0 else None

                if pd.isna(sku_val) or str(sku_val).strip() == "": 
                    continue
                    
                sku = str(sku_val).strip().upper()

                # 1. 检查是否存在
                if self.corrector.is_valid_sku(sku):
                    continue

                # 2. 尝试自动修复 (Memory Recall)
                fixed_sku, fixed_qty = self.corrector.find_auto_fix(custom_label, sku)

                if fixed_sku:
                    # 安全获取数量值
                    qty_val = df.loc[idx, qty_col] if qty_col in df.columns else None
                    if isinstance(qty_val, pd.Series):
                        qty_val = qty_val.iloc[0] if len(qty_val) > 0 else ""
                    old_qty_val = str(qty_val).strip() if pd.notna(qty_val) else ""
                    
                    df.loc[idx, sku_col] = fixed_sku
                    new_qty_val = old_qty_val
                    if fixed_qty and str(fixed_qty).strip():
                        df.loc[idx, qty_col] = fixed_qty
                        new_qty_val = str(fixed_qty).strip()
                    fix_logs.append({
                        "order": order_num,
                        "old": sku,
                        "new": fixed_sku,
                        "old_qty": old_qty_val,
                        "new_qty": new_qty_val,
                        "custom_label": custom_label
                    })
                else:
                    is_row_valid = False

            if not is_row_valid:
                df.loc[idx, 'P_Flag'] = 99  # 标记为异常
                count_failed += 1
            else:
                # [Fix] 如果校验通过了，且之前是 99，要恢复成正常状态 (如 5)
                current_flag = df.loc[idx, 'P_Flag']
                if isinstance(current_flag, pd.Series):
                    current_flag = current_flag.iloc[0] if len(current_flag) > 0 else 0
                if current_flag == 99:
                    df.loc[idx, 'P_Flag'] = 5

        self.logger.info(f"校验结果: 自动修复 {len(fix_logs)} 项，剩余 {count_failed} 行异常。")
        return {"fixed_logs": fix_logs, "failed_count": count_failed, "df": df}