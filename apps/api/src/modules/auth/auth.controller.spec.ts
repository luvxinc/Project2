import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';

// Mock bcrypt before importing modules that use it
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityService } from './security.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;
  let securityService: SecurityService;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    roles: ['admin'],
    permissions: { modules: {} },
    status: 'ACTIVE',
    settings: { language: 'en', timezone: 'UTC' },
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockAuthService = {
    login: jest.fn(),
    refreshToken: jest.fn(),
    logout: jest.fn(),
    getCurrentUser: jest.fn(),
    changePassword: jest.fn(),
  };

  const mockSecurityService = {
    verifySecurityCode: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: SecurityService, useValue: mockSecurityService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
    securityService = module.get<SecurityService>(SecurityService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('login', () => {
    it('should return login response on success', async () => {
      const loginResponse = {
        user: mockUser,
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
      };
      mockAuthService.login.mockResolvedValue(loginResponse);

      const result = await controller.login({
        username: 'testuser',
        password: 'password',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(loginResponse);
    });
  });

  describe('refresh', () => {
    it('should return new access token', async () => {
      const refreshResponse = {
        accessToken: 'new-access-token',
        expiresIn: 900,
      };
      mockAuthService.refreshToken.mockResolvedValue(refreshResponse);

      const result = await controller.refresh({
        refreshToken: 'valid-refresh-token',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(refreshResponse);
    });
  });

  describe('logout', () => {
    it('should logout successfully', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      const mockRequest = { user: { userId: 'user-1' } };
      const result = await controller.logout(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data.message).toBe('已成功登出');
      expect(mockAuthService.logout).toHaveBeenCalledWith('user-1');
    });
  });

  describe('me', () => {
    it('should return current user', async () => {
      mockAuthService.getCurrentUser.mockResolvedValue(mockUser);

      const mockRequest = { user: { userId: 'user-1' } };
      const result = await controller.me(mockRequest);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUser);
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockAuthService.changePassword.mockResolvedValue(undefined);

      const mockRequest = { user: { userId: 'user-1' } };
      const result = await controller.changePassword(mockRequest, {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      });

      expect(result.success).toBe(true);
      expect(result.data.message).toBe('密码修改成功，请重新登录');
    });
  });

  describe('verifySecurity', () => {
    it('should verify security code successfully', async () => {
      const verifyResponse = {
        verified: true,
        validUntil: new Date(),
        securityToken: 'security-token',
      };
      mockSecurityService.verifySecurityCode.mockResolvedValue(verifyResponse);

      const result = await controller.verifySecurity({
        securityLevel: 'L2',
        securityCode: '1234',
        actionKey: 'test-action',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(verifyResponse);
    });
  });
});
