# V3 @SecurityLevel 覆盖审计

> 生成时间: 2026-02-16T20:50 PST
> 目的: 标记所有 V1 action_registry 中的 66 个 action key 在 V3 中的 @SecurityLevel 覆盖状态

---

## 覆盖统计

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 已覆盖 | 5 | V3 端点已加 `@SecurityLevel` |
| ⏳ V3 端点存在但未加注解 | 0 | 需要补加 |
| 🔲 V3 模块未迁移 | 61 | 端点不存在于 V3，在 V2 运行 |

---

## ✅ 已覆盖的 action key (5 个)

| action_key | V3 Controller | 注解 | 模块 |
|-----------|--------------|------|------|
| `btn_create_skus` | `ProductController.createProduct` | `@SecurityLevel(level="L3", actionKey="btn_create_skus")` | Products |
| `btn_create_skus` | `ProductController.batchCreate` | `@SecurityLevel(level="L3", actionKey="btn_create_skus")` | Products |
| `btn_batch_update_cogs` | `ProductController.batchUpdateCogs` | `@SecurityLevel(level="L3", actionKey="btn_batch_update_cogs")` | Products |
| `btn_delete_product` | `ProductController.deleteProduct` | `@SecurityLevel(level="L3", actionKey="btn_delete_product")` | Products |
| `btn_update_perms` | `UserController.updatePermissions` | `@SecurityLevel(level="L2", actionKey="btn_update_perms")` | User Admin |

---

## 🔲 V3 模块未迁移的 action key (61 个)

这些 action key 的对应端点**尚未迁移到 V3**，仍在 V2 (NestJS) 运行。
等模块迁移到 V3 时，必须同步加 `@SecurityLevel` 注解。

### Sales (5 keys)
| action_key | V1 位置 | 等级 | 迁移优先级 |
|-----------|---------|------|-----------|
| `btn_commit_sku_fix` | `etl/views.py` | L2 | Phase 2 |
| `btn_run_transform` | `etl/views.py` | L2 | Phase 2 |
| `btn_generate_report` | `reports/views.py` | L2 | Phase 2 |
| `btn_download_report` | `reports/views.py` | L1 | Phase 2 |
| `btn_clear_reports` | `reports/views.py` | L2 | Phase 2 |
| `btn_unlock_visuals` | `visuals/views.py` | L2 | Phase 2 |

### Purchase (21 keys)
| action_key | V1 位置 | 等级 | 迁移优先级 |
|-----------|---------|------|-----------|
| `btn_add_supplier` | `purchase/supplier.py` | L2 | Phase 2 |
| `btn_modify_strategy` | `purchase/supplier.py` | L2 | Phase 2 |
| `btn_po_create` | `purchase/po_create/submit.py` | L2 | Phase 2 |
| `btn_po_modify` | `purchase/po_mgmt/edit.py` | L2 | Phase 2 |
| `btn_po_delete` | `purchase/po_mgmt/delete.py` | L2 | Phase 2 |
| `btn_po_undelete` | `purchase/po_mgmt/delete.py` | L2 | Phase 2 |
| `btn_po_upload_invoice` | `purchase/po_mgmt/invoice.py` | L2 | Phase 2 |
| `btn_po_delete_invoice` | `purchase/po_mgmt/invoice.py` | L2 | Phase 2 |
| `send_order_create` | `purchase/send_mgmt/` | L2 | Phase 2 |
| `btn_send_modify` | `purchase/send_mgmt/edit.py` | L2 | Phase 2 |
| `btn_send_delete` | `purchase/send_mgmt/delete.py` | L2 | Phase 2 |
| `btn_send_undelete` | `purchase/send_mgmt/delete.py` | L2 | Phase 2 |
| `btn_send_upload_invoice` | `purchase/send_mgmt/invoice.py` | L2 | Phase 2 |
| `btn_send_delete_invoice` | `purchase/send_mgmt/invoice.py` | L2 | Phase 2 |
| `btn_receive_confirm` | `purchase/receive/submit.py` | L2 | Phase 2 |
| `btn_receive_mgmt_edit` | `purchase/receive_mgmt/edit.py` | L2 | Phase 2 |
| `btn_receive_delete` | `purchase/receive_mgmt/delete.py` | L2 | Phase 2 |
| `btn_receive_undelete` | `purchase/receive_mgmt/delete.py` | L2 | Phase 2 |
| `btn_receive_delete_file` | `purchase/receive_mgmt/upload.py` | L2 | Phase 2 |
| `btn_abnormal_process` | `purchase/abnormal.py` | L2 | Phase 2 |
| `btn_abnormal_delete` | `purchase/abnormal.py` | L2 | Phase 2 |

