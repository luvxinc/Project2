"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActionSecurityLevels = exports.SecureActionKeys = exports.SecurityLevelDescriptions = exports.SecurityLevels = void 0;
/**
 * Security level constants
 */
exports.SecurityLevels = {
    L1: 'L1', // Query operations - Token only
    L2: 'L2', // Modify operations - Token + Password confirmation
    L3: 'L3', // Database operations - Token + Security code (6 digits)
    L4: 'L4', // System operations - Token + System code (8 digits)
};
/**
 * Security level descriptions
 */
exports.SecurityLevelDescriptions = {
    L1: 'Query operations',
    L2: 'Modify operations (requires password)',
    L3: 'Database operations (requires security code)',
    L4: 'System operations (requires system code)',
};
/**
 * Action keys that require security verification
 */
exports.SecureActionKeys = {
    // User management
    CREATE_USER: 'btn_create_user',
    DELETE_USER: 'btn_delete_user',
    TOGGLE_USER_LOCK: 'btn_toggle_user_lock',
    RESET_PASSWORD: 'btn_reset_pwd',
    CHANGE_USER_ROLE: 'btn_change_user_role',
    UPDATE_PERMISSIONS: 'btn_update_perms',
    // Database operations
    BACKUP_DATABASE: 'btn_backup_db',
    RESTORE_DATABASE: 'btn_restore_db',
    CLEAN_DEV_DATA: 'btn_clean_dev_data',
    // Inventory operations
    DELETE_INVENTORY: 'btn_delete_inventory',
    RESET_FIFO: 'btn_reset_fifo',
    // Finance operations
    DELETE_PAYMENT: 'btn_delete_payment',
    VOID_PAYMENT: 'btn_void_payment',
};
/**
 * Map action keys to required security levels
 */
exports.ActionSecurityLevels = {
    [exports.SecureActionKeys.CREATE_USER]: 'L2',
    [exports.SecureActionKeys.DELETE_USER]: 'L3',
    [exports.SecureActionKeys.TOGGLE_USER_LOCK]: 'L2',
    [exports.SecureActionKeys.RESET_PASSWORD]: 'L3',
    [exports.SecureActionKeys.CHANGE_USER_ROLE]: 'L3',
    [exports.SecureActionKeys.UPDATE_PERMISSIONS]: 'L3',
    [exports.SecureActionKeys.BACKUP_DATABASE]: 'L3',
    [exports.SecureActionKeys.RESTORE_DATABASE]: 'L4',
    [exports.SecureActionKeys.CLEAN_DEV_DATA]: 'L4',
    [exports.SecureActionKeys.DELETE_INVENTORY]: 'L3',
    [exports.SecureActionKeys.RESET_FIFO]: 'L4',
    [exports.SecureActionKeys.DELETE_PAYMENT]: 'L3',
    [exports.SecureActionKeys.VOID_PAYMENT]: 'L3',
};
//# sourceMappingURL=security.js.map