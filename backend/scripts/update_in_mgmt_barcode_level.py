#!/usr/bin/env python3
"""
更新 in_mgmt_barcode 表：level 字段改为 VARCHAR (G/M/T)
"""
import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

import pymysql
pymysql.install_as_MySQLdb()

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.django_config.settings')

import django
django.setup()

from core.components.db.client import DBClient

def main():
    print("=" * 60)
    print("Updating in_mgmt_barcode: level INT -> VARCHAR(10)")
    print("=" * 60)
    
    # 1. 删除旧表
    DBClient.execute_stmt('DROP TABLE IF EXISTS in_mgmt_barcode')
    print("✅ Dropped old table")
    
    # 2. 创建新表（level 改为 VARCHAR）
    sql = '''
    CREATE TABLE in_mgmt_barcode (
        wh_num VARCHAR(20) NOT NULL COMMENT '仓库号',
        aisle VARCHAR(10) NOT NULL COMMENT '货架排号 (L/R等)',
        bay INT NOT NULL COMMENT '货架跨号 (1,2,3...)',
        level VARCHAR(10) NOT NULL COMMENT '货架层号 (G/M/T)',
        bin VARCHAR(10) NOT NULL DEFAULT '' COMMENT '库位号 (L/R等, 空=不区分)',
        slot VARCHAR(10) NOT NULL DEFAULT '' COMMENT '格位号 (L/R等, 空=不区分)',
        
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
        
        PRIMARY KEY (wh_num, aisle, bay, level, bin, slot),
        INDEX idx_wh_num (wh_num),
        INDEX idx_aisle_bay (aisle, bay)
        
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库码管理表';
    '''
    
    DBClient.execute_stmt(sql)
    print("✅ Created new table with VARCHAR level")
    
    # 验证
    desc_result = DBClient.read_df('DESCRIBE in_mgmt_barcode')
    print('\n字段结构:')
    for _, row in desc_result.iterrows():
        pk = ' (PK)' if row['Key'] == 'PRI' else ''
        print(f"  {row['Field']}: {row['Type']}{pk}")
    
    print("\n✅ Done!")
    return 0

if __name__ == "__main__":
    sys.exit(main())
