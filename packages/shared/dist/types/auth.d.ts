/**
 * User entity types
 */
export interface User {
    id: string;
    username: string;
    email: string;
    displayName: string | null;
    roles: UserRole[];
    permissions: UserPermissions;
    status: UserStatus;
    settings: UserSettings;
    lastLoginAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}
export type UserRole = 'superuser' | 'admin' | 'staff' | 'manager' | 'operator' | 'viewer';
export type UserStatus = 'ACTIVE' | 'DISABLED' | 'LOCKED';
export interface UserPermissions {
    modules: Record<string, ModulePermission>;
}
export interface ModulePermission {
    [submodule: string]: PermissionAction[];
}
export type PermissionAction = 'view' | 'create' | 'edit' | 'delete' | '*';
export interface UserSettings {
    language: 'en' | 'zh';
    timezone: string;
}
/**
 * Auth related types
 */
export interface LoginRequest {
    username: string;
    password: string;
    rememberMe?: boolean;
}
export interface LoginResponse {
    user: User;
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface RefreshRequest {
    refreshToken: string;
}
export interface RefreshResponse {
    accessToken: string;
    expiresIn: number;
}
export interface JwtPayload {
    sub: string;
    username: string;
    roles: UserRole[];
    permissions: UserPermissions;
    iat: number;
    exp: number;
    iss: string;
    aud: string;
}
/**
 * Security levels
 */
export type SecurityLevel = 'L1' | 'L2' | 'L3' | 'L4';
export interface SecurityVerifyRequest {
    securityLevel: SecurityLevel;
    securityCode: string;
    actionKey: string;
}
export interface SecurityVerifyResponse {
    verified: boolean;
    validUntil: Date;
    securityToken: string;
}
//# sourceMappingURL=auth.d.ts.map