import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { BadRequestException } from '@nestjs/common';
import { SecurityService } from './security.service';
import { PrismaService } from '../../common/prisma';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
}));

describe('SecurityService', () => {
  let service: SecurityService;

  const mockPrismaService = {
    securityCode: {
      findFirst: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue: string) => {
      const config: Record<string, string> = {
        'SEC_CODE_L2': '1522',
        'SEC_CODE_L3': '6130',
        'SEC_CODE_L4': 'SuperSecret!',
      };
      return config[key] || defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifySecurityCode', () => {
    it('should verify L1 without code', async () => {
      mockPrismaService.auditLog.create.mockResolvedValue({});

      const result = await service.verifySecurityCode({
        securityLevel: 'L1',
        securityCode: '',
        actionKey: 'test',
      });

      expect(result.verified).toBe(true);
      expect(result.securityToken).toBeDefined();
    });

    it('should verify L2 with correct code from env', async () => {
      mockPrismaService.securityCode.findFirst.mockResolvedValue(null);
      mockPrismaService.auditLog.create.mockResolvedValue({});

      const result = await service.verifySecurityCode({
        securityLevel: 'L2',
        securityCode: '1522',
        actionKey: 'test',
      });

      expect(result.verified).toBe(true);
    });

    it('should verify L2 with correct code from database', async () => {
      mockPrismaService.securityCode.findFirst.mockResolvedValue({
        codeHash: 'hashed-code',
      });
      mockPrismaService.auditLog.create.mockResolvedValue({});
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.verifySecurityCode({
        securityLevel: 'L2',
        securityCode: '1522',
        actionKey: 'test',
      });

      expect(result.verified).toBe(true);
    });

    it('should reject L2 with incorrect code', async () => {
      mockPrismaService.securityCode.findFirst.mockResolvedValue(null);

      await expect(
        service.verifySecurityCode({
          securityLevel: 'L2',
          securityCode: 'wrong',
          actionKey: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should verify L3 with correct code', async () => {
      mockPrismaService.securityCode.findFirst.mockResolvedValue(null);
      mockPrismaService.auditLog.create.mockResolvedValue({});

      const result = await service.verifySecurityCode({
        securityLevel: 'L3',
        securityCode: '6130',
        actionKey: 'db-operation',
      });

      expect(result.verified).toBe(true);
    });

    it('should verify L4 with correct code', async () => {
      mockPrismaService.securityCode.findFirst.mockResolvedValue(null);
      mockPrismaService.auditLog.create.mockResolvedValue({});

      const result = await service.verifySecurityCode({
        securityLevel: 'L4',
        securityCode: 'SuperSecret!',
        actionKey: 'system-reset',
      });

      expect(result.verified).toBe(true);
    });

    it('should reject invalid security level', async () => {
      await expect(
        service.verifySecurityCode({
          securityLevel: 'L5' as any,
          securityCode: 'code',
          actionKey: 'test',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should return security token valid for 5 minutes', async () => {
      mockPrismaService.securityCode.findFirst.mockResolvedValue(null);
      mockPrismaService.auditLog.create.mockResolvedValue({});

      const now = Date.now();
      const result = await service.verifySecurityCode({
        securityLevel: 'L2',
        securityCode: '1522',
        actionKey: 'test',
      });

      const validUntilTime = new Date(result.validUntil).getTime();
      // Should be approximately 5 minutes (300000ms) from now
      expect(validUntilTime - now).toBeGreaterThanOrEqual(290000);
      expect(validUntilTime - now).toBeLessThanOrEqual(310000);
    });
  });
});
