#!/usr/bin/env python3
"""
创建 in_pmt_prepay 和 in_pmt_prepay_final 表
厂商预付款账户流水系统

Tables:
1. in_pmt_prepay - 操作流水日志 (Mutation Log)
2. in_pmt_prepay_final - 最新状态快照 (Resolution Snapshot)

Trigger:
- AFTER INSERT on in_pmt_prepay -> 根据 tran_ops 自动更新 in_pmt_prepay_final

Usage: python backend/scripts/create_pmt_prepay_tables.py
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


def create_prepay_table():
    """创建 in_pmt_prepay 操作流水日志表"""
    sql = '''
    CREATE TABLE IF NOT EXISTS in_pmt_prepay (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tran_num VARCHAR(100) NOT NULL COMMENT '操作流水号 {supplier_code}_{YYYYMMDD}_{tran_type}_##',
        supplier_code VARCHAR(50) NOT NULL COMMENT '厂商ID',
        tran_date DATE NOT NULL COMMENT '流水日期 YYYY-MM-DD',
        tran_curr_req VARCHAR(10) NOT NULL COMMENT '厂商要求货币 USD/RMB',
        tran_curr_use VARCHAR(10) NOT NULL COMMENT '操作货币 USD/RMB',
        usd_rmb DECIMAL(12,4) NOT NULL COMMENT '当日买入汇率',
        tran_amount DECIMAL(12,2) NOT NULL COMMENT '操作金额',
        tran_type VARCHAR(10) NOT NULL COMMENT '操作模式 in/out',
        tran_ops VARCHAR(10) NOT NULL COMMENT '数据操作模式 new/adjust',
        tran_seq VARCHAR(10) NOT NULL COMMENT '版本号 T##',
        tran_by VARCHAR(50) NOT NULL COMMENT '操作用户',
        tran_note VARCHAR(500) DEFAULT '' COMMENT '操作备注',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
        INDEX idx_tran_num (tran_num),
        INDEX idx_supplier_code (supplier_code),
        INDEX idx_tran_date (tran_date),
        INDEX idx_tran_type (tran_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
      COMMENT='厂商预付款账户操作流水日志';
    '''
    DBClient.execute_stmt(sql)
    print("✅ Table in_pmt_prepay created successfully")


def create_prepay_final_table():
    """创建 in_pmt_prepay_final 最新状态快照表"""
    sql = '''
    CREATE TABLE IF NOT EXISTS in_pmt_prepay_final (
        id INT AUTO_INCREMENT PRIMARY KEY,
        tran_num VARCHAR(100) NOT NULL UNIQUE COMMENT '唯一操作流水号',
        supplier_code VARCHAR(50) NOT NULL COMMENT '厂商ID',
        tran_date DATE NOT NULL COMMENT '流水日期 YYYY-MM-DD',
        tran_curr_req VARCHAR(10) NOT NULL COMMENT '最新厂商要求货币 USD/RMB',
        tran_curr_use VARCHAR(10) NOT NULL COMMENT '最新操作货币 USD/RMB',
        usd_rmb DECIMAL(12,4) NOT NULL COMMENT '最新当日买入汇率',
        tran_amount DECIMAL(12,2) NOT NULL COMMENT '最新操作金额',
        tran_type VARCHAR(10) NOT NULL COMMENT '操作模式 in/out',
        tran_seq VARCHAR(10) NOT NULL COMMENT '最新版本号 T##',
        tran_by VARCHAR(50) NOT NULL COMMENT '最新操作用户',
        tran_note VARCHAR(500) DEFAULT '' COMMENT '最新操作备注',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最后更新时间',
        INDEX idx_supplier_code (supplier_code),
        INDEX idx_tran_date (tran_date),
        INDEX idx_tran_type (tran_type)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
      COMMENT='厂商预付款账户最新状态快照';
    '''
    DBClient.execute_stmt(sql)
    print("✅ Table in_pmt_prepay_final created successfully")


def create_trigger():
    """创建触发器: in_pmt_prepay INSERT 后自动更新 in_pmt_prepay_final"""
    
    # 先删除已存在的触发器
    drop_sql = 'DROP TRIGGER IF EXISTS trg_pmt_prepay_sync_final'
    DBClient.execute_stmt(drop_sql)
    
    # 创建触发器
    # tran_ops = 'new' -> INSERT into _final
    # tran_ops = 'adjust' -> UPDATE existing row in _final
    trigger_sql = '''
    CREATE TRIGGER trg_pmt_prepay_sync_final
    AFTER INSERT ON in_pmt_prepay
    FOR EACH ROW
    BEGIN
        IF NEW.tran_ops = 'new' THEN
            INSERT INTO in_pmt_prepay_final (
                tran_num, supplier_code, tran_date, tran_curr_req, tran_curr_use,
                usd_rmb, tran_amount, tran_type, tran_seq, tran_by, tran_note
            ) VALUES (
                NEW.tran_num, NEW.supplier_code, NEW.tran_date, NEW.tran_curr_req, NEW.tran_curr_use,
                NEW.usd_rmb, NEW.tran_amount, NEW.tran_type, NEW.tran_seq, NEW.tran_by, NEW.tran_note
            );
        ELSEIF NEW.tran_ops = 'adjust' THEN
            UPDATE in_pmt_prepay_final SET
                tran_curr_req = NEW.tran_curr_req,
                tran_curr_use = NEW.tran_curr_use,
                usd_rmb = NEW.usd_rmb,
                tran_amount = NEW.tran_amount,
                tran_seq = NEW.tran_seq,
                tran_by = NEW.tran_by,
                tran_note = NEW.tran_note
            WHERE tran_num = NEW.tran_num;
        ELSEIF NEW.tran_ops = 'delete' THEN
            DELETE FROM in_pmt_prepay_final
            WHERE tran_num = NEW.tran_num;
        END IF;
    END
    '''
    DBClient.execute_stmt(trigger_sql)
    print("✅ Trigger trg_pmt_prepay_sync_final created successfully")


def verify_tables():
    """验证表结构"""
    print("\n" + "=" * 60)
    print("验证 in_pmt_prepay 结构:")
    print("=" * 60)
    desc_result = DBClient.read_df('DESCRIBE in_pmt_prepay')
    for _, row in desc_result.iterrows():
        print(f"  {row['Field']}: {row['Type']}")
    
    print("\n" + "=" * 60)
    print("验证 in_pmt_prepay_final 结构:")
    print("=" * 60)
    desc_result = DBClient.read_df('DESCRIBE in_pmt_prepay_final')
    for _, row in desc_result.iterrows():
        print(f"  {row['Field']}: {row['Type']}")
    
    print("\n" + "=" * 60)
    print("验证触发器:")
    print("=" * 60)
    trigger_result = DBClient.read_df("SHOW TRIGGERS LIKE 'in_pmt_prepay'")
    if not trigger_result.empty:
        print(f"  Trigger: {trigger_result.iloc[0]['Trigger']}")
        print(f"  Event: {trigger_result.iloc[0]['Event']}")
        print(f"  Timing: {trigger_result.iloc[0]['Timing']}")
    else:
        print("  ⚠️ No triggers found")


def main():
    print("=" * 60)
    print("创建厂商预付款账户流水表")
    print("=" * 60)
    
    # Step 1: 创建主表
    create_prepay_table()
    
    # Step 2: 创建快照表
    create_prepay_final_table()
    
    # Step 3: 创建触发器
    create_trigger()
    
    # Step 4: 验证
    verify_tables()
    
    print("\n" + "=" * 60)
    print("✅ All done!")
    print("=" * 60)
    print("\ntran_num 格式说明:")
    print("  {supplier_code}_{YYYYMMDD}_{tran_type}_##")
    print("  例: SUPP001_20260105_in_01")
    print("\ntran_seq 格式说明:")
    print("  T## (从 T01 开始递增)")
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
