# core/services/etl/transformer.py
"""
文件说明: 交易数据转换引擎 (Transformer) - Date Normalized
主要功能:
1. 将 Raw Data 转换为 Clean Data。
2. 业务逻辑计算 (Action/Seller/Fee Proration)。
3. [Fix] 强制日期格式化: 无论原始格式如何，入库前统一转为 'YYYY-MM-DD'。
4. 四维去重并增量写入。
"""

import pandas as pd
import numpy as np
from sqlalchemy import text
from sqlalchemy.types import Text
from typing import Callable, Optional
from dateutil import parser  # [New] 引入强力解析器

from core.components.db.client import DBClient
from core.sys.logger import get_logger


class TransactionTransformer:

    def __init__(self):
        self.db = DBClient()
        self.logger = get_logger("TransactionTransformer")

        self.output_cols = [
            'order date', 'seller', 'order number', 'item id', 'item title', 'full sku', 'quantity',
            'revenue', 'Shipping and handling', 'Seller collected tax', 'eBay collected tax',
            'Final Value Fee - fixed', 'Final Value Fee - variable', 'Regulatory operating fee',
            'International fee', 'Promoted Listings fee', 'Payments dispute fee',
            'action', 'Refund',
            'Shipping label-Earning data', 'Shipping label-Regular',
            'Shipping label-underpay', 'Shipping label-overpay', 'Shipping label-Return',
            'buyer username', 'ship to city', 'ship to country'
        ]
        for i in range(1, 11):
            self.output_cols.extend([f'sku{i}', f'qty{i}', f'qtyp{i}'])

    def _safe_float(self, series: pd.Series) -> pd.Series:
        if series.empty: return series
        clean = series.astype(str).str.replace(r'[$,\s]', '', regex=True)
        return pd.to_numeric(clean, errors='coerce').fillna(0.0)

    def _normalize_date(self, date_val) -> str:
        """
        [New] 强力日期解析
        Input: 'Jun 30, 2025', '2025-06-30', '30-Jun-25'
        Output: '2025-06-30'
        """
        if pd.isna(date_val) or str(date_val).strip() == "":
            return None

        s = str(date_val).strip()
        try:
            # 优先尝试 pandas 自动推断
            dt = pd.to_datetime(s, errors='raise')
            return dt.strftime('%Y-%m-%d')
        except:
            try:
                # 尝试 dateutil (更智能)
                dt = parser.parse(s)
                return dt.strftime('%Y-%m-%d')
            except:
                # 解析失败，返回原值以便排查
                return s

    def run(self, progress_callback: Optional[Callable[[float, str], None]] = None,
            return_ratios: dict = None,
            df_trans_input: pd.DataFrame = None,
            date_range: tuple = None) -> dict:
        """
        [主入口] 执行 ETL 转换流程 (V2.3 - 日期区间增量处理)
        
        Args:
            progress_callback: 进度回调函数
            return_ratios: FIFO 回库比例配置 {'RE': 0.6, 'CR': 0.5, 'CC': 0.3}
            df_trans_input: 从 Parser 传入的 DataFrame (可选)
            date_range: (date_min, date_max) 日期范围 (可选)
        """

        def report(p, msg):
            if progress_callback: progress_callback(p, msg)
            self.logger.info(msg)

        try:
            report(0.05, "🚀 [Transformer] 启动转换引擎 (增量模式 V2.3)...")

            # =================================================================
            # [V2.3] 日期区间增量处理
            # 1. 优先使用传入的 df_trans，否则根据日期范围读取
            # 2. 只处理该日期范围内的数据
            # 3. 在内存中完成所有处理
            # 4. 最后一次性写入数据库
            # =================================================================
            
            # Step 1: 获取 Transaction 数据
            if df_trans_input is not None:
                df_trans = df_trans_input.copy()
                self.logger.info(f"使用传入的 DataFrame: {len(df_trans)} 条")
            elif date_range and date_range[0] and date_range[1]:
                date_min, date_max = date_range
                self.logger.info(f"📅 日期范围: {date_min} ~ {date_max}")
                df_trans = self.db.read_df(f"""
                    SELECT * FROM Data_Transaction 
                    WHERE `Transaction creation date` BETWEEN '{date_min}' AND '{date_max}'
                """)
            else:
                # 兜底：读取待处理的数据
                df_trans = self.db.read_df("""
                    SELECT * FROM Data_Transaction 
                    WHERE COALESCE(Processed_T, 0) = 0
                """)
            
            if df_trans.empty:
                return {"status": "empty", "message": "Transaction 数据为空"}
            
            # Step 2: 获取订单号列表
            df_trans.columns = df_trans.columns.str.strip().str.lower()
            pending_orders = df_trans['order number'].dropna().unique().tolist()
            self.logger.info(f"发现 {len(pending_orders)} 个订单")
            
            order_placeholders = ', '.join([f"'{o}'" for o in pending_orders])
            
            # Step 3: 获取 Earning 数据
            df_earn = self.db.read_df(f"""
                SELECT * FROM Data_Order_Earning 
                WHERE `Order number` IN ({order_placeholders})
            """)
            
            # 保存需要更新标记的 row_hash
            trans_hashes_to_update = df_trans[df_trans['processed_t'].isna() | (df_trans['processed_t'].astype(str) == '0')]['row_hash'].tolist() if 'row_hash' in df_trans.columns and 'processed_t' in df_trans.columns else []
            
            earn_hashes_to_update = self.db.read_df(f"""
                SELECT row_hash FROM Data_Order_Earning 
                WHERE `Order number` IN ({order_placeholders})
                  AND COALESCE(Processed_E, 0) = 0
            """)['row_hash'].tolist() if not df_earn.empty else []
            
            self.logger.info(f"待处理: Transaction={len(df_trans)}, Earning={len(df_earn)}")
            self.logger.info(f"待标记: Trans_hash={len(trans_hashes_to_update)}, Earn_hash={len(earn_hashes_to_update)}")

            df_earn.columns = df_earn.columns.str.strip().str.lower() if not df_earn.empty else df_earn.columns

            # --- 数值清洗 ---
            report(0.15, "🧹 执行数值清洗...")
            num_cols = [
                'item subtotal', 'quantity', 'gross transaction amount',
                'shipping and handling', 'seller collected tax', 'ebay collected tax',
                'final value fee - fixed', 'final value fee - variable', 'regulatory operating fee',
                'international fee', 'promoted listings fee', 'payments dispute fee', 'refund'
            ]
            for c in num_cols:
                if c in df_trans.columns:
                    df_trans[c] = self._safe_float(df_trans[c])

            # Earning 表处理
            if not df_earn.empty and 'shipping labels' in df_earn.columns:
                df_earn['shipping labels'] = self._safe_float(df_earn['shipping labels'])
                earn_map = df_earn.groupby('order number')['shipping labels'].sum().reset_index()
                earn_map.rename(columns={'shipping labels': 'Shipping label-Earning data'}, inplace=True)
            else:
                earn_map = pd.DataFrame(columns=['order number', 'Shipping label-Earning data'])

            # --- 业务逻辑 ---
            report(0.30, "🧠 计算业务规则...")
            for col in ['type', 'reference id', 'seller', 'item id']:
                if col not in df_trans.columns: df_trans[col] = ''

            # Action Logic - 识别退货/取消类型
            df_trans['type_lower'] = df_trans['type'].astype(str).str.lower()
            df_trans['ref_lower'] = df_trans['reference id'].astype(str).str.lower()
            df_trans['action_code'] = 'NN'  # 默认

            # 识别各类退货/取消
            mask_pd = df_trans['type_lower'] == 'payment dispute'
            df_trans.loc[mask_pd, 'action_code'] = 'PD'

            mask_claim = df_trans['type_lower'] == 'claim'
            mask_case = mask_claim & df_trans['ref_lower'].str.contains('case', case=False)
            df_trans.loc[mask_case, 'action_code'] = 'CC'

            mask_req = mask_claim & df_trans['ref_lower'].str.contains('request', case=False)
            df_trans.loc[mask_req, 'action_code'] = 'CR'

            mask_refund = df_trans['type_lower'] == 'refund'
            mask_ret = mask_refund & df_trans['ref_lower'].str.contains('return', case=False)
            df_trans.loc[mask_ret, 'action_code'] = 'RE'

            mask_cancel = mask_refund & df_trans['ref_lower'].str.contains('cancel', case=False)
            df_trans.loc[mask_cancel, 'action_code'] = 'CA'

            # 提取退货/取消记录 (稍后单独处理)
            mask_return_action = df_trans['action_code'].isin(['CA', 'RE', 'CR', 'CC'])
            df_returns_raw = df_trans[mask_return_action][['order number', 'action_code', 'transaction creation date']].copy()
            df_returns_raw = df_returns_raw.drop_duplicates('order number')  # 每个订单一条退货记录

            # Seller Logic
            df_trans['seller_clean'] = df_trans['seller'].astype(str).str.strip().str.replace(r'[\'\"]', '', regex=True)
            df_trans['is_prio'] = df_trans['seller_clean'].str.lower().str.contains('esparts').astype(int)
            seller_map = \
            df_trans.sort_values(['is_prio', 'seller_clean'], ascending=[False, True]).drop_duplicates('order number')[
                ['order number', 'seller_clean']]
            seller_map.rename(columns={'seller_clean': 'seller'}, inplace=True)

            # --- 物流费用提取 ---
            report(0.50, "🚚 提取隐性物流成本...")
            mask_ship = df_trans['type_lower'] == 'shipping label'
            df_ship = df_trans[mask_ship].copy()
            if 'description' not in df_ship.columns: df_ship['description'] = ''

            df_ship['desc_lower'] = df_ship['description'].astype(str).str.lower()
            df_ship['amt'] = df_ship['gross transaction amount']

            df_ship['underpay'] = np.where(df_ship['desc_lower'].str.contains('underpaid'), df_ship['amt'], 0.0)
            df_ship['overpay'] = np.where(df_ship['desc_lower'].str.contains('overpaid'), df_ship['amt'], 0.0)
            df_ship['return'] = np.where(df_ship['desc_lower'].str.contains('return shipping'), df_ship['amt'], 0.0)
            df_ship['regular'] = np.where(~df_ship['desc_lower'].str.contains('underpaid|overpaid|return|voided|bulk'),
                                          df_ship['amt'], 0.0)

            ship_agg = df_ship.groupby('order number')[['underpay', 'overpay', 'return', 'regular']].sum().reset_index()
            ship_agg.columns = ['order number', 'Shipping label-underpay', 'Shipping label-overpay',
                                'Shipping label-Return', 'Shipping label-Regular']

            # --- 主表构建 (所有 Order 都是 NN) ---
            report(0.70, "🧮 订单级费用分摊...")
            mask_order = (df_trans['type_lower'] == 'order') & (df_trans['item id'].notna())
            df_main = df_trans[mask_order].copy()
            df_main['action'] = 'NN'  # 所有 Order 记录都是 NN

            for c in ['seller']:
                if c in df_main.columns: df_main.drop(columns=[c], inplace=True)

            df_main = df_main.merge(seller_map, on='order number', how='left')
            df_main = df_main.merge(earn_map, on='order number', how='left')
            df_main = df_main.merge(ship_agg, on='order number', how='left')
            df_main.fillna(0, inplace=True)
            
            # === 生成退货/取消记录 (CA/RE/CR/CC) ===
            if not df_returns_raw.empty:
                self.logger.info(f"检测到 {len(df_returns_raw)} 条退货/取消订单")
                return_records = []
                for _, ret_row in df_returns_raw.iterrows():
                    order_num = ret_row['order number']
                    action_code = ret_row['action_code']
                    ret_date = ret_row['transaction creation date']
                    
                    # 找对应的 NN 记录
                    nn_rows = df_main[df_main['order number'] == order_num]
                    if nn_rows.empty:
                        continue
                    
                    # 复制每个 item 的 NN 记录，改 action
                    for _, nn_row in nn_rows.iterrows():
                        ret_record = nn_row.to_dict()
                        ret_record['action'] = action_code
                        if pd.notna(ret_date):
                            ret_record['transaction creation date'] = ret_date
                        return_records.append(ret_record)
                
                if return_records:
                    df_returns_final = pd.DataFrame(return_records)
                    df_main = pd.concat([df_main, df_returns_final], ignore_index=True)
                    self.logger.info(f"已添加 {len(return_records)} 条退货/取消记录")

            # 分摊
            order_totals = df_main.groupby('order number')['item subtotal'].transform('sum')
            df_main['ratio'] = np.where(order_totals != 0, df_main['item subtotal'] / order_totals, 0.0)

            for col in ['Shipping label-Earning data', 'Shipping label-underpay', 'Shipping label-overpay',
                        'Shipping label-Return', 'Shipping label-Regular']:
                if col in df_main.columns: df_main[col] = df_main[col] * df_main['ratio']

            col_mapping = {
                'transaction creation date': 'order date',
                'item subtotal': 'revenue',
                'shipping and handling': 'Shipping and handling',
                'seller collected tax': 'Seller collected tax',
                'ebay collected tax': 'eBay collected tax',
                'final value fee - fixed': 'Final Value Fee - fixed',
                'final value fee - variable': 'Final Value Fee - variable',
                'regulatory operating fee': 'Regulatory operating fee',
                'international fee': 'International fee',
                'promoted listings fee': 'Promoted Listings fee'
            }
            df_main.rename(columns=col_mapping, inplace=True)

            # SKU 展平
            sku_parts = []
            for i in range(1, 11):
                s_col, q_col = f'p_sku{i}', f'p_quantity{i}'
                target_s, target_q, target_qp = f'sku{i}', f'qty{i}', f'qtyp{i}'

                if s_col not in df_main.columns:
                    df_main[target_s] = '';
                    df_main[target_q] = 0;
                    df_main[target_qp] = 0;
                    continue

                df_main[target_s] = df_main[s_col]
                df_main[target_q] = self._safe_float(df_main[q_col])
                df_main[target_qp] = df_main[target_q] * df_main['quantity']

                mask = df_main[target_s].notna() & (df_main[target_s] != '')
                part = df_main.loc[mask, target_s].astype(str) + "." + df_main.loc[mask, target_q].astype(int).astype(
                    str)
                sku_parts.append(part)

            if sku_parts:
                df_parts = pd.concat(sku_parts, axis=1)
                df_main['full sku'] = df_parts.apply(lambda x: "+".join(x.dropna()), axis=1)
            else:
                df_main['full sku'] = ''

            # [Mod] 强制日期标准化 (YYYY-MM-DD)
            df_main['order date'] = df_main['order date'].apply(self._normalize_date)

            # --- 入库 ---
            report(0.90, f"💾 四维去重并同步 ({len(df_main)} 行)...")

            df_final = pd.DataFrame()
            for c in self.output_cols:
                if c in df_main.columns:
                    df_final[c] = df_main[c]
                else:
                    df_final[c] = 0 if 'fee' in c.lower() or 'label' in c.lower() else ''

            staging = "Data_Clean_Log_Staging"
            target = "Data_Clean_Log"
            
            # 统计: 本次数据
            data_count = len(df_final)
            dedup_count = 0

            with self.db.atomic_transaction() as conn:
                df_final.to_sql(staging, conn, if_exists='replace', index=False,
                                dtype={c: Text() for c in df_final.columns})
                
                # [Fix] 确保 Staging 表 collation 与目标表一致，避免 JOIN 时报错
                conn.execute(text(f"ALTER TABLE `{staging}` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))

                conn.execute(text(f"CREATE INDEX idx_order ON `{staging}` (`order number`(30))"))
                conn.execute(text(f"CREATE INDEX idx_item ON `{staging}` (`item id`(30))"))
                conn.execute(text(f"CREATE INDEX idx_date ON `{staging}` (`order date`(10))"))

                exists = conn.execute(text(f"SHOW TABLES LIKE '{target}'")).first()
                if not exists:
                    conn.execute(text(f"RENAME TABLE `{staging}` TO `{target}`"))
                else:
                    # 统计 staging 表中有多少条记录在 target 表中已存在（即重复的，需要覆盖的）
                    # 这些记录不算"新上传"，只是覆盖旧数据
                    dedup_result = conn.execute(text(f"""
                        SELECT COUNT(*) as cnt FROM `{staging}` T2
                        WHERE EXISTS (
                            SELECT 1 FROM `{target}` T1
                            WHERE T1.`order number` = T2.`order number`
                            AND T1.`seller` = T2.`seller`
                            AND COALESCE(T1.`item id`, '') = COALESCE(T2.`item id`, '')
                            AND COALESCE(T1.`action`, '') = COALESCE(T2.`action`, '')
                        )
                    """)).first()
                    dedup_count = dedup_result[0] if dedup_result else 0
                    
                    del_sql = f"""
                        DELETE T1 FROM `{target}` T1 
                        INNER JOIN `{staging}` T2 
                        ON T1.`order number` = T2.`order number`
                        AND T1.`seller` = T2.`seller`
                        AND COALESCE(T1.`item id`, '') = COALESCE(T2.`item id`, '')
                        AND COALESCE(T1.`action`, '') = COALESCE(T2.`action`, '')
                    """
                    conn.execute(text(del_sql))

                    cols = ", ".join([f"`{c}`" for c in self.output_cols])
                    ins_sql = f"INSERT INTO `{target}` ({cols}) SELECT {cols} FROM `{staging}`"
                    conn.execute(text(ins_sql))
                    conn.execute(text(f"DROP TABLE `{staging}`"))

                # [V2.3] 写入 Transaction 表 (df_trans 已包含 Processed_T=1 标记)
                if df_trans_input is not None:
                    from sqlalchemy.types import Text as SAText
                    
                    # 获取原始表的列名
                    orig_cols = self.db.read_df("SELECT * FROM Data_Transaction LIMIT 0").columns.tolist()
                    
                    # 使用日期范围删除旧数据
                    if date_range and date_range[0] and date_range[1]:
                        conn.execute(text(f"""
                            DELETE FROM `Data_Transaction` 
                            WHERE `Transaction creation date` BETWEEN '{date_range[0]}' AND '{date_range[1]}'
                        """))
                        self.logger.info(f"已删除 Transaction 日期范围 {date_range[0]} ~ {date_range[1]} 的旧数据")
                    
                    # 恢复列名：建立小写到原始的映射
                    col_map = {c.lower(): c for c in orig_cols}
                    df_trans.columns = [col_map.get(c.lower(), c) for c in df_trans.columns]
                    
                    # 只保留原表存在的列
                    cols_to_keep = [c for c in df_trans.columns if c in orig_cols]
                    df_trans = df_trans[cols_to_keep]
                    
                    # 插入新数据
                    dtype_map = {c: SAText() for c in df_trans.columns}
                    df_trans.to_sql('Data_Transaction', conn, if_exists='append', index=False, chunksize=2000, dtype=dtype_map)
                    self.logger.info(f"已写入 {len(df_trans)} 条 Transaction 记录")
                
                # [V2.3] 更新 Earning 表的标记 (仍需 UPDATE，因为没有传入 df_earn)
                if earn_hashes_to_update:
                    hash_df = pd.DataFrame({'row_hash': earn_hashes_to_update})
                    hash_df.to_sql('_tmp_earn_hashes', conn, if_exists='replace', index=False)
                    conn.execute(text("""
                        UPDATE `Data_Order_Earning` E
                        INNER JOIN `_tmp_earn_hashes` H ON E.`row_hash` = H.`row_hash`
                        SET E.`Processed_E` = 1
                    """))
                    conn.execute(text("DROP TABLE IF EXISTS `_tmp_earn_hashes`"))
                    self.logger.info(f"已标记 {len(earn_hashes_to_update)} 条 Earning 记录为已处理")

            report(0.90, f"📦 同步 FIFO 库存 ({len(df_final)} 条)...")
            
            # [V2.3] 创建 FIFO 同步进度回调 (映射到 90%-99%)
            def fifo_progress(current, total, msg):
                if total > 0:
                    pct = 0.90 + (current / total) * 0.09  # 90% -> 99%
                    if progress_callback:
                        progress_callback(pct, f"📦 FIFO 同步: {current}/{total} ({msg})")
            
            # [V2.0] 调用 FIFO 同步服务
            fifo_stats = self._sync_fifo(df_final, return_ratios, progress_callback=fifo_progress)
            
            report(1.0, f"✅ ETL 完成 (FIFO: {fifo_stats['out_count']} 出库, {fifo_stats['in_count']} 回库)")
            
            # 返回统计信息
            return {
                'status': 'success',
                'data_count': data_count,
                'dedup_count': dedup_count,
                'actual_upload': data_count - dedup_count,
                'fifo_stats': fifo_stats,
            }

        except Exception as e:
            self.logger.error(f"Transformer Error: {e}")
            raise e

    def _sync_fifo(self, df: pd.DataFrame, return_ratios: dict = None, progress_callback=None) -> dict:
        """
        [V2.0] 同步销售数据到 FIFO 系统
        """
        try:
            from core.services.fifo.sales_sync import SalesFifoSyncService
            
            fifo_service = SalesFifoSyncService(return_ratios=return_ratios)
            return fifo_service.sync_from_sales(df, progress_callback=progress_callback)
        except Exception as e:
            self.logger.error(f"FIFO 同步失败: {e}")
            return {"out_count": 0, "in_count": 0, "skip_count": 0, "error_count": 1}