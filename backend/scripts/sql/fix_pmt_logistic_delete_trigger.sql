-- =====================================================
-- 修复物流付款删除触发器
-- 问题: 删除 in_pmt_logistic 时，in_pmt_logistic_final 没有同步删除
-- =====================================================

-- 先删除已存在的触发器（如果有）
DROP TRIGGER IF EXISTS trg_pmt_logistic_delete_final;

DELIMITER $$

-- 创建删除触发器: 当 in_pmt_logistic 记录被删除时，同步删除 in_pmt_logistic_final 中对应的记录
CREATE TRIGGER trg_pmt_logistic_delete_final
AFTER DELETE ON in_pmt_logistic
FOR EACH ROW
BEGIN
    -- 删除 final 表中对应 pmt_no 的记录
    DELETE FROM in_pmt_logistic_final WHERE pmt_no = OLD.pmt_no;
END$$

DELIMITER ;

-- 验证触发器创建成功
SHOW TRIGGERS LIKE 'in_pmt_logistic';
