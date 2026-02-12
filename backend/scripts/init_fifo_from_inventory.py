#!/usr/bin/env python3
"""
初始化 FIFO 库存系统
从 Data_inventory 表的 2024-12-31 列读取初始库存
从 Data_COGS 表读取成本价 (Cog 列)
写入 in_dynamic_tran 和 in_dynamic_fifo_layers

Usage: python3 backend/scripts/init_fifo_from_inventory.py
"""
import sys
from pathlib import Path
from datetime import datetime

# Bootstrap Django environment
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

import pymysql
pymysql.install_as_MySQLdb()

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.django_config.settings')

import django
django.setup()

from core.components.db.client import DBClient

# 常量定义
INIT_DATE = datetime(2024, 12, 31, 23, 59, 59)  # 初始库存日期
INVENTORY_COLUMN = '2024-12-31'


def main():
    print("=" * 70)
    print("FIFO 初始库存导入")
    print(f"数据来源: Data_inventory.`{INVENTORY_COLUMN}` + Data_COGS.Cog")
    print(f"初始日期: {INIT_DATE}")
    print("=" * 70)
    
    # 1. 读取库存数据
    print("\n[1/4] 读取 Data_inventory...")
    inv_df = DBClient.read_df(f"""
        SELECT SKU, `{INVENTORY_COLUMN}` as qty
        FROM Data_inventory
        WHERE `{INVENTORY_COLUMN}` > 0
    """)
    print(f"  → 找到 {len(inv_df)} 个有库存的 SKU")
    
    if inv_df.empty:
        print("❌ 无数据，退出")
        return 1
    
    # 2. 读取成本数据
    print("\n[2/4] 读取 Data_COGS...")
    cogs_df = DBClient.read_df("SELECT SKU, Cog FROM Data_COGS")
    cogs_map = dict(zip(cogs_df['SKU'], cogs_df['Cog']))
    print(f"  → 找到 {len(cogs_map)} 个 SKU 的成本数据")
    
    # 3. 检查现有数据
    print("\n[3/4] 检查现有 FIFO 数据...")
    existing = DBClient.read_df("SELECT COUNT(*) as cnt FROM in_dynamic_tran")
    if existing['cnt'].iloc[0] > 0:
        print(f"  ⚠️ in_dynamic_tran 已有 {existing['cnt'].iloc[0]} 条记录")
        confirm = input("  是否清空现有数据重新导入? (输入 'YES' 确认): ")
        if confirm != 'YES':
            print("  已取消")
            return 0
        # 清空表 (按依赖顺序)
        print("  清空现有数据...")
        DBClient.execute_stmt("DELETE FROM in_dynamic_fifo_alloc")
        DBClient.execute_stmt("DELETE FROM in_dynamic_fifo_layers")
        DBClient.execute_stmt("DELETE FROM in_dynamic_tran")
        print("  ✅ 已清空")
    
    # 4. 写入数据
    print("\n[4/4] 写入 FIFO 表...")
    success_count = 0
    skip_count = 0
    no_cog_skus = []
    
    for idx, row in inv_df.iterrows():
        sku = row['SKU']
        qty = int(row['qty'])
        
        # 获取成本
        cog = cogs_map.get(sku)
        if cog is None or cog == 0:
            no_cog_skus.append(sku)
            cog = 0.0  # 无成本数据时设为0
        
        # [Fix] 检查该 SKU 是否已有 FIFO layer (防止重复插入)
        existing_layer = DBClient.read_df(f"""
            SELECT layer_id FROM in_dynamic_fifo_layers 
            WHERE sku = '{sku}' AND po_num = 'INIT-2024-12-31'
        """)
        if not existing_layer.empty:
            skip_count += 1
            continue
        
        # 写入 in_dynamic_tran
        tran_sql = """
            INSERT INTO in_dynamic_tran 
            (date_record, po_num, sku, price, quantity, action, type, note, created_at)
            VALUES 
            (:date_record, :po_num, :sku, :price, :quantity, :action, :type, :note, :created_at)
        """
        tran_params = {
            'date_record': INIT_DATE,
            'po_num': 'INIT-2024-12-31',
            'sku': sku,
            'price': float(cog),
            'quantity': int(qty),
            'action': 'in',
            'type': 'inv',
            'note': '初始库存',
            'created_at': datetime.now()
        }
        
        if not DBClient.execute_stmt(tran_sql, tran_params):
            print(f"  ❌ 写入 tran 失败: {sku}")
            continue
        
        # 获取刚插入的 record_id
        record_df = DBClient.read_df("SELECT LAST_INSERT_ID() as id")
        record_id = int(record_df['id'].iloc[0])
        
        # 写入 in_dynamic_fifo_layers
        layer_sql = """
            INSERT INTO in_dynamic_fifo_layers
            (sku, in_record_id, in_date, po_num, unit_cost, qty_in, qty_remaining, created_at)
            VALUES
            (:sku, :in_record_id, :in_date, :po_num, :unit_cost, :qty_in, :qty_remaining, :created_at)
        """
        layer_params = {
            'sku': sku,
            'in_record_id': record_id,
            'in_date': INIT_DATE,
            'po_num': 'INIT-2024-12-31',
            'unit_cost': float(cog),
            'qty_in': int(qty),
            'qty_remaining': int(qty),
            'created_at': datetime.now()
        }
        
        if not DBClient.execute_stmt(layer_sql, layer_params):
            print(f"  ❌ 写入 layer 失败: {sku}")
            continue
        
        success_count += 1
        if (idx + 1) % 50 == 0:
            print(f"  ... 已处理 {idx + 1}/{len(inv_df)}")
    
    # 汇总
    print("\n" + "=" * 70)
    print("✅ 导入完成")
    print(f"  成功: {success_count} 个 SKU")
    if no_cog_skus:
        print(f"  ⚠️ 无成本数据 (Cog=0): {len(no_cog_skus)} 个")
        if len(no_cog_skus) <= 10:
            print(f"     {no_cog_skus}")
    
    # 验证
    print("\n验证:")
    for table in ['in_dynamic_tran', 'in_dynamic_fifo_layers']:
        cnt = DBClient.read_df(f"SELECT COUNT(*) as c FROM {table}")['c'].iloc[0]
        total_qty = DBClient.read_df(f"SELECT SUM(quantity) as q FROM {table}" if table == 'in_dynamic_tran' 
                                     else f"SELECT SUM(qty_remaining) as q FROM {table}")['q'].iloc[0]
        print(f"  {table}: {cnt} 条, 总数量: {total_qty}")
    
    print("=" * 70)
    return 0


if __name__ == "__main__":
    sys.exit(main())
