#!/usr/bin/env python3
"""
更新 in_pmt_prepay 相关表结构
新增字段: tran_curr_type (汇率来源 M/A)
并更新触发器逻辑
"""
import sys
from pathlib import Path

# Bootstrap Django environment
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))

# PyMySQL patch
import pymysql
# Hack: Pretend to be a newer version of mysqlclient to satisfy Django
pymysql.version_info = (2, 2, 1, "final", 0)
pymysql.install_as_MySQLdb()

import os
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.django_config.settings')

import django
django.setup()

from core.components.db.client import DBClient

def add_column_if_not_exists(table, column, definition):
    """添加列如果不存在"""
    check_sql = f"SHOW COLUMNS FROM {table} LIKE '{column}'"
    exists = DBClient.read_df(check_sql)
    if exists.empty:
        print(f"Adding column {column} to {table}...")
        alter_sql = f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
        DBClient.execute_stmt(alter_sql)
        print(f"✅ Column {column} added to {table}")
    else:
        print(f"ℹ️ Column {column} already exists in {table}")

def update_schema():
    print("=" * 60)
    print("更新 Schema: 添加 tran_curr_type")
    print("=" * 60)
    
    col_def = "VARCHAR(10) NOT NULL DEFAULT 'A' COMMENT '汇率来源 M=Manual/A=Auto'"
    
    # 1. Update in_pmt_prepay
    add_column_if_not_exists('in_pmt_prepay', 'tran_curr_type', col_def)
    
    # 2. Update in_pmt_prepay_final
    add_column_if_not_exists('in_pmt_prepay_final', 'tran_curr_type', col_def)

    # 3. Recreate Trigger
    print("\nUpdating Trigger trg_pmt_prepay_sync_final...")
    
    drop_sql = 'DROP TRIGGER IF EXISTS trg_pmt_prepay_sync_final'
    DBClient.execute_stmt(drop_sql)
    
    trigger_sql = '''
    CREATE TRIGGER trg_pmt_prepay_sync_final
    AFTER INSERT ON in_pmt_prepay
    FOR EACH ROW
    BEGIN
        IF NEW.tran_ops = 'new' THEN
            INSERT INTO in_pmt_prepay_final (
                tran_num, supplier_code, tran_date, tran_curr_req, tran_curr_use,
                usd_rmb, tran_curr_type, tran_amount, tran_type, tran_seq, tran_by, tran_note
            ) VALUES (
                NEW.tran_num, NEW.supplier_code, NEW.tran_date, NEW.tran_curr_req, NEW.tran_curr_use,
                NEW.usd_rmb, NEW.tran_curr_type, NEW.tran_amount, NEW.tran_type, NEW.tran_seq, NEW.tran_by, NEW.tran_note
            );
        ELSEIF NEW.tran_ops = 'adjust' THEN
            UPDATE in_pmt_prepay_final SET
                tran_curr_req = NEW.tran_curr_req,
                tran_curr_use = NEW.tran_curr_use,
                usd_rmb = NEW.usd_rmb,
                tran_curr_type = NEW.tran_curr_type,
                tran_amount = NEW.tran_amount,
                tran_seq = NEW.tran_seq,
                tran_by = NEW.tran_by,
                tran_note = NEW.tran_note
            WHERE tran_num = NEW.tran_num;
        END IF;
    END
    '''
    DBClient.execute_stmt(trigger_sql)
    print("✅ Trigger updated successfully")

    # 4. Verify
    print("\n" + "=" * 60)
    print("验证表结构:")
    desc = DBClient.read_df("DESCRIBE in_pmt_prepay_final")
    row = desc[desc['Field'] == 'tran_curr_type']
    if not row.empty:
        print(f"in_pmt_prepay_final.tran_curr_type: {row.iloc[0]['Type']}")
    else:
        print("❌ Failed to verify column in in_pmt_prepay_final")

if __name__ == "__main__":
    update_schema()
