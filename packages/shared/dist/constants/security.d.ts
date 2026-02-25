/**
 * Security level constants
 */
export declare const SecurityLevels: {
    readonly L1: "L1";
    readonly L2: "L2";
    readonly L3: "L3";
    readonly L4: "L4";
};
export type SecurityLevel = typeof SecurityLevels[keyof typeof SecurityLevels];
/**
 * Security level descriptions
 */
export declare const SecurityLevelDescriptions: Record<SecurityLevel, string>;
/**
 * Action keys that require security verification
 */
export declare const SecureActionKeys: {
    readonly CREATE_USER: "btn_create_user";
    readonly DELETE_USER: "btn_delete_user";
    readonly TOGGLE_USER_LOCK: "btn_toggle_user_lock";
    readonly RESET_PASSWORD: "btn_reset_pwd";
    readonly CHANGE_USER_ROLE: "btn_change_user_role";
    readonly UPDATE_PERMISSIONS: "btn_update_perms";
    readonly BACKUP_DATABASE: "btn_backup_db";
    readonly RESTORE_DATABASE: "btn_restore_db";
    readonly CLEAN_DEV_DATA: "btn_clean_dev_data";
    readonly DELETE_INVENTORY: "btn_delete_inventory";
    readonly RESET_FIFO: "btn_reset_fifo";
    readonly DELETE_PAYMENT: "btn_delete_payment";
    readonly VOID_PAYMENT: "btn_void_payment";
};
export type SecureActionKey = typeof SecureActionKeys[keyof typeof SecureActionKeys];
/**
 * Map action keys to required security levels
 */
export declare const ActionSecurityLevels: Record<string, SecurityLevel>;
//# sourceMappingURL=security.d.ts.map