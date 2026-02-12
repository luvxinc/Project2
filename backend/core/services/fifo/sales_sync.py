# core/services/fifo/sales_sync.py
"""
销售数据 → FIFO 库存同步服务

功能:
1. 解析销售记录，根据 Action 判断出库/回库
2. 处理幂等性 (已处理的跳过)
3. 维护 FIFO 层级一致性

[创建日期] 2026-01-12
[关联文档] aid/reportanalysis/FIFO.md
"""

import pandas as pd
from datetime import datetime
from decimal import Decimal
from typing import Dict, List, Optional, Tuple
from sqlalchemy import text

from core.components.db.client import DBClient
from core.sys.logger import get_logger


class SalesFifoSyncService:
    """销售数据 → FIFO 库存同步服务"""
    
    def __init__(self, return_ratios: Optional[Dict[str, float]] = None):
        """
        Args:
            return_ratios: 回库比例配置
                {'RE': 0.6, 'CR': 0.5, 'CC': 0.3}
        """
        self.db = DBClient()
        self.logger = get_logger("SalesFifoSync")
        
        # 回库比例 (用户可配置 RE/CR/CC)
        default_ratios = {'RE': 0.6, 'CR': 0.5, 'CC': 0.3}
        if return_ratios:
            default_ratios.update(return_ratios)
        
        self.return_ratios = {
            'NN': 1.0,   # 正常销售: 100% 出库
            'CA': 1.0,   # 取消: 100% 回库 (固定)
            'RE': default_ratios.get('RE', 0.6),
            'CR': default_ratios.get('CR', 0.5),
            'CC': default_ratios.get('CC', 0.3),
            'PD': 0.0,   # 银行投诉: 0% (固定)
        }
    
    def sync_from_sales(self, df: pd.DataFrame, progress_callback=None) -> Dict:
        """
        主入口：同步销售数据到 FIFO 系统
        
        Args:
            df: 已入库 Data_Clean_Log 的 DataFrame
            progress_callback: 进度回调函数 (current, total, msg)
            
        Returns:
            {"out_count": 出库笔数, "in_count": 回库笔数, "skip_count": 跳过笔数, "error_count": 错误数}
        """
        stats = {"out_count": 0, "in_count": 0, "skip_count": 0, "error_count": 0}
        
        if df.empty:
            return stats
        
        total = len(df)
        report_interval = max(1, total // 100)  # 每 1% 报告一次
        
        for idx, row in df.iterrows():
            try:
                result = self._process_row(row)
                if result == 'out':
                    stats["out_count"] += 1
                elif result == 'in':
                    stats["in_count"] += 1
                else:
                    stats["skip_count"] += 1
            except Exception as e:
                order_num = row.get('order number', 'Unknown')
                self.logger.error(f"FIFO 同步失败: {e}, Order: {order_num}")
                stats["error_count"] += 1
            
            # 每处理 report_interval 条就报告一次进度
            current = stats["out_count"] + stats["in_count"] + stats["skip_count"] + stats["error_count"]
            if progress_callback and current % report_interval == 0:
                progress_callback(current, total, f"出库:{stats['out_count']} 回库:{stats['in_count']}")
        
        # 最终进度报告
        if progress_callback:
            progress_callback(total, total, f"完成 - 出库:{stats['out_count']} 回库:{stats['in_count']}")
        
        return stats
    
    def _process_row(self, row: pd.Series) -> Optional[str]:
        """处理单行销售记录"""
        action = str(row.get('action', '')).strip().upper()
        
        # PD 不操作
        if action == 'PD':
            return 'skip'
        
        # 未知 action 跳过
        if action not in ['NN', 'CA', 'RE', 'CR', 'CC']:
            return 'skip'
        
        # 构建唯一标识
        ref_key = self._build_ref_key(row)
        
        # 幂等性检查
        if self._is_processed(ref_key):
            return 'skip'
        
        # 解析 SKU 列表
        sku_list = self._parse_skus(row)
        if not sku_list:
            return 'skip'
        
        order_date = row.get('order date')
        
        if action == 'NN':
            # 正常销售 → 出库
            self._fifo_out(sku_list, order_date, ref_key)
            return 'out'
        
        elif action == 'CA':
            # 取消 → 100% 精确回库
            self._fifo_return_full(row, ref_key)
            return 'in'
        
        elif action in ['RE', 'CR', 'CC']:
            # 部分回库 (按比例，优先最贵)
            ratio = self.return_ratios[action]
            if ratio > 0:
                self._fifo_return_partial(row, ref_key, ratio)
                return 'in'
            return 'skip'
        
        return 'skip'
    
    def _build_ref_key(self, row: pd.Series) -> str:
        """构建唯一标识"""
        seller = str(row.get('seller', '')).strip()
        order_number = str(row.get('order number', '')).strip()
        item_id = str(row.get('item id', '')).strip()
        action = str(row.get('action', '')).strip().upper()
        
        return f"SALES:{seller}:{order_number}:{item_id}:{action}"
    
    def _is_processed(self, ref_key: str) -> bool:
        """检查是否已处理过"""
        sql = "SELECT 1 FROM in_dynamic_tran WHERE note = :ref_key LIMIT 1"
        result = self.db.read_df(sql, {"ref_key": ref_key})
        return not result.empty
    
    def _parse_skus(self, row: pd.Series) -> List[Tuple[str, int]]:
        """解析 SKU 列表，返回 [(sku, qtyp), ...]"""
        result = []
        
        for i in range(1, 11):
            sku = str(row.get(f'sku{i}', '')).strip().upper()
            
            # qtyp 是实际出库量
            qtyp_val = row.get(f'qtyp{i}', 0)
            try:
                qtyp = int(float(qtyp_val)) if qtyp_val else 0
            except (ValueError, TypeError):
                qtyp = 0
            
            if not sku or sku.lower() in ['nan', 'none', '']:
                continue
            
            if qtyp > 0:
                result.append((sku, qtyp))
        
        return result
    
    def _fifo_out(self, sku_list: List[Tuple[str, int]], order_date, ref_key: str):
        """FIFO 出库"""
        try:
            with self.db.atomic_transaction() as conn:
                for sku, qty in sku_list:
                    if qty <= 0:
                        continue
                    
                    # 1. 创建出库流水
                    result = conn.execute(text("""
                        INSERT INTO in_dynamic_tran 
                        (date_record, sku, price, quantity, action, type, note)
                        VALUES (:date, :sku, 0, :qty, 'out', 'sale', :note)
                    """), {
                        "date": order_date,
                        "sku": sku,
                        "qty": qty,
                        "note": ref_key
                    })
                    out_record_id = result.lastrowid
                    self.logger.debug(f"[FIFO OUT] Created tran record: id={out_record_id}, sku={sku}, qty={qty}")
                    
                    # 2. FIFO 分配 (从最早层开始)
                    remaining = qty
                    layers = conn.execute(text("""
                        SELECT layer_id, qty_remaining, unit_cost
                        FROM in_dynamic_fifo_layers
                        WHERE sku = :sku AND qty_remaining > 0
                        ORDER BY in_date ASC, layer_id ASC
                    """), {"sku": sku}).fetchall()
                    
                    if not layers:
                        self.logger.warning(f"[FIFO OUT] 无可用库存层: sku={sku}, ref={ref_key}")
                    
                    alloc_count = 0
                    for layer_id, layer_qty, unit_cost in layers:
                        if remaining <= 0:
                            break
                        
                        alloc_qty = min(remaining, layer_qty)
                        cost_alloc = alloc_qty * float(unit_cost)
                        
                        # 记录分配
                        conn.execute(text("""
                            INSERT INTO in_dynamic_fifo_alloc
                            (out_record_id, sku, out_date, layer_id, qty_alloc, unit_cost, cost_alloc)
                            VALUES (:out_id, :sku, :out_date, :layer_id, :qty, :unit_cost, :cost)
                        """), {
                            "out_id": out_record_id,
                            "sku": sku,
                            "out_date": order_date,
                            "layer_id": layer_id,
                            "qty": alloc_qty,
                            "unit_cost": unit_cost,
                            "cost": cost_alloc
                        })
                        alloc_count += 1
                        
                        # 更新层剩余
                        new_remaining = layer_qty - alloc_qty
                        conn.execute(text("""
                            UPDATE in_dynamic_fifo_layers
                            SET qty_remaining = :new_qty,
                                closed_at = CASE WHEN :new_qty = 0 THEN NOW() ELSE NULL END
                            WHERE layer_id = :layer_id
                        """), {"new_qty": new_remaining, "layer_id": layer_id})
                        
                        remaining -= alloc_qty
                    
                    self.logger.debug(f"[FIFO OUT] Allocated {alloc_count} layers for sku={sku}")
                    
                    if remaining > 0:
                        self.logger.warning(f"[FIFO OUT] 库存不足: SKU={sku}, 缺口={remaining}")
        except Exception as e:
            import traceback
            self.logger.error(f"[FIFO OUT ERROR] ref={ref_key}, error={e}\n{traceback.format_exc()}")
            raise  # 重新抛出，让调用方知道失败了
    
    def _fifo_return_full(self, row: pd.Series, ref_key: str):
        """CA 回库: 100% 精确还原"""
        seller = str(row.get('seller', '')).strip()
        order_number = str(row.get('order number', '')).strip()
        item_id = str(row.get('item id', '')).strip()
        order_date = row.get('order date')
        
        # 查找对应的 NN 出库记录
        nn_ref_key = f"SALES:{seller}:{order_number}:{item_id}:NN"
        nn_records = self.db.read_df("""
            SELECT record_id, sku, quantity 
            FROM in_dynamic_tran 
            WHERE note = :ref_key AND action = 'out'
        """, {"ref_key": nn_ref_key})
        
        if nn_records.empty:
            raise Exception(f"找不到对应的 NN 记录: {nn_ref_key}")
        
        with self.db.atomic_transaction() as conn:
            for _, nn_row in nn_records.iterrows():
                nn_record_id = nn_row['record_id']
                sku = nn_row['sku']
                
                # 获取原始 allocation
                allocs = conn.execute(text("""
                    SELECT layer_id, qty_alloc, unit_cost
                    FROM in_dynamic_fifo_alloc
                    WHERE out_record_id = :record_id
                    ORDER BY unit_cost DESC
                """), {"record_id": nn_record_id}).fetchall()
                
                if not allocs:
                    continue
                
                total_qty = sum(a[1] for a in allocs)
                
                # 创建回库流水
                result = conn.execute(text("""
                    INSERT INTO in_dynamic_tran 
                    (date_record, sku, price, quantity, action, type, note)
                    VALUES (:date, :sku, 0, :qty, 'in', 'cancel', :note)
                """), {
                    "date": order_date,
                    "sku": sku,
                    "qty": total_qty,
                    "note": ref_key
                })
                
                # 精确还原每个层
                for layer_id, qty_alloc, unit_cost in allocs:
                    # 恢复层的数量
                    conn.execute(text("""
                        UPDATE in_dynamic_fifo_layers
                        SET qty_remaining = qty_remaining + :qty,
                            closed_at = NULL
                        WHERE layer_id = :layer_id
                    """), {"qty": qty_alloc, "layer_id": layer_id})
    
    def _fifo_return_partial(self, row: pd.Series, ref_key: str, ratio: float):
        """部分回库: 按比例 + 优先还最贵层"""
        seller = str(row.get('seller', '')).strip()
        order_number = str(row.get('order number', '')).strip()
        item_id = str(row.get('item id', '')).strip()
        order_date = row.get('order date')
        
        # 查找对应的 NN 出库记录
        nn_ref_key = f"SALES:{seller}:{order_number}:{item_id}:NN"
        nn_records = self.db.read_df("""
            SELECT record_id, sku, quantity 
            FROM in_dynamic_tran 
            WHERE note = :ref_key AND action = 'out'
        """, {"ref_key": nn_ref_key})
        
        if nn_records.empty:
            raise Exception(f"找不到对应的 NN 记录: {nn_ref_key}")
        
        with self.db.atomic_transaction() as conn:
            for _, nn_row in nn_records.iterrows():
                nn_record_id = nn_row['record_id']
                sku = nn_row['sku']
                
                # 获取 allocation (按 unit_cost 降序 - 最贵的在前)
                allocs = conn.execute(text("""
                    SELECT layer_id, qty_alloc, unit_cost
                    FROM in_dynamic_fifo_alloc
                    WHERE out_record_id = :record_id
                    ORDER BY unit_cost DESC
                """), {"record_id": nn_record_id}).fetchall()
                
                if not allocs:
                    continue
                
                # 计算回库数量
                total_qty = sum(a[1] for a in allocs)
                return_qty = int(total_qty * ratio)
                
                if return_qty <= 0:
                    continue
                
                # 创建回库流水
                result = conn.execute(text("""
                    INSERT INTO in_dynamic_tran 
                    (date_record, sku, price, quantity, action, type, note)
                    VALUES (:date, :sku, 0, :qty, 'in', 'return', :note)
                """), {
                    "date": order_date,
                    "sku": sku,
                    "qty": return_qty,
                    "note": ref_key
                })
                
                # 优先还最贵层
                remaining = return_qty
                for layer_id, qty_alloc, unit_cost in allocs:
                    if remaining <= 0:
                        break
                    
                    restore_qty = min(remaining, qty_alloc)
                    
                    # 恢复该层
                    conn.execute(text("""
                        UPDATE in_dynamic_fifo_layers
                        SET qty_remaining = qty_remaining + :qty,
                            closed_at = NULL
                        WHERE layer_id = :layer_id
                    """), {"qty": restore_qty, "layer_id": layer_id})
                    
                    remaining -= restore_qty
