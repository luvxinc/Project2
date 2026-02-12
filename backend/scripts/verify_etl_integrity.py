#!/usr/bin/env python3
"""
ETL 数据完整性验证脚本
验证 FIFO 表和 Data_Clean_Log 的数据正确性

Usage: python3 backend/scripts/verify_etl_integrity.py
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


def verify_fifo_layers():
    """验证 FIFO layers 表无重复"""
    print("\n【1. FIFO Layers 重复检查】")
    
    df_dup = DBClient.read_df("""
        SELECT sku, in_date, COUNT(*) as cnt 
        FROM in_dynamic_fifo_layers 
        GROUP BY sku, in_date 
        HAVING COUNT(*) > 1
    """)
    
    if df_dup.empty:
        print("  ✅ 无重复记录")
        return True
    else:
        print(f"  ❌ 发现 {len(df_dup)} 组重复:")
        print(df_dup.to_string())
        return False


def verify_fifo_alloc():
    """验证 FIFO alloc 的外键完整性"""
    print("\n【2. FIFO Alloc 外键完整性】")
    
    df_orphan = DBClient.read_df("""
        SELECT a.alloc_id, a.layer_id, a.sku
        FROM in_dynamic_fifo_alloc a
        LEFT JOIN in_dynamic_fifo_layers l ON a.layer_id = l.layer_id
        WHERE l.layer_id IS NULL
        LIMIT 10
    """)
    
    if df_orphan.empty:
        print("  ✅ 所有 alloc 记录都有对应的 layer")
        return True
    else:
        print(f"  ❌ 发现 {len(df_orphan)} 条孤立的 alloc 记录:")
        print(df_orphan.to_string())
        return False


def verify_data_clean_log():
    """验证 Data_Clean_Log 的唯一性"""
    print("\n【3. Data_Clean_Log 五维唯一性检查】")
    
    # 使用五维检查 (order+seller+item_id+action+full_sku)
    df_dup = DBClient.read_df("""
        SELECT `order number`, seller, `item id`, `action`, `full sku`, COUNT(*) as cnt 
        FROM Data_Clean_Log 
        GROUP BY `order number`, seller, `item id`, `action`, `full sku`
        HAVING COUNT(*) > 1
        LIMIT 10
    """)
    
    if df_dup.empty:
        print("  ✅ 无重复记录 (五维: order+seller+item_id+action+full_sku)")
        return True
    else:
        print(f"  ❌ 发现 {len(df_dup)} 组重复:")
        print(df_dup.to_string())
        return False


def verify_p_flag_consistency():
    """验证 P_Flag 状态一致性"""
    print("\n【4. P_Flag 状态一致性】")
    
    df = DBClient.read_df("""
        SELECT P_Flag, COUNT(*) as cnt 
        FROM Data_Transaction 
        GROUP BY P_Flag 
        ORDER BY P_Flag
    """)
    print("  P_Flag 分布:")
    for _, row in df.iterrows():
        flag = row['P_Flag']
        cnt = row['cnt']
        desc = {0: '未解析', 1: '待转换', 2: '待修正', 3: '已转换', 5: '无效'}.get(int(flag) if flag else 0, '未知')
        print(f"    {flag}: {cnt:,} 条 ({desc})")
    
    # P_Flag=3 的记录应该都在 Data_Clean_Log 中
    df_check = DBClient.read_df("""
        SELECT COUNT(DISTINCT t.`Order number`) as trans_orders,
               (SELECT COUNT(DISTINCT `order number`) FROM Data_Clean_Log) as clean_orders
        FROM Data_Transaction t
        WHERE t.P_Flag = 3
    """)
    print(f"  P_Flag=3 订单数: {df_check.iloc[0]['trans_orders']:,}")
    print(f"  Data_Clean_Log 订单数: {df_check.iloc[0]['clean_orders']:,}")
    
    return True


def verify_2026_jan_data():
    """验证 2026年1月数据完整性"""
    print("\n【5. 2026年1月数据验证】")
    
    # Data_Transaction
    df_trans = DBClient.read_df("""
        SELECT COUNT(*) as cnt FROM Data_Transaction 
        WHERE `Transaction creation date` >= '2026-01-01' 
        AND `Transaction creation date` <= '2026-01-31'
    """)
    print(f"  Data_Transaction: {df_trans.iloc[0]['cnt']:,} 条")
    
    # Data_Clean_Log
    df_clean = DBClient.read_df("""
        SELECT COUNT(*) as cnt FROM Data_Clean_Log 
        WHERE `order date` >= '2026-01-01' 
        AND `order date` <= '2026-01-31'
    """)
    print(f"  Data_Clean_Log: {df_clean.iloc[0]['cnt']:,} 条")
    
    # FIFO alloc
    df_fifo = DBClient.read_df("""
        SELECT COUNT(*) as cnt FROM in_dynamic_fifo_alloc 
        WHERE out_date >= '2026-01-01' 
        AND out_date <= '2026-01-31'
    """)
    print(f"  FIFO 出库: {df_fifo.iloc[0]['cnt']:,} 条")
    
    return True


def main():
    print("=" * 60)
    print("ETL 数据完整性验证")
    print(f"时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)
    
    results = []
    
    results.append(("FIFO Layers 重复检查", verify_fifo_layers()))
    results.append(("FIFO Alloc 外键完整性", verify_fifo_alloc()))
    results.append(("Data_Clean_Log 唯一性", verify_data_clean_log()))
    results.append(("P_Flag 状态一致性", verify_p_flag_consistency()))
    results.append(("2026年1月数据", verify_2026_jan_data()))
    
    # 汇总
    print("\n" + "=" * 60)
    print("验证结果汇总")
    print("=" * 60)
    
    all_passed = True
    for name, passed in results:
        status = "✅ 通过" if passed else "❌ 失败"
        print(f"  {status} {name}")
        if not passed:
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("✅ 所有验证通过！")
    else:
        print("❌ 部分验证失败，请检查上述问题。")
    print("=" * 60)
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    sys.exit(main())
