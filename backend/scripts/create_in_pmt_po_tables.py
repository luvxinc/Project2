#!/usr/bin/env python3
"""
Create in_pmt_po and in_pmt_po_final tables
Purchase Order Payment System

Tables:
1. in_pmt_po - Operation Log (Mutation Log)
2. in_pmt_po_final - Current State Snapshot (Resolution Snapshot)

Trigger:
- AFTER INSERT on in_pmt_po -> Automatically sync to in_pmt_po_final based on 'ops' column

Usage: python backend/scripts/create_in_pmt_po_tables.py
"""
import sys
from pathlib import Path

# Bootstrap Django environment
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

# PyMySQL patch
import pymysql
pymysql.version_info = (2, 2, 2, "final", 0)
pymysql.install_as_MySQLdb()

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.django_config.settings')

import django
django.setup()

from core.components.db.client import DBClient


def create_pmt_po_table():
    """Create in_pmt_po table (Mutation Log)"""
    sql = '''
    CREATE TABLE IF NOT EXISTS in_pmt_po (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pmt_no VARCHAR(100) NOT NULL COMMENT 'Payment Number PPMT_{[po_num]}_N##',
        po_num VARCHAR(50) NOT NULL COMMENT 'Purchase Order Number',
        pmt_date DATE NOT NULL COMMENT 'Payment Date YYYY-MM-DD',
        pmt_currency VARCHAR(10) NOT NULL COMMENT 'Payment Currency RMB/USD',
        pmt_cash_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cash Payment Amount',
        pmt_fe_rate DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT 'Exchange Rate',
        pmt_fe_mode VARCHAR(10) NOT NULL DEFAULT 'A' COMMENT 'Rate Mode M/A',
        pmt_prepay_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Prepayment Usage Amount',
        pmt_override TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Override Balance Check (1=Yes, 0=No)',
        extra_note VARCHAR(255) DEFAULT '' COMMENT 'Extra Fee Description',
        extra_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Extra Fee Amount',
        extra_currency VARCHAR(10) DEFAULT '' COMMENT 'Extra Fee Currency RMB/USD',
        ops VARCHAR(10) NOT NULL COMMENT 'Operation new/adjust/delete',
        seq VARCHAR(10) NOT NULL COMMENT 'Sequence P##',
        `by` VARCHAR(50) NOT NULL COMMENT 'Operator User',
        note VARCHAR(500) DEFAULT '' COMMENT 'Operation Note',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Creation Time',
        INDEX idx_pmt_no (pmt_no),
        INDEX idx_po_num (po_num),
        INDEX idx_pmt_date (pmt_date)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
      COMMENT='Purchase Order Payment Mutation Log';
    '''
    DBClient.execute_stmt(sql)
    print("✅ Table in_pmt_po created successfully")


def create_pmt_po_final_table():
    """Create in_pmt_po_final table (Resolution Snapshot)"""
    # Drop first to ensure schema update
    DBClient.execute_stmt('DROP TABLE IF EXISTS in_pmt_po_final')
    
    sql = '''
    CREATE TABLE IF NOT EXISTS in_pmt_po_final (
        id INT AUTO_INCREMENT PRIMARY KEY,
        pmt_no VARCHAR(100) NOT NULL UNIQUE COMMENT 'Payment Number',
        po_num VARCHAR(50) NOT NULL COMMENT 'Purchase Order Number',
        pmt_date DATE NOT NULL COMMENT 'Payment Date YYYY-MM-DD',
        pmt_currency VARCHAR(10) NOT NULL COMMENT 'Payment Currency RMB/USD',
        pmt_cash_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Cash Payment Amount',
        pmt_fe_rate DECIMAL(12,4) NOT NULL DEFAULT 0.0000 COMMENT 'Exchange Rate',
        pmt_fe_mode VARCHAR(10) NOT NULL DEFAULT 'A' COMMENT 'Rate Mode M/A',
        pmt_prepay_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Prepayment Usage Amount',
        pmt_override TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Override Balance Check (1=Yes, 0=No)',
        extra_note VARCHAR(255) DEFAULT '' COMMENT 'Extra Fee Description',
        extra_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00 COMMENT 'Extra Fee Amount',
        extra_currency VARCHAR(10) DEFAULT '' COMMENT 'Extra Fee Currency RMB/USD',
        seq VARCHAR(10) NOT NULL COMMENT 'Sequence P##',
        `by` VARCHAR(50) NOT NULL COMMENT 'Operator User',
        note VARCHAR(500) DEFAULT '' COMMENT 'Operation Note',
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'Last Updated Time',
        INDEX idx_pmt_date (pmt_date),
        INDEX idx_po_num (po_num)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
      COMMENT='Purchase Order Payment Snapshot';
    '''
    DBClient.execute_stmt(sql)
    print("✅ Table in_pmt_po_final created successfully")


