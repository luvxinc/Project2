"use strict";
/**
 * Common validation utilities
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.isValidUUID = isValidUUID;
exports.isValidEmail = isValidEmail;
exports.isValidPassword = isValidPassword;
exports.sanitizeString = sanitizeString;
/**
 * Check if a string is a valid UUID
 */
function isValidUUID(value) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}
/**
 * Check if a string is a valid email
 */
function isValidEmail(value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(value);
}
/**
 * Check if a password meets minimum requirements
 */
function isValidPassword(password) {
    const errors = [];
    if (password.length < 8) {
        errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
        errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
        errors.push('Password must contain at least one lowercase letter');
    }
    if (!/[0-9]/.test(password)) {
        errors.push('Password must contain at least one number');
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
/**
 * Sanitize a string for safe display
 */
function sanitizeString(value) {
    return value.trim().replace(/[<>]/g, '');
}
//# sourceMappingURL=validation.js.map