-- =====================================================
-- in_pmt_logistic 表新增字段
-- =====================================================

-- 添加 usd_rmb 字段 (汇率)
ALTER TABLE in_pmt_logistic 
ADD COLUMN IF NOT EXISTS usd_rmb DECIMAL(10,4) DEFAULT 7.2500 COMMENT '汇率 USD/RMB';

-- 添加 mode 字段 (汇率获取方式 A=自动 M=手动)
ALTER TABLE in_pmt_logistic 
ADD COLUMN IF NOT EXISTS mode CHAR(1) DEFAULT 'M' COMMENT '汇率获取方式 A=自动 M=手动';

-- 添加 log_ops 字段 (操作类型 new/adjust)
ALTER TABLE in_pmt_logistic 
ADD COLUMN IF NOT EXISTS log_ops VARCHAR(10) DEFAULT 'new' COMMENT '操作类型 new/adjust';

-- =====================================================
-- 创建 in_pmt_logistic_final 表
-- =====================================================

CREATE TABLE IF NOT EXISTS in_pmt_logistic_final (
    id INT AUTO_INCREMENT PRIMARY KEY,
    date_record DATE COMMENT '记录日期',
    date_sent DATE COMMENT '发货日期',
    logistic_num VARCHAR(50) COMMENT '物流单号',
    logistic_paid DECIMAL(12,2) DEFAULT 0 COMMENT '物流付款金额',
    usd_rmb DECIMAL(10,4) DEFAULT 7.2500 COMMENT '汇率 USD/RMB',
    mode CHAR(1) DEFAULT 'M' COMMENT '汇率获取方式 A=自动 M=手动',
    extra_paid DECIMAL(12,2) DEFAULT 0 COMMENT '额外付款金额',
    extra_currency VARCHAR(10) DEFAULT 'RMB' COMMENT '额外付款货币',
    extra_note VARCHAR(255) DEFAULT '' COMMENT '额外付款备注',
    payment_date DATE COMMENT '付款日期',
    note VARCHAR(500) COMMENT '备注',
    seq VARCHAR(10) DEFAULT 'V01' COMMENT '版本序号',
    by_user VARCHAR(50) COMMENT '操作人',
    pmt_no VARCHAR(50) NOT NULL COMMENT '付款单号',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_pmt_no (pmt_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='物流付款最终状态表';

-- =====================================================
-- 创建触发器: in_pmt_logistic INSERT 后更新 in_pmt_logistic_final
-- =====================================================

DROP TRIGGER IF EXISTS trg_pmt_logistic_to_final;

DELIMITER $$

CREATE TRIGGER trg_pmt_logistic_to_final
AFTER INSERT ON in_pmt_logistic
FOR EACH ROW
BEGIN
    IF NEW.log_ops = 'new' THEN
        -- new: 插入新行
        INSERT INTO in_pmt_logistic_final (
            date_record, date_sent, logistic_num, logistic_paid, usd_rmb, mode,
            extra_paid, extra_currency, extra_note, payment_date, note, seq, by_user, pmt_no
        ) VALUES (
            NEW.date_record, NEW.date_sent, NEW.logistic_num, NEW.logistic_paid, NEW.usd_rmb, NEW.mode,
            NEW.extra_paid, NEW.extra_currency, NEW.extra_note, NEW.payment_date, NEW.note, NEW.seq_num, NEW.by_user, NEW.pmt_no
        );
    ELSEIF NEW.log_ops = 'adjust' THEN
        -- adjust: 替换旧行
        REPLACE INTO in_pmt_logistic_final (
            date_record, date_sent, logistic_num, logistic_paid, usd_rmb, mode,
            extra_paid, extra_currency, extra_note, payment_date, note, seq, by_user, pmt_no
        ) VALUES (
            NEW.date_record, NEW.date_sent, NEW.logistic_num, NEW.logistic_paid, NEW.usd_rmb, NEW.mode,
            NEW.extra_paid, NEW.extra_currency, NEW.extra_note, NEW.payment_date, NEW.note, NEW.seq_num, NEW.by_user, NEW.pmt_no
        );
    END IF;
END$$

DELIMITER ;

-- =====================================================
-- 创建触发器: in_pmt_logistic DELETE 后同步删除 in_pmt_logistic_final
-- =====================================================

DROP TRIGGER IF EXISTS trg_pmt_logistic_delete_final;

DELIMITER $$

CREATE TRIGGER trg_pmt_logistic_delete_final
AFTER DELETE ON in_pmt_logistic
FOR EACH ROW
BEGIN
    -- 删除 final 表中对应 pmt_no 的记录
    DELETE FROM in_pmt_logistic_final WHERE pmt_no = OLD.pmt_no;
END$$

DELIMITER ;

-- 验证
DESCRIBE in_pmt_logistic;
DESCRIBE in_pmt_logistic_final;
SHOW TRIGGERS LIKE 'in_pmt_logistic';
