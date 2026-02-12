-- ============================================================
-- 创建仓库码管理表 in_mgmt_barcode
-- 执行日期: 2026-01-04
-- 说明: 存储仓库库位结构定义（货架定位码）
-- ============================================================

CREATE TABLE IF NOT EXISTS in_mgmt_barcode (
    id INT AUTO_INCREMENT PRIMARY KEY,
    
    -- 仓库定位层级
    wh_num VARCHAR(20) NOT NULL COMMENT '仓库号',
    aisle VARCHAR(10) NOT NULL COMMENT '货架排号 (L/R等)',
    bay INT NOT NULL COMMENT '货架跨号 (1,2,3...)',
    level INT NOT NULL COMMENT '货架层号 (1,2,3...)',
    bin VARCHAR(10) NOT NULL COMMENT '库位号 (L/R等)',
    slot VARCHAR(10) NOT NULL COMMENT '格位号 (L/R等)',
    
    -- 审计字段
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    
    -- 唯一约束：完整库位码唯一
    UNIQUE KEY uk_location (wh_num, aisle, bay, level, bin, slot),
    
    -- 索引
    INDEX idx_wh_num (wh_num),
    INDEX idx_aisle_bay (aisle, bay)
    
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='仓库码管理表';

-- 验证表结构
DESCRIBE in_mgmt_barcode;
