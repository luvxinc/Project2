/**
 * Common validation utilities
 */
/**
 * Check if a string is a valid UUID
 */
export declare function isValidUUID(value: string): boolean;
/**
 * Check if a string is a valid email
 */
export declare function isValidEmail(value: string): boolean;
/**
 * Check if a password meets minimum requirements
 */
export declare function isValidPassword(password: string): {
    valid: boolean;
    errors: string[];
};
/**
 * Sanitize a string for safe display
 */
export declare function sanitizeString(value: string): string;
//# sourceMappingURL=validation.d.ts.map