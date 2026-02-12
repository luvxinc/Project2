import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma';
import * as bcrypt from 'bcrypt';

// Mock bcrypt
jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let prismaService: PrismaService;
  let jwtService: JwtService;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    passwordHash: 'hashed-password',
    roles: ['admin'],
    permissions: { modules: { products: { '*': ['*'] } } },
    status: 'ACTIVE',
    settings: { language: 'en', timezone: 'UTC' },
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockJwtService = {
    sign: jest.fn().mockReturnValue('mock-access-token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: any) => defaultValue),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prismaService = module.get<PrismaService>(PrismaService);
    jwtService = module.get<JwtService>(JwtService);

    // Reset mocks
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateUser', () => {
    it('should return user when credentials are valid', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.validateUser('testuser', 'password');

      expect(result).toBeDefined();
      expect(result?.username).toBe('testuser');
    });

    it('should return null when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      const result = await service.validateUser('nonexistent', 'password');

      expect(result).toBeNull();
    });

    it('should return null when password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      const result = await service.validateUser('testuser', 'wrongpassword');

      expect(result).toBeNull();
    });

    it('should throw UnauthorizedException when user is locked', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'LOCKED',
      });

      await expect(
        service.validateUser('testuser', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when user is disabled', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue({
        ...mockUser,
        status: 'DISABLED',
      });

      await expect(
        service.validateUser('testuser', 'password'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('login', () => {
    it('should return tokens and user on successful login', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.create.mockResolvedValue({});
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        username: 'testuser',
        password: 'password',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.user.username).toBe('testuser');
      expect(mockPrismaService.user.update).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on invalid credentials', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(
        service.login({ username: 'invalid', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refreshToken', () => {
    const mockRefreshToken = {
      token: 'valid-refresh-token',
      userId: 'user-1',
      expiresAt: new Date(Date.now() + 86400000), // 1 day from now
      revokedAt: null,
      user: mockUser,
    };

    it('should return new access token on valid refresh', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(mockRefreshToken);

      const result = await service.refreshToken({
        refreshToken: 'valid-refresh-token',
      });

      expect(result.accessToken).toBe('mock-access-token');
    });

    it('should throw UnauthorizedException when refresh token not found', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue(null);

      await expect(
        service.refreshToken({ refreshToken: 'invalid-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when refresh token is expired', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        expiresAt: new Date(Date.now() - 86400000), // 1 day ago
      });

      await expect(
        service.refreshToken({ refreshToken: 'expired-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException when refresh token is revoked', async () => {
      mockPrismaService.refreshToken.findUnique.mockResolvedValue({
        ...mockRefreshToken,
        revokedAt: new Date(),
      });

      await expect(
        service.refreshToken({ refreshToken: 'revoked-token' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should revoke all refresh tokens for user', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('user-1');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('should revoke specific refresh token when provided', async () => {
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });

      await service.logout('user-1', 'specific-token');

      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', token: 'specific-token' },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('changePassword', () => {
    it('should change password successfully', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      mockPrismaService.user.update.mockResolvedValue(mockUser);
      mockPrismaService.refreshToken.updateMany.mockResolvedValue({ count: 1 });
      (bcrypt.compare as jest.Mock)
        .mockResolvedValueOnce(true)  // current password check
        .mockResolvedValueOnce(false); // new password != old password check
      (bcrypt.hash as jest.Mock).mockResolvedValue('new-hashed-password');

      await service.changePassword('user-1', {
        currentPassword: 'oldpassword',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      });

      expect(mockPrismaService.user.update).toHaveBeenCalled();
      expect(mockPrismaService.refreshToken.updateMany).toHaveBeenCalled();
    });

    it('should throw when current password is wrong', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123',
          confirmPassword: 'newpassword123',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when passwords do not match', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      await expect(
        service.changePassword('user-1', {
          currentPassword: 'oldpassword',
          newPassword: 'newpassword123',
          confirmPassword: 'differentpassword',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getCurrentUser', () => {
    it('should return current user', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getCurrentUser('user-1');

      expect(result.username).toBe('testuser');
    });

    it('should throw UnauthorizedException when user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.getCurrentUser('nonexistent')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
