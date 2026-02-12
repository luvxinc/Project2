-- ============================================================
-- 迁移脚本: dep_method -> dep_prepay_amount
-- 执行日期: 2026-01-08
-- 功能: 将 dep_method (VARCHAR) 改为 dep_prepay_amount (DECIMAL)
-- ============================================================

-- 1. 修改 in_pmt_deposit 表
-- 先添加新字段
ALTER TABLE `in_pmt_deposit` 
ADD COLUMN `dep_prepay_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 
COMMENT '预付款抵扣金额 (0=无抵扣)' AFTER `dep_paid`;

-- 迁移数据: 如果 dep_method = 'prepay'，暂时无法确定金额，设为 0
-- (历史数据可能需要手动修复，或从其他来源补充)
-- UPDATE `in_pmt_deposit` SET `dep_prepay_amount` = 0 WHERE `dep_method` = 'prepay';

-- 删除旧字段
ALTER TABLE `in_pmt_deposit` DROP COLUMN `dep_method`;

-- 更新 dep_paid 注释
ALTER TABLE `in_pmt_deposit` MODIFY COLUMN `dep_paid` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '定金支付金额 (现金)';

-- 2. 修改 in_pmt_deposit_final 表
ALTER TABLE `in_pmt_deposit_final` 
ADD COLUMN `dep_prepay_amount` DECIMAL(15,2) NOT NULL DEFAULT 0.00 
COMMENT '预付款抵扣金额 (0=无抵扣)' AFTER `dep_paid`;

-- 迁移数据
-- UPDATE `in_pmt_deposit_final` SET `dep_prepay_amount` = 0 WHERE `dep_method` = 'prepay';

-- 删除旧字段
ALTER TABLE `in_pmt_deposit_final` DROP COLUMN `dep_method`;

-- 更新 dep_paid 注释
ALTER TABLE `in_pmt_deposit_final` MODIFY COLUMN `dep_paid` DECIMAL(15,2) NOT NULL DEFAULT 0.00 COMMENT '定金支付金额 (现金)';

-- 3. 重建触发器
DROP TRIGGER IF EXISTS `trg_pmt_deposit_to_final`;

DELIMITER //
CREATE TRIGGER `trg_pmt_deposit_to_final`
AFTER INSERT ON `in_pmt_deposit`
FOR EACH ROW
BEGIN
    REPLACE INTO `in_pmt_deposit_final` (
        `po_num`,
        `dep_date`,
        `dep_paid_cur`,
        `dep_cur_mode`,
        `dep_paid`,
        `dep_prepay_amount`,
        `dep_override`,
        `seq`,
        `by`,
        `note`
    ) VALUES (
        NEW.`po_num`,
        NEW.`dep_date`,
        NEW.`dep_paid_cur`,
        NEW.`dep_cur_mode`,
        NEW.`dep_paid`,
        NEW.`dep_prepay_amount`,
        NEW.`dep_override`,
        NEW.`seq`,
        NEW.`by`,
        NEW.`note`
    );
END//
DELIMITER ;

-- ============================================================
-- 验证
-- ============================================================
-- DESCRIBE in_pmt_deposit;
-- DESCRIBE in_pmt_deposit_final;
-- SHOW TRIGGERS LIKE 'in_pmt_deposit';