def create_trigger():
    """Create Trigger: in_pmt_po INSERT -> Sync to in_pmt_po_final"""
    
    # Drop existing trigger
    drop_sql = 'DROP TRIGGER IF EXISTS trg_pmt_po_sync_final'
    DBClient.execute_stmt(drop_sql)
    
    # Create Trigger
    # ops = 'new' -> INSERT
    # ops = 'adjust' -> UPDATE
    # ops = 'delete' -> DELETE
    trigger_sql = '''
    CREATE TRIGGER trg_pmt_po_sync_final
    AFTER INSERT ON in_pmt_po
    FOR EACH ROW
    BEGIN
        IF NEW.ops = 'new' THEN
            INSERT INTO in_pmt_po_final (
                pmt_no, po_num, pmt_date, pmt_currency, pmt_cash_amount, 
                pmt_fe_rate, pmt_fe_mode, pmt_prepay_amount, pmt_override,
                extra_note, extra_amount, extra_currency,
                seq, `by`, note
            ) VALUES (
                NEW.pmt_no, NEW.po_num, NEW.pmt_date, NEW.pmt_currency, NEW.pmt_cash_amount,
                NEW.pmt_fe_rate, NEW.pmt_fe_mode, NEW.pmt_prepay_amount, NEW.pmt_override,
                NEW.extra_note, NEW.extra_amount, NEW.extra_currency,
                NEW.seq, NEW.`by`, NEW.note
            );
        ELSEIF NEW.ops = 'adjust' THEN
            UPDATE in_pmt_po_final SET
                po_num = NEW.po_num,
                pmt_date = NEW.pmt_date,
                pmt_currency = NEW.pmt_currency,
                pmt_cash_amount = NEW.pmt_cash_amount,
                pmt_fe_rate = NEW.pmt_fe_rate,
                pmt_fe_mode = NEW.pmt_fe_mode,
                pmt_prepay_amount = NEW.pmt_prepay_amount,
                pmt_override = NEW.pmt_override,
                extra_note = NEW.extra_note,
                extra_amount = NEW.extra_amount,
                extra_currency = NEW.extra_currency,
                seq = NEW.seq,
                `by` = NEW.`by`,
                note = NEW.note
            WHERE pmt_no = NEW.pmt_no;
        ELSEIF NEW.ops = 'delete' THEN
            DELETE FROM in_pmt_po_final
            WHERE pmt_no = NEW.pmt_no;
        END IF;
    END
    '''
    DBClient.execute_stmt(trigger_sql)
    print("✅ Trigger trg_pmt_po_sync_final created successfully")


def verify_tables():
    """Verify table structures"""
    print("\\n" + "=" * 60)
    print("Verify in_pmt_po:")
    print("=" * 60)
    desc_result = DBClient.read_df('DESCRIBE in_pmt_po')
    for _, row in desc_result.iterrows():
        print(f"  {row['Field']}: {row['Type']}")
    
    print("\\n" + "=" * 60)
    print("Verify in_pmt_po_final:")
    print("=" * 60)
    desc_result = DBClient.read_df('DESCRIBE in_pmt_po_final')
    for _, row in desc_result.iterrows():
        print(f"  {row['Field']}: {row['Type']}")
    
    print("\\n" + "=" * 60)
    print("Verify triggers:")
    print("=" * 60)
    trigger_result = DBClient.read_df("SHOW TRIGGERS LIKE 'in_pmt_po'")
    if not trigger_result.empty:
        print(f"  Trigger: {trigger_result.iloc[0]['Trigger']}")
        print(f"  Event: {trigger_result.iloc[0]['Event']}")
        print(f"  Timing: {trigger_result.iloc[0]['Timing']}")
    else:
        print("  ⚠️ No triggers found")


def main():
    print("=" * 60)
    print("Create Purchase Order Payment Tables (in_pmt_po)")
    print("=" * 60)
    
    # Step 1: Create Main Table
    create_pmt_po_table()
    
    # Step 2: Create Final Table
    create_pmt_po_final_table()
    
    # Step 3: Create Trigger
    create_trigger()
    
    # Step 4: Verify
    verify_tables()
    
    print("\\n" + "=" * 60)
    print("✅ All done!")
    print("=" * 60)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
