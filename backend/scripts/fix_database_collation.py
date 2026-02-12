#!/usr/bin/env python3
"""
一次性脚本: 将数据库中所有表的 collation 统一为 utf8mb4_unicode_ci

运行方式:
    cd /Users/aaron/Desktop/app/MGMT/backend
    python scripts/fix_database_collation.py

说明:
    1. 修改数据库默认字符集和 collation
    2. 将所有表转换为 utf8mb4_unicode_ci
    3. 确保所有新创建的表也使用正确的 collation
"""

import sys
from pathlib import Path

# 添加项目路径 (MGMT 根目录和 backend 目录)
mgmt_root = Path(__file__).resolve().parent.parent.parent
backend_dir = mgmt_root / "backend"
sys.path.insert(0, str(mgmt_root))
sys.path.insert(0, str(backend_dir))

from backend.common.settings import settings
from core.components.db.client import DBClient
from sqlalchemy import text


def main():
    print("=" * 60)
    print("数据库 Collation 统一脚本")
    print("=" * 60)
    
    db_name = settings.DB_NAME
    target_collation = "utf8mb4_unicode_ci"
    target_charset = "utf8mb4"
    
    print(f"\n目标数据库: {db_name}")
    print(f"目标 Collation: {target_collation}")
    print()
    
    # 1. 获取所有表
    tables_df = DBClient.read_df(f"""
        SELECT TABLE_NAME, TABLE_COLLATION 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = '{db_name}' 
        AND TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_NAME
    """)
    
    if tables_df.empty:
        print("数据库中没有找到表。")
        return
    
    print(f"找到 {len(tables_df)} 个表\n")
    
    # 2. 检查需要修复的表
    needs_fix = tables_df[tables_df['TABLE_COLLATION'] != target_collation]
    already_ok = tables_df[tables_df['TABLE_COLLATION'] == target_collation]
    
    print(f"✅ 已经是 {target_collation}: {len(already_ok)} 个表")
    print(f"⚠️  需要修复: {len(needs_fix)} 个表")
    
    if not needs_fix.empty:
        print("\n需要修复的表:")
        for _, row in needs_fix.iterrows():
            print(f"   - {row['TABLE_NAME']}: {row['TABLE_COLLATION']}")
    
    if needs_fix.empty:
        print("\n✅ 所有表的 collation 已经正确，无需修复。")
        return
    
    # 3. 确认是否继续
    print("\n" + "=" * 60)
    confirm = input("是否继续修复? (yes/no): ").strip().lower()
    if confirm != 'yes':
        print("已取消。")
        return
    
    # 4. 修改数据库默认 collation
    print(f"\n📌 Step 1: 修改数据库默认 collation...")
    try:
        with DBClient.get_engine().begin() as conn:
            conn.execute(text(f"""
                ALTER DATABASE `{db_name}` 
                CHARACTER SET {target_charset} 
                COLLATE {target_collation}
            """))
        print(f"   ✅ 数据库默认 collation 已设置为 {target_collation}")
    except Exception as e:
        print(f"   ⚠️  修改数据库默认失败 (可能需要更高权限): {e}")
    
    # 5. 修复每个表
    print(f"\n📌 Step 2: 修复 {len(needs_fix)} 个表...")
    success_count = 0
    fail_count = 0
    
    for _, row in needs_fix.iterrows():
        table_name = row['TABLE_NAME']
        old_collation = row['TABLE_COLLATION']
        
        try:
            with DBClient.get_engine().begin() as conn:
                conn.execute(text(f"""
                    ALTER TABLE `{table_name}` 
                    CONVERT TO CHARACTER SET {target_charset} 
                    COLLATE {target_collation}
                """))
            print(f"   ✅ {table_name}: {old_collation} → {target_collation}")
            success_count += 1
        except Exception as e:
            print(f"   ❌ {table_name}: 失败 - {e}")
            fail_count += 1
    
    # 6. 汇总
    print("\n" + "=" * 60)
    print("修复完成!")
    print(f"   成功: {success_count}")
    print(f"   失败: {fail_count}")
    print("=" * 60)
    
    # 7. 验证
    print("\n📌 验证修复结果...")
    verify_df = DBClient.read_df(f"""
        SELECT TABLE_NAME, TABLE_COLLATION 
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = '{db_name}' 
        AND TABLE_TYPE = 'BASE TABLE'
        AND TABLE_COLLATION != '{target_collation}'
    """)
    
    if verify_df.empty:
        print("✅ 验证通过：所有表的 collation 现在都是 utf8mb4_unicode_ci")
    else:
        print(f"⚠️  仍有 {len(verify_df)} 个表 collation 不正确:")
        for _, row in verify_df.iterrows():
            print(f"   - {row['TABLE_NAME']}: {row['TABLE_COLLATION']}")


if __name__ == "__main__":
    main()
