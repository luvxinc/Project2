#!/usr/bin/env python3
"""
创建 in_payment_logistic 表
Usage: python backend/scripts/create_payment_logistic_table.py
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
    print("Creating in_payment_logistic table...")
    print("=" * 60)
    
    sql = '''
    CREATE TABLE IF NOT EXISTS in_payment_logistic (
        id INT AUTO_INCREMENT PRIMARY KEY,
        date_record DATE NOT NULL COMMENT '记录日期',
        date_sent DATE NOT NULL COMMENT '物流单发货日期',
        logistic_num VARCHAR(50) NOT NULL COMMENT '物流单号',
        logistic_paid DECIMAL(12,2) DEFAULT 0 COMMENT '物流费用',
        extra_paid DECIMAL(12,2) DEFAULT 0 COMMENT '额外费用',
        extra_currency VARCHAR(10) DEFAULT '' COMMENT '额外费用币种',
        extra_note VARCHAR(500) DEFAULT '' COMMENT '额外费用说明',
        payment_date DATE NOT NULL COMMENT '付款日期',
        note VARCHAR(200) DEFAULT '' COMMENT '操作备注',
        seq VARCHAR(10) DEFAULT 'V01' COMMENT '版本号',
        by_user VARCHAR(50) DEFAULT '' COMMENT '操作用户',
        pmt_no VARCHAR(100) DEFAULT '' COMMENT '付款序列号',
        INDEX idx_logistic_num (logistic_num),
        INDEX idx_payment_date (payment_date),
        INDEX idx_date_record (date_record),
        INDEX idx_pmt_no (pmt_no)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='物流付款记录表';
    '''
    
    DBClient.execute_stmt(sql)
    print("✅ Table in_payment_logistic created successfully")
    
    # 验证表结构
    desc_sql = 'DESCRIBE in_payment_logistic'
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
