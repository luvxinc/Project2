-- ============================================================================
-- File: cleanup_after_20241231.sql
-- Description: 删除2025年1月1日及之后的数据 (保留2024-12-31及之前)
-- Date: 2026-01-13
-- WARNING: 请在执行前备份数据库！
-- 执行顺序: 先删除有外键依赖的子表，再删除主表
-- ============================================================================

-- 禁用外键检查（避免删除时的外键约束问题）
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================================
-- FIFO 相关表 (有外键依赖，先删除)
-- ============================================================================

-- 1. in_dynamic_fifo_alloc (依赖 in_dynamic_tran 和 in_dynamic_fifo_layers)
DELETE FROM in_dynamic_fifo_alloc WHERE out_date > '2024-12-31 23:59:59';

-- 2. in_dynamic_fifo_layers (依赖 in_dynamic_tran)
DELETE FROM in_dynamic_fifo_layers WHERE in_date > '2024-12-31 23:59:59';

-- 3. in_dynamic_landed_price (FIFO入库单价表)
DELETE FROM in_dynamic_landed_price WHERE created_at > '2024-12-31 23:59:59';

-- 4. in_dynamic_tran (库存流水)
DELETE FROM in_dynamic_tran WHERE date_record > '2024-12-31 23:59:59';

-- ============================================================================
-- 入库/收货相关表
-- ============================================================================

-- 5. in_diff (入库差异表)
DELETE FROM in_diff WHERE created_at > '2024-12-31 23:59:59';

-- 6. in_diff_final (入库差异终态)
DELETE FROM in_diff_final WHERE created_at > '2024-12-31 23:59:59';

-- 7. in_receive (入库记录表)
DELETE FROM in_receive WHERE receive_date > '2024-12-31';

-- 8. in_receive_final (入库终态表)
DELETE FROM in_receive_final WHERE receive_date > '2024-12-31';

-- ============================================================================
-- 发货相关表
-- ============================================================================

-- 9. in_send_list (发货单明细表)
DELETE FROM in_send_list WHERE created_at > '2024-12-31 23:59:59';

-- 10. in_send (发货单主表)
DELETE FROM in_send WHERE sent_date > '2024-12-31';

-- 11. in_send_final (发货单终态表)
DELETE FROM in_send_final WHERE sent_date > '2024-12-31';

-- ============================================================================
-- 采购订单相关表
-- ============================================================================

-- 12. in_po_strategy (采购订单策略表)
DELETE FROM in_po_strategy WHERE created_at > '2024-12-31 23:59:59';

-- 13. in_po (采购订单主表)
DELETE FROM in_po WHERE po_date > '2024-12-31';

-- 14. in_po_final (采购订单终态表)
DELETE FROM in_po_final WHERE po_date > '2024-12-31';

-- ============================================================================
-- 付款相关表
-- ============================================================================

-- 15. in_pmt_deposit (定金支付明细表)
DELETE FROM in_pmt_deposit WHERE created_at > '2024-12-31 23:59:59';

-- 16. in_pmt_deposit_final (定金支付终态表)
DELETE FROM in_pmt_deposit_final WHERE created_at > '2024-12-31 23:59:59';

-- 17. in_pmt_logistic (物流付款记录表)
DELETE FROM in_pmt_logistic WHERE created_at > '2024-12-31 23:59:59';

-- 18. in_pmt_logistic_final (物流付款终态表)
DELETE FROM in_pmt_logistic_final WHERE created_at > '2024-12-31 23:59:59';

-- 19. in_pmt_po (货款支付明细表)
DELETE FROM in_pmt_po WHERE created_at > '2024-12-31 23:59:59';

-- 20. in_pmt_po_final (货款支付终态表)
DELETE FROM in_pmt_po_final WHERE created_at > '2024-12-31 23:59:59';

-- 21. in_pmt_prepay (预付款流水表)
DELETE FROM in_pmt_prepay WHERE tran_date > '2024-12-31';

-- 22. in_pmt_prepay_final (预付款终态表)
DELETE FROM in_pmt_prepay_final WHERE updated_at > '2024-12-31 23:59:59';

-- ============================================================================
-- 恢复外键检查
-- ============================================================================
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================================
-- 验证删除结果 (可选执行)
-- ============================================================================
-- SELECT 'in_dynamic_tran' as tbl, COUNT(*) as cnt, MIN(date_record) as min_date, MAX(date_record) as max_date FROM in_dynamic_tran
-- UNION ALL
-- SELECT 'in_po' as tbl, COUNT(*) as cnt, MIN(po_date), MAX(po_date) FROM in_po
-- UNION ALL
-- SELECT 'in_send' as tbl, COUNT(*) as cnt, MIN(sent_date), MAX(sent_date) FROM in_send
-- UNION ALL
-- SELECT 'in_receive' as tbl, COUNT(*) as cnt, MIN(receive_date), MAX(receive_date) FROM in_receive;

-- ============================================================================
-- 注意事项:
-- 1. 执行前请先备份数据库: mysqldump -u root -p erp > erp_backup_20260113.sql
-- 2. 建议先在测试环境验证
-- 3. 如果某些表没有对应的日期字段或字段名不同，可能需要调整
-- ============================================================================
