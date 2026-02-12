-- ============================================================
-- 为 in_payment_logistic 表添加 note 字段
-- 执行日期: 2026-01-04
-- 说明: 新增 note 列用于记录操作备注（如"原始付款记录"、"删除付款"等）
-- ============================================================

-- 添加 note 列（在 payment_date 后面，seq 前面）
ALTER TABLE in_payment_logistic 
ADD COLUMN note VARCHAR(200) DEFAULT '' COMMENT '操作备注' 
AFTER payment_date;

-- 验证字段是否添加成功
DESCRIBE in_payment_logistic;
