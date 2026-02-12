# core/services/inventory_snapshot.py
"""
库存资产快照分析器

[2026-01-13 优化] 增加FIFO四表数据:
- FIFO库存数量 (理论库存)
- FIFO库存价值 (使用landed_price)
- 下订数量/价值
- 在途数量/价值
"""
import pandas as pd
from datetime import date
from core.services.finance.base import ProfitAnalyzerBase
from core.services.inventory.repository import InventoryRepository
from core.components.db.client import DBClient


class InventorySnapshot(ProfitAnalyzerBase):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.repo = InventoryRepository()

    def run(self):
        self.log("📸 开始执行库存资产快照分析...")
        
        target_date = date.today()
        target_date_str = target_date.strftime('%Y-%m-%d')

        # ========== 1. 获取所有SKU ==========
        sku_df = DBClient.read_df("SELECT DISTINCT SKU FROM Data_COGS ORDER BY SKU")
        all_skus = sku_df['SKU'].tolist() if not sku_df.empty else []
        
        if not all_skus:
            self.log("⚠️ 无SKU数据，跳过快照生成。")
            return

        # ========== 2. 获取实际库存 (Data_inventory 最新列) ==========
        df_inv = self.repo.get_inventory_latest()
        actual_inv = {}
        if not df_inv.empty:
            df_inv['SKU'] = df_inv['SKU'].astype(str).str.strip().str.upper()
            actual_inv = dict(zip(df_inv['SKU'], df_inv['Quantity']))

        # ========== 3. 获取FIFO理论库存和价值 ==========
        self.log("正在读取FIFO理论库存...")
        
        # 理论库存数量
        fifo_qty_sql = """
            SELECT sku, SUM(qty_remaining) as qty
            FROM in_dynamic_fifo_layers
            WHERE qty_remaining > 0
            GROUP BY sku
        """
        fifo_qty_df = DBClient.read_df(fifo_qty_sql)
        fifo_qty_map = {}
        if not fifo_qty_df.empty:
            fifo_qty_map = dict(zip(
                fifo_qty_df['sku'].astype(str).str.strip().str.upper(),
                fifo_qty_df['qty']
            ))
        
        # 理论库存价值 (使用landed_price)
        fifo_value_sql = """
            SELECT 
                f.sku, 
                SUM(f.qty_remaining * COALESCE(p.landed_price_usd, f.unit_cost)) as value
            FROM in_dynamic_fifo_layers f
            LEFT JOIN in_dynamic_landed_price p 
                ON f.sku = p.sku AND f.po_num = p.po_num
            WHERE f.qty_remaining > 0
            GROUP BY f.sku
        """
        fifo_value_df = DBClient.read_df(fifo_value_sql)
        fifo_value_map = {}
        if not fifo_value_df.empty:
            fifo_value_map = dict(zip(
                fifo_value_df['sku'].astype(str).str.strip().str.upper(),
                fifo_value_df['value']
            ))
        
        # ========== 4. 获取下订数和在途数 ==========
        self.log("正在计算下订数和在途数...")
        
        # PO订单明细 - 包含 po_date 用于策略匹配
        po_sql = """
            SELECT po_num, po_sku, po_date, SUM(po_quantity) as qty, AVG(po_price) as avg_price
            FROM in_po_final
            GROUP BY po_num, po_sku, po_date
        """
        po_df = DBClient.read_df(po_sql)
        
        # 已发货明细
        sent_sql = """
            SELECT po_num, po_sku, SUM(sent_quantity) as qty
            FROM in_send_final
            GROUP BY po_num, po_sku
        """
        sent_df = DBClient.read_df(sent_sql)
        sent_map = {}
        if not sent_df.empty:
            for _, row in sent_df.iterrows():
                key = (row['po_num'], row['po_sku'])
                sent_map[key] = int(row['qty']) if row['qty'] else 0
        
        # 已收货明细
        recv_sql = """
            SELECT po_num, po_sku, SUM(receive_quantity) as qty
            FROM in_receive_final
            GROUP BY po_num, po_sku
        """
        recv_df = DBClient.read_df(recv_sql)
        recv_map = {}
        if not recv_df.empty:
            for _, row in recv_df.iterrows():
                key = (row['po_num'], row['po_sku'])
                recv_map[key] = int(row['qty']) if row['qty'] else 0
        
        # 计算每个SKU的下订数、在途数及价值
        from apps.finance.utils.landed_price import calculate_landed_prices
        
        order_qty = {}       # SKU -> 下订数
        transit_qty = {}     # SKU -> 在途数
        order_value = {}     # SKU -> 下订价值
        transit_value = {}   # SKU -> 在途价值
        landed_price_cache = {}
        
        # [修复] 预加载所有 PO 的货币信息
        # 根据订单日期（po_date）匹配生效日期（date <= po_date）的最新策略
        po_currency_cache = {}  # po_num -> {'currency': 'RMB'/'USD', 'usd_rmb': 7.0}
        if not po_df.empty:
            # 获取每个订单的日期
            po_date_map = {}
            for _, r in po_df.iterrows():
                pn = r['po_num']
                po_dt = r['po_date']
                if pn not in po_date_map:
                    po_date_map[pn] = str(po_dt) if po_dt else '9999-12-31'
            
            # 获取所有策略记录
            po_nums = list(po_date_map.keys())
            strategy_sql = """
                SELECT po_num, date, cur_currency, cur_usd_rmb, seq
                FROM in_po_strategy
                WHERE po_num IN :po_nums
                ORDER BY po_num, date DESC, seq DESC
            """
            strategy_df = DBClient.read_df(strategy_sql, {'po_nums': tuple(po_nums)})
            
            if not strategy_df.empty:
                # 对每个订单，找到 date <= po_date 的第一条记录
                for po_num, po_date in po_date_map.items():
                    matched = strategy_df[
                        (strategy_df['po_num'] == po_num) & 
                        (strategy_df['date'].astype(str) <= po_date)
                    ]
                    if not matched.empty:
                        r = matched.iloc[0]  # 已按 date DESC, seq DESC 排序，取第一条
                        po_currency_cache[po_num] = {
                            'currency': r['cur_currency'] or 'USD',
                            'usd_rmb': float(r['cur_usd_rmb']) if r['cur_usd_rmb'] else 7.0
                        }
                    else:
                        # 如果没有匹配的策略，取该订单的任意一条（兜底）
                        fallback = strategy_df[strategy_df['po_num'] == po_num]
                        if not fallback.empty:
                            r = fallback.iloc[0]
                            po_currency_cache[po_num] = {
                                'currency': r['cur_currency'] or 'USD',
                                'usd_rmb': float(r['cur_usd_rmb']) if r['cur_usd_rmb'] else 7.0
                            }
        
        if not po_df.empty:
            for _, row in po_df.iterrows():
                po_num = row['po_num']
                sku = str(row['po_sku']).strip().upper() if row['po_sku'] else ''
                po_qty = int(row['qty']) if row['qty'] else 0
                po_price = float(row['avg_price']) if row['avg_price'] else 0.0
                
                key = (po_num, row['po_sku'])
                sent_qty_val = sent_map.get(key, 0)
                recv_qty_val = recv_map.get(key, 0)
                
                # 下订数 = PO数量 - 已发货
                sku_order_qty = max(0, po_qty - sent_qty_val)
                # 在途数 = 已发货 - 已收货
                sku_transit_qty = max(0, sent_qty_val - recv_qty_val)
                
                order_qty[sku] = order_qty.get(sku, 0) + sku_order_qty
                transit_qty[sku] = transit_qty.get(sku, 0) + sku_transit_qty
                
                # 计算价值
                if sku_order_qty > 0 or sku_transit_qty > 0:
                    if po_num not in landed_price_cache:
                        try:
                            prices = calculate_landed_prices(po_num)
                            sku_prices = {}
                            for (log_num, pn, s, base), data in prices.items():
                                sku_prices[s.upper()] = data['landed_price_usd']
                            landed_price_cache[po_num] = sku_prices
                        except:
                            landed_price_cache[po_num] = {}
                    
                    # [修复] 回退到 po_price 时，需要根据货币正确转换为 USD
                    cached_price = landed_price_cache.get(po_num, {}).get(sku)
                    if cached_price is not None:
                        landed_price = cached_price
                    else:
                        # 使用 po_price 作为回退，但需要货币转换
                        currency_info = po_currency_cache.get(po_num, {'currency': 'USD', 'usd_rmb': 7.0})
                        if currency_info['currency'] == 'USD':
                            landed_price = po_price
                        else:
                            # RMB -> USD
                            landed_price = po_price / currency_info['usd_rmb'] if currency_info['usd_rmb'] > 0 else po_price
                    
                    if sku_order_qty > 0:
                        order_value[sku] = order_value.get(sku, 0) + sku_order_qty * landed_price
                    if sku_transit_qty > 0:
                        transit_value[sku] = transit_value.get(sku, 0) + sku_transit_qty * landed_price

        # ========== 5. 获取COGS分类信息 ==========
        df_cogs = self.repo.get_all_cogs()
        cogs_cat = {}
        if not df_cogs.empty:
            df_cogs['SKU'] = df_cogs['SKU'].astype(str).str.strip().str.upper()
            cogs_cat = dict(zip(df_cogs['SKU'], df_cogs['Category'])) if 'Category' in df_cogs.columns else {}

        # ========== 6. 组装结果 ==========
        self.log("正在生成快照报表...")
        
        results = []
        total_actual_qty = 0
        total_fifo_qty = 0
        total_fifo_value = 0
        total_order_qty = 0
        total_order_value = 0
        total_transit_qty = 0
        total_transit_value = 0
        
        for sku in sorted(all_skus):
            sku_upper = str(sku).strip().upper()
            
            a_qty = int(actual_inv.get(sku_upper, 0))
            f_qty = int(fifo_qty_map.get(sku_upper, 0))
            f_val = float(fifo_value_map.get(sku_upper, 0))
            o_qty = int(order_qty.get(sku_upper, 0))
            o_val = float(order_value.get(sku_upper, 0))
            t_qty = int(transit_qty.get(sku_upper, 0))
            t_val = float(transit_value.get(sku_upper, 0))
            cat = cogs_cat.get(sku_upper, '')
            
            results.append({
                'SKU': sku,
                'Category': cat,
                'Actual_Qty': a_qty,
                'FIFO_Qty': f_qty,
                'FIFO_Value': round(f_val, 5),
                'Order_Qty': o_qty,
                'Order_Value': round(o_val, 5),
                'Transit_Qty': t_qty,
                'Transit_Value': round(t_val, 5),
                'Total_Pipeline': f_qty + o_qty + t_qty,
                'Total_Pipeline_Value': round(f_val + o_val + t_val, 5)
            })
            
            total_actual_qty += a_qty
            total_fifo_qty += f_qty
            total_fifo_value += f_val
            total_order_qty += o_qty
            total_order_value += o_val
            total_transit_qty += t_qty
            total_transit_value += t_val

        df_out = pd.DataFrame(results)
        df_out = df_out.sort_values('Total_Pipeline_Value', ascending=False)

        filename = f"Inventory_Asset_Snapshot_{self.file_suffix}.csv"
        footer = [
            "📘 库存资产快照说明:",
            f"1. 实际库存数量 (Actual): {int(total_actual_qty):,}",
            f"2. FIFO理论库存: {int(total_fifo_qty):,} 件, 价值 ${total_fifo_value:,.2f}",
            f"3. 下订数量: {int(total_order_qty):,} 件, 价值 ${total_order_value:,.2f}",
            f"4. 在途数量: {int(total_transit_qty):,} 件, 价值 ${total_transit_value:,.2f}",
            f"5. 总Pipeline: {int(total_fifo_qty + total_order_qty + total_transit_qty):,} 件",
            f"6. 总Pipeline价值: ${total_fifo_value + total_order_value + total_transit_value:,.2f}",
            "",
            "字段说明:",
            "- Actual_Qty: Data_inventory实际盘点",
            "- FIFO_Qty/Value: in_dynamic_fifo_layers理论库存及landed_price价值",
            "- Order_Qty/Value: 已下单未发货 (PO - Sent)",
            "- Transit_Qty/Value: 已发货未收货 (Sent - Received)",
            "- Total_Pipeline: FIFO + 下订 + 在途"
        ]

        self.save_csv(df_out, filename, footer)
        self.log(f"✅ 库存快照已生成 (Pipeline Value: ${total_fifo_value + total_order_value + total_transit_value:,.2f})")