### Finance (10 keys)
| action_key | V1 位置 | 等级 |
|-----------|---------|------|
| `logistic_payment_confirm` | V2 NestJS | L2 |
| `logistic_payment_delete` | V2 NestJS | L2 |
| `logistic_payment_file_delete` | V2 NestJS | L2 |
| `logistic_payment_file_upload` | V2 NestJS | L2 |
| `btn_prepay_submit` | `finance/prepay/api.py` | L2 |
| `btn_prepay_delete` | `finance/prepay/api.py` | L2 |
| `btn_prepay_undelete` | `finance/prepay/api.py` | L2 |
| `btn_prepay_upload_file` | `finance/prepay/api.py` | L2 |
| `btn_prepay_delete_file` | `finance/prepay/api.py` | L2 |
| `deposit_payment_submit` | V2 NestJS | L2 |
| `deposit_payment_delete` | V2 NestJS | L2 |
| `deposit_receipt_upload` | V2 NestJS | L2 |
| `deposit_receipt_delete` | V2 NestJS | L2 |
| `po_payment_submit` | V2 NestJS | L2 |
| `po_payment_delete` | V2 NestJS | L2 |
| `po_receipt_upload` | V2 NestJS | L2 |
| `po_receipt_delete` | V2 NestJS | L2 |

### Inventory (4 keys)
| action_key | V1 位置 | 等级 |
|-----------|---------|------|
| `btn_sync_inventory` | `etl/views.py` | L3 |
| `btn_update_single_inv` | `db_admin/views.py` | L3 |
| `btn_drop_inv_col` | `db_admin/views.py` | L4 |
| `btn_generate_barcode` | `products/actions.py` | L2 |

### DB Admin (4 keys)
| action_key | V1 位置 | 等级 |
|-----------|---------|------|
| `btn_create_backup` | `db_admin/views.py` | L3 |
| `btn_restore_db` | `db_admin/views.py` | L4 |
| `btn_delete_backup` | `db_admin/views.py` | L3 |
| `btn_clean_data` | `db_admin/views.py` | L4 |

### User Admin (5 keys)
| action_key | V1 位置 | 等级 | V3 状态 |
|-----------|---------|------|---------|
| `btn_create_user` | `user_admin/views/actions.py` | L2 | V3 端点存在: `UserController.register` |
| `btn_toggle_user_lock` | `user_admin/views/actions.py` | L2 | V3 端点存在: `UserController.toggleLock` |
| `btn_change_user_role` | `user_admin/views/actions.py` | L3 | V3 端点存在: `UserController.changeRole` |
| `btn_reset_pwd` | `user_admin/views/actions.py` | L3 | V3 端点存在: `UserController.resetPassword` |
| `btn_delete_user` | `user_admin/views/actions.py` | L4 | V3 端点存在: `UserController.deleteUser` |

> ⚠️ **注意**: User Admin 这 5 个端点在 V3 存在但未加 `@SecurityLevel`。
> 需要在 phase 下一步中补加。

### Log/Audit (4 keys)
| action_key | V1 位置 | 等级 |
|-----------|---------|------|
| `btn_unlock_view` | `log/views.py, audit/views/actions.py` | L2 |
| `btn_toggle_dev_mode` | `log/views.py` | L3 |
| `btn_clear_dev_logs` | `log/views.py` | L4 |
| `btn_purge_logs` | `audit/views/actions.py` | L4 |
| `btn_patch_system_log` | `audit/views/actions.py` | L3 |

---

## ⚠️ 需要补加 `@SecurityLevel` 的已迁移端点

以下 V3 端点已经存在，但缺少 `@SecurityLevel` 注解:

| Controller | 端点 | 建议 action_key | 建议 Level |
|-----------|------|----------------|-----------|
| `UserController.register` | `POST /users` | `btn_create_user` | L2 |
| `UserController.toggleLock` | `PATCH /users/{id}/lock` | `btn_toggle_user_lock` | L2 |
| `UserController.changeRole` | `PATCH /users/{id}/role` | `btn_change_user_role` | L3 |
| `UserController.resetPassword` | `PATCH /users/{id}/password` | `btn_reset_pwd` | L3 |
| `UserController.deleteUser` | `DELETE /users/{id}` | `btn_delete_user` | L4 |

**VMA 模块**: VMA 是全新模块 (V1 不存在)，不在 action_registry 中。
是否为 VMA 写端点加 `@SecurityLevel` 取决于业务需求。

---

*审计完毕。5/66 action key 已覆盖。5 个 UserController 端点需要补加注解。*
