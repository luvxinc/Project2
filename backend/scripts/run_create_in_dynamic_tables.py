#!/usr/bin/env python3
"""
执行 in_dynamic 相关表创建
Usage: python backend/scripts/run_create_in_dynamic_tables.py
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

# DDL Statements
DDL_STATEMENTS = [
    # Table 1: in_dynamic_tran
    """
    CREATE TABLE IF NOT EXISTS `in_dynamic_tran` (
        `record_id`    BIGINT NOT NULL AUTO_INCREMENT COMMENT '每条流水唯一ID',
        `date_record`  DATETIME NOT NULL COMMENT '记录写入时间',
        `po_num`       VARCHAR(100) NULL COMMENT 'PO单号',
        `sku`          VARCHAR(100) NOT NULL COMMENT 'SKU',
        `price`        DECIMAL(10,4) NOT NULL DEFAULT 0.0000 COMMENT '售价/成本价',
        `quantity`     INT NOT NULL DEFAULT 0 COMMENT '数量',
        `action`       ENUM('in','out') NOT NULL COMMENT '进库 in / 出库 out',
        `type`         VARCHAR(50) NOT NULL DEFAULT 'inv' COMMENT '用途标签: sale, inv, return, adjust 等',
        `note`         TEXT NULL COMMENT '备注',
        `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '插入时间',
        PRIMARY KEY (`record_id`),
        INDEX `idx_sku` (`sku`),
        INDEX `idx_date_record` (`date_record`),
        INDEX `idx_action_type` (`action`, `type`),
        INDEX `idx_po_num` (`po_num`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存流水表（进出库记录）'
    """,
    
    # Table 2: in_dynamic_fifo_layers
    """
    CREATE TABLE IF NOT EXISTS `in_dynamic_fifo_layers` (
        `layer_id`       BIGINT NOT NULL AUTO_INCREMENT COMMENT '库存层主键',
        `sku`            VARCHAR(100) NOT NULL COMMENT 'SKU',
        `in_record_id`   BIGINT NOT NULL COMMENT '该层来自哪一笔入库流水',
        `in_date`        DATETIME NOT NULL COMMENT '入库时间',
        `po_num`         VARCHAR(100) NULL COMMENT '来自入库的 po_num',
        `unit_cost`      DECIMAL(10,4) NOT NULL COMMENT '该层的成本单价',
        `qty_in`         INT NOT NULL COMMENT '该层初始入库数量',
        `qty_remaining`  INT NOT NULL COMMENT '该层剩余可用数量',
        `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '生成层的时间',
        `closed_at`      DATETIME NULL COMMENT '当 qty_remaining=0 关闭该层',
        PRIMARY KEY (`layer_id`),
        INDEX `idx_sku` (`sku`),
        INDEX `idx_in_record_id` (`in_record_id`),
        INDEX `idx_sku_remaining` (`sku`, `qty_remaining`),
        INDEX `idx_in_date` (`in_date`),
        CONSTRAINT `fk_fifo_layers_tran` FOREIGN KEY (`in_record_id`) 
            REFERENCES `in_dynamic_tran` (`record_id`) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FIFO 库存层表'
    """,
    
    # Table 3: in_dynamic_fifo_alloc
    """
    CREATE TABLE IF NOT EXISTS `in_dynamic_fifo_alloc` (
        `alloc_id`       BIGINT NOT NULL AUTO_INCREMENT COMMENT '分摊行主键',
        `out_record_id`  BIGINT NOT NULL COMMENT '对应哪一笔出库流水',
        `sku`            VARCHAR(100) NOT NULL COMMENT 'SKU',
        `out_date`       DATETIME NOT NULL COMMENT '出库时间',
        `layer_id`       BIGINT NOT NULL COMMENT '从哪个入库层扣的',
        `qty_alloc`      INT NOT NULL COMMENT '从该层扣掉的数量',
        `unit_cost`      DECIMAL(10,4) NOT NULL COMMENT '该层的成本单价',
        `cost_alloc`     DECIMAL(12,4) NOT NULL COMMENT 'qty_alloc * unit_cost',
        `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '写入时间',
        PRIMARY KEY (`alloc_id`),
        INDEX `idx_out_record_id` (`out_record_id`),
        INDEX `idx_layer_id` (`layer_id`),
        INDEX `idx_sku` (`sku`),
        INDEX `idx_out_date` (`out_date`),
        CONSTRAINT `fk_fifo_alloc_tran` FOREIGN KEY (`out_record_id`) 
            REFERENCES `in_dynamic_tran` (`record_id`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT `fk_fifo_alloc_layers` FOREIGN KEY (`layer_id`) 
            REFERENCES `in_dynamic_fifo_layers` (`layer_id`) ON DELETE RESTRICT ON UPDATE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FIFO 分摊记录表'
    """
]

def main():
    print("=" * 60)
    print("Creating in_dynamic tables...")
    print("=" * 60)
    
    for i, ddl in enumerate(DDL_STATEMENTS, 1):
        table_name = ddl.split('`')[1] if '`' in ddl else f"Statement {i}"
        print(f"\n[{i}/3] Creating table: {table_name}")
        
        success = DBClient.execute_stmt(ddl)
        if success:
            print(f"  ✅ Success")
        else:
            print(f"  ❌ Failed")
            return 1
    
    print("\n" + "=" * 60)
    print("✅ All tables created successfully!")
    print("=" * 60)
    
    # Verification
    print("\nVerification:")
    for table in ['in_dynamic_tran', 'in_dynamic_fifo_layers', 'in_dynamic_fifo_alloc']:
        df = DBClient.read_df(f"SHOW CREATE TABLE `{table}`")
        if not df.empty:
            print(f"  ✅ {table} exists")
        else:
            print(f"  ❌ {table} not found")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
