#!/usr/bin/env python3
"""
创建 in_mgmt_barcode 表
Usage: python backend/scripts/create_in_mgmt_barcode.py
"""
import sys
from pathlib import Path

# Bootstrap Django environment
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

# PyMySQL patch
import pymysql
pymysql.install_as_MySQLdb()

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.django_config.settings')

import django
django.setup()

from core.components.db.client import DBClient

def main():
    print("=" * 60)
    print("Creating in_mgmt_barcode table...")
    print("=" * 60)
    
    sql = '''
    CREATE TABLE IF NOT EXISTS in_mgmt_barcode (
        id INT AUTO_INCREMENT PRIMARY KEY,
        
        -- 仓库定位层级
        wh_num VARCHAR(20) NOT NULL COMMENT '仓库号',
        aisle VARCHAR(10) NOT NULL COMMENT '货架排号 (L/R等)',
        bay INT NOT NULL COMMENT '货架跨号 (1,2,3...)',
        level INT NOT NULL COMMENT '货架层号 (1,2,3...)',
        bin VARCHAR(10) NOT NULL COMMENT '库位号 (L/R等)',
        slot VARCHAR(10) NOT NULL COMMENT '格位号 (L/R等)',
        
        -- 审计字段
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        
        -- 唯一约束：完整库位码唯一
        UNIQUE KEY uk_location (wh_num, aisle, bay, level, bin, slot),
        
        -- 索引
        INDEX idx_wh_num (wh_num),
        INDEX idx_aisle_bay (aisle, bay)
        
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库码管理表';
    '''
    
    DBClient.execute_stmt(sql)
    print("✅ Table in_mgmt_barcode created successfully")
    
    # 验证表结构
    desc_sql = 'DESCRIBE in_mgmt_barcode'
    desc_result = DBClient.read_df(desc_sql)
    print('\n字段结构:')
    for _, row in desc_result.iterrows():
        print(f"  {row['Field']}: {row['Type']}")
    
    print("\n" + "=" * 60)
    print("✅ Done!")
    print("=" * 60)
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
