-- ============================================================
-- 定金支付表创建脚本
-- 创建日期: 2026-01-06
-- 更新日期: 2026-01-09 (主键改为 po_num，支持批量付款共享 pmt_no)
-- 功能: 定金支付明细表 + 终态表 + 同步触发器
-- ============================================================

-- 1. 创建定金支付明细表 (Mutation Log)
-- 记录所有操作历史，每次操作一条记录
DROP TABLE IF EXISTS `in_pmt_deposit`;
CREATE TABLE `in_pmt_deposit` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `pmt_no` VARCHAR(30) NOT NULL COMMENT '付款单号 (DPMT_{dep_date}_N##)',
    `po_num` VARCHAR(20) NOT NULL COMMENT '订单号',
    `dep_date` DATE NOT NULL COMMENT '支付日期 (YYYY-MM-DD)',
    `dep_cur` VARCHAR(10) NOT NULL DEFAULT 'RMB' COMMENT '结算货币: RMB/USD',
    `dep_paid_cur` DECIMAL(10,4) NOT NULL DEFAULT 1.0000 COMMENT '定金支付汇率',
    `dep_cur_mode` CHAR(1) NOT NULL DEFAULT 'M' COMMENT '汇率获取方式: A=自动, M=手动',
    `dep_paid` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '定金支付金额 (现金)',
    `dep_prepay_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '预付款抵扣金额 (0=无抵扣)',
    `dep_override` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否覆盖标准: 0=否, 1=是',
    `extra_note` VARCHAR(200) DEFAULT NULL COMMENT '额外费用说明',
    `extra_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '额外费用金额',
    `extra_cur` VARCHAR(10) DEFAULT NULL COMMENT '额外费用货币',
    `ops` VARCHAR(10) NOT NULL DEFAULT 'new' COMMENT '操作类型: new/adjust/delete',
    `seq` VARCHAR(10) NOT NULL DEFAULT 'D01' COMMENT '版本号: D01, D02...',
    `by` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '操作用户',
    `note` TEXT COMMENT '操作备注',
    `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    INDEX `idx_pmt_no` (`pmt_no`),
    INDEX `idx_po_num` (`po_num`),
    INDEX `idx_dep_date` (`dep_date`),
    INDEX `idx_ops` (`ops`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定金支付明细表 (Mutation Log)';

-- 2. 创建定金支付终态表 (Resolution Snapshot)
-- 每个 pmt_no 只有一条记录，代表该付款单的最终状态
DROP TABLE IF EXISTS `in_pmt_deposit_final`;
CREATE TABLE `in_pmt_deposit_final` (
    `pmt_no` VARCHAR(30) NOT NULL COMMENT '付款单号 (批量共享)',
    `po_num` VARCHAR(20) NOT NULL PRIMARY KEY COMMENT '订单号 (唯一)',
    `dep_date` DATE NOT NULL COMMENT '支付日期',
    `dep_cur` VARCHAR(10) NOT NULL DEFAULT 'RMB' COMMENT '结算货币: RMB/USD',
    `dep_paid_cur` DECIMAL(10,4) NOT NULL DEFAULT 1.0000 COMMENT '定金支付汇率',
    `dep_cur_mode` CHAR(1) NOT NULL DEFAULT 'M' COMMENT '汇率获取方式: A=自动, M=手动',
    `dep_paid` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '定金支付金额 (现金)',
    `dep_prepay_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '预付款抵扣金额 (0=无抵扣)',
    `dep_override` TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否覆盖标准: 0=否, 1=是',
    `extra_note` VARCHAR(200) DEFAULT NULL COMMENT '额外费用说明',
    `extra_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '额外费用金额',
    `extra_cur` VARCHAR(10) DEFAULT NULL COMMENT '额外费用货币',
    `seq` VARCHAR(10) NOT NULL DEFAULT 'D01' COMMENT '最新版本号',
    `by` VARCHAR(50) NOT NULL DEFAULT '' COMMENT '最后操作用户',
    `note` TEXT COMMENT '最后操作备注',
    `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX `idx_pmt_no` (`pmt_no`),
    INDEX `idx_dep_date` (`dep_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='定金支付终态表 (每订单最新状态)';

-- 3. 删除已存在的触发器 (如果存在)
DROP TRIGGER IF EXISTS `trg_pmt_deposit_to_final`;

-- 4. 创建同步触发器
-- 规则:
--   ops='new'    → INSERT 到终态表
--   ops='adjust' → REPLACE (按 pmt_no 更新)
--   ops='delete' → DELETE from 终态表
DELIMITER //
CREATE TRIGGER `trg_pmt_deposit_to_final`
AFTER INSERT ON `in_pmt_deposit`
FOR EACH ROW
BEGIN
    IF NEW.`ops` = 'new' OR NEW.`ops` = 'adjust' THEN
        -- new/adjust: 使用 REPLACE (存在则更新，不存在则插入)
        REPLACE INTO `in_pmt_deposit_final` (
            `pmt_no`,
            `po_num`,
            `dep_date`,
            `dep_cur`,
            `dep_paid_cur`,
            `dep_cur_mode`,
            `dep_paid`,
            `dep_prepay_amount`,
            `dep_override`,
            `extra_note`,
            `extra_amount`,
            `extra_cur`,
            `seq`,
            `by`,
            `note`
        ) VALUES (
            NEW.`pmt_no`,
            NEW.`po_num`,
            NEW.`dep_date`,
            NEW.`dep_cur`,
            NEW.`dep_paid_cur`,
            NEW.`dep_cur_mode`,
            NEW.`dep_paid`,
            NEW.`dep_prepay_amount`,
            NEW.`dep_override`,
            NEW.`extra_note`,
            NEW.`extra_amount`,
            NEW.`extra_cur`,
            NEW.`seq`,
            NEW.`by`,
            NEW.`note`
        );
    ELSEIF NEW.`ops` = 'delete' THEN
        -- delete: 从终态表中删除 (按 po_num)
        DELETE FROM `in_pmt_deposit_final` WHERE `po_num` = NEW.`po_num`;
    END IF;
END//
DELIMITER ;

-- ============================================================
-- 验证创建结果
-- ============================================================
-- SHOW CREATE TABLE in_pmt_deposit;
-- SHOW CREATE TABLE in_pmt_deposit_final;
-- SHOW TRIGGERS LIKE 'in_pmt_deposit';
