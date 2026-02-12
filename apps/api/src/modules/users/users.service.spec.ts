import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';
import { PrismaService } from '../../common/prisma';
import { ForbiddenException, NotFoundException } from '@nestjs/common';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: PrismaService;

  const mockUser = {
    id: 'user-1',
    username: 'testuser',
    email: 'test@example.com',
    displayName: 'Test User',
    passwordHash: '$2b$10$hashedpassword',
    status: 'ACTIVE',
    roles: ['operator'],
    permissions: {},
    settings: {},
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockAdminUser = {
    ...mockUser,
    id: 'admin-1',
    username: 'admin',
    roles: ['admin'],
  };

  const mockPrismaService = {
    user: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    prisma = module.get<PrismaService>(PrismaService);
    
    jest.clearAllMocks();
  });

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [mockUser];
      mockPrismaService.user.findMany.mockResolvedValue(users);
      mockPrismaService.user.count.mockResolvedValue(1);

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.data).toEqual(users);
      expect(result.meta.total).toBe(1);
      expect(result.meta.page).toBe(1);
    });

    it('should filter by search term', async () => {
      mockPrismaService.user.findMany.mockResolvedValue([mockUser]);
      mockPrismaService.user.count.mockResolvedValue(1);

      await service.findAll({ page: 1, limit: 20, search: 'test' });

      expect(mockPrismaService.user.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { username: { contains: 'test', mode: 'insensitive' } },
              { email: { contains: 'test', mode: 'insensitive' } },
            ]),
          }),
        })
      );
    });
  });

  describe('findOne', () => {
    it('should return a user by id', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.findOne('user-1');

      expect(result).toEqual(mockUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      mockPrismaService.user.findUnique.mockResolvedValue(null);

      await expect(service.findOne('nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(null);
      mockPrismaService.user.create.mockResolvedValue(mockUser);

      const result = await service.create({
        username: 'testuser',
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result).toEqual(mockUser);
      expect(mockPrismaService.user.create).toHaveBeenCalled();
    });

    it('should throw if username already exists', async () => {
      mockPrismaService.user.findFirst.mockResolvedValue(mockUser);

      await expect(
        service.create({
          username: 'testuser',
          email: 'new@example.com',
          password: 'password123',
        })
      ).rejects.toThrow('用户名已存在');
    });
  });

  describe('checkHierarchy', () => {
    it('should allow admin to modify operator', async () => {
      const updatedUser = { ...mockUser, displayName: 'New Name' };
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockUser) // findOne returns target
        .mockResolvedValueOnce({ roles: ['admin'] }) // actor in checkHierarchy
        .mockResolvedValueOnce({ roles: ['operator'] }); // target in checkHierarchy
      mockPrismaService.user.update.mockResolvedValue(updatedUser);

      const result = await service.update('user-1', { displayName: 'New Name' }, 'admin-1');

      expect(result.displayName).toBe('New Name');
    });

    it('should prevent operator from modifying admin', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockAdminUser) // findOne returns target
        .mockResolvedValueOnce({ roles: ['operator'] }) // actor in checkHierarchy
        .mockResolvedValueOnce({ roles: ['admin'] }); // target in checkHierarchy

      await expect(
        service.update('admin-1', { displayName: 'New Name' }, 'user-1')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('lock/unlock', () => {
    it('should lock a user', async () => {
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(mockUser)
        .mockResolvedValueOnce({ roles: ['admin'] })
        .mockResolvedValueOnce({ roles: ['operator'] });
      mockPrismaService.user.update.mockResolvedValue({
        ...mockUser,
        status: 'LOCKED',
      });

      const result = await service.lock('user-1', 'admin-1');

      expect(result.status).toBe('LOCKED');
    });

    it('should unlock a user', async () => {
      const lockedUser = { ...mockUser, status: 'LOCKED' };
      mockPrismaService.user.findUnique
        .mockResolvedValueOnce(lockedUser)
        .mockResolvedValueOnce({ roles: ['admin'] })
        .mockResolvedValueOnce({ roles: ['operator'] });
      mockPrismaService.user.update.mockResolvedValue({
        ...lockedUser,
        status: 'ACTIVE',
      });

      const result = await service.unlock('user-1', 'admin-1');

      expect(result.status).toBe('ACTIVE');
    });
  });
});
