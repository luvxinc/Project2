/**
 * Security level constants
 */
export const SecurityLevels = {
  L1: 'L1', // Query operations - Token only
  L2: 'L2', // Modify operations - Token + Password confirmation
  L3: 'L3', // Database operations - Token + Security code (6 digits)
  L4: 'L4', // System operations - Token + System code (8 digits)
} as const;

export type SecurityLevel = typeof SecurityLevels[keyof typeof SecurityLevels];

/**
 * Security level descriptions
 */
export const SecurityLevelDescriptions: Record<SecurityLevel, string> = {
  L1: 'Query operations',
  L2: 'Modify operations (requires password)',
  L3: 'Database operations (requires security code)',
  L4: 'System operations (requires system code)',
};

/**
 * Action keys that require security verification
 */
export const SecureActionKeys = {
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
} as const;

export type SecureActionKey = typeof SecureActionKeys[keyof typeof SecureActionKeys];

/**
 * Map action keys to required security levels
 */
export const ActionSecurityLevels: Record<string, SecurityLevel> = {
  [SecureActionKeys.CREATE_USER]: 'L2',
  [SecureActionKeys.DELETE_USER]: 'L3',
  [SecureActionKeys.TOGGLE_USER_LOCK]: 'L2',
  [SecureActionKeys.RESET_PASSWORD]: 'L3',
  [SecureActionKeys.CHANGE_USER_ROLE]: 'L3',
  [SecureActionKeys.UPDATE_PERMISSIONS]: 'L3',
  [SecureActionKeys.BACKUP_DATABASE]: 'L3',
  [SecureActionKeys.RESTORE_DATABASE]: 'L4',
  [SecureActionKeys.CLEAN_DEV_DATA]: 'L4',
  [SecureActionKeys.DELETE_INVENTORY]: 'L3',
  [SecureActionKeys.RESET_FIFO]: 'L4',
  [SecureActionKeys.DELETE_PAYMENT]: 'L3',
  [SecureActionKeys.VOID_PAYMENT]: 'L3',
};
