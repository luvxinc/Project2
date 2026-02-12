-- ============================================================================
-- File: create_in_dynamic_tables.sql
-- Description: 创建动态库存管理系统 FIFO 相关表
-- Date: 2026-01-02
-- Tables:
--   1. in_dynamic_tran       - 库存流水表（进出库记录）
--   2. in_dynamic_fifo_layers - FIFO 库存层表
--   3. in_dynamic_fifo_alloc  - FIFO 分摊记录表
-- ============================================================================

-- ============================================================================
-- Table 1: in_dynamic_tran (库存流水表)
-- 作用: 记录所有进库/出库流水，用于排序 & 增量处理
-- ============================================================================
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='库存流水表（进出库记录）';


-- ============================================================================
-- Table 2: in_dynamic_fifo_layers (FIFO 库存层表)
-- 作用: 按入库批次维护库存层，支持 FIFO 成本分摊
-- ============================================================================
CREATE TABLE IF NOT EXISTS `in_dynamic_fifo_layers` (
    `layer_id`       BIGINT NOT NULL AUTO_INCREMENT COMMENT '库存层主键',
    `sku`            VARCHAR(100) NOT NULL COMMENT 'SKU',
    `in_record_id`   BIGINT NOT NULL COMMENT '该层来自哪一笔入库流水 (FK -> in_dynamic_tran.record_id)',
    `in_date`        DATETIME NOT NULL COMMENT '入库时间',
    `po_num`         VARCHAR(100) NULL COMMENT '来自入库的 po_num（方便追溯）',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FIFO 库存层表';


-- ============================================================================
-- Table 3: in_dynamic_fifo_alloc (FIFO 分摊记录表)
-- 作用: 记录每笔出库对各入库层的消耗明细
-- ============================================================================
CREATE TABLE IF NOT EXISTS `in_dynamic_fifo_alloc` (
    `alloc_id`       BIGINT NOT NULL AUTO_INCREMENT COMMENT '分摊行主键',
    `out_record_id`  BIGINT NOT NULL COMMENT '对应哪一笔出库流水 (FK -> in_dynamic_tran.record_id)',
    `sku`            VARCHAR(100) NOT NULL COMMENT 'SKU（冗余存，方便查询）',
    `out_date`       DATETIME NOT NULL COMMENT '出库时间',
    `layer_id`       BIGINT NOT NULL COMMENT '从哪个入库层扣的 (FK -> in_dynamic_fifo_layers.layer_id)',
    `qty_alloc`      INT NOT NULL COMMENT '从该层扣掉的数量',
    `unit_cost`      DECIMAL(10,4) NOT NULL COMMENT '该层的成本单价（冗余存，避免 join）',
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='FIFO 分摊记录表';


-- ============================================================================
-- Verification Queries
-- ============================================================================
-- 执行后可用以下命令验证:
-- DESCRIBE in_dynamic_tran;
-- DESCRIBE in_dynamic_fifo_layers;
-- DESCRIBE in_dynamic_fifo_alloc;
