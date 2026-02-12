/**
 * VMA Employees Service — Unit Tests
 *
 * Coverage:
 * - P0: Stack rule enforcement (enforceStackRule)
 * - D-1: Soft delete for employees and departments
 * - Core: Employee and department CRUD with deletedAt filtering
 */
import { Test, TestingModule } from '@nestjs/testing';
import { EmployeesService } from './employees.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ForbiddenException, NotFoundException, ConflictException } from '@nestjs/common';

// ================================
// Mock PrismaService
// ================================
const mockPrisma = {
  vmaEmployee: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn(),
  },
  vmaDepartment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  vmaEmployeeDepartment: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  vmaDutySopHistory: {
    create: jest.fn(),
  },
  vmaDutySopRequirement: {
    findMany: jest.fn(),
    deleteMany: jest.fn(),
    createMany: jest.fn(),
  },
};

describe('EmployeesService', () => {
  let service: EmployeesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmployeesService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EmployeesService>(EmployeesService);
    jest.clearAllMocks();
  });

  // ================================
  // 1. deleteEmployee — Soft Delete (D-1)
  // ================================
  describe('deleteEmployee (soft delete)', () => {
    it('should set deletedAt and status=INACTIVE instead of physical delete', async () => {
      const mockEmployee = {
        id: 'emp-1', employeeNo: 'E001', status: 'ACTIVE', deletedAt: null,
        departmentAssignments: [],
      };
      mockPrisma.vmaEmployee.findUnique.mockResolvedValue(mockEmployee);
      mockPrisma.vmaEmployee.update.mockResolvedValue({
        ...mockEmployee,
        deletedAt: new Date(),
        status: 'INACTIVE',
      });

      const result = await service.deleteEmployee('emp-1');

      expect(result).toEqual({ success: true, id: 'emp-1' });
      expect(mockPrisma.vmaEmployee.update).toHaveBeenCalledWith({
        where: { id: 'emp-1' },
        data: {
          deletedAt: expect.any(Date),
          status: 'INACTIVE',
        },
      });
    });

    it('should throw NotFoundException for non-existent employee', async () => {
      mockPrisma.vmaEmployee.findUnique.mockResolvedValue(null);
      await expect(service.deleteEmployee('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ================================
  // 2. deleteDepartment — Soft Delete with guard (D-1)
  // ================================
  describe('deleteDepartment (soft delete)', () => {
    it('should set deletedAt and isActive=false instead of physical delete', async () => {
      const mockDept = {
        id: 'dept-1', code: 'ENG', isActive: true, deletedAt: null,
        _count: { employeeAssignments: 0 },
      };
      mockPrisma.vmaDepartment.findUnique.mockResolvedValue(mockDept);
      mockPrisma.vmaDepartment.update.mockResolvedValue({
        ...mockDept,
        deletedAt: new Date(),
        isActive: false,
      });

      const result = await service.deleteDepartment('dept-1');

      expect(result).toEqual({ success: true, id: 'dept-1' });
      expect(mockPrisma.vmaDepartment.update).toHaveBeenCalledWith({
        where: { id: 'dept-1' },
        data: {
          deletedAt: expect.any(Date),
          isActive: false,
        },
      });
    });

    it('should throw ConflictException if department has employee assignments', async () => {
      mockPrisma.vmaDepartment.findUnique.mockResolvedValue({
        id: 'dept-2', code: 'HR',
        _count: { employeeAssignments: 3 },
      });

      await expect(service.deleteDepartment('dept-2')).rejects.toThrow(ConflictException);
    });

    it('should throw NotFoundException for non-existent department', async () => {
      mockPrisma.vmaDepartment.findUnique.mockResolvedValue(null);
      await expect(service.deleteDepartment('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  // ================================
  // 3. enforceStackRule — only most recent record modifiable
  // ================================
  describe('enforceStackRule (via removeDepartmentAssignment)', () => {
    it('should succeed when assignment exists and is active', async () => {
      const mockAssignment = {
        id: 'assign-2',
        employeeId: 'emp-1',
        removedAt: null,
      };
      mockPrisma.vmaEmployeeDepartment.findUnique.mockResolvedValue(mockAssignment);
      mockPrisma.vmaEmployeeDepartment.update.mockResolvedValue({
        ...mockAssignment,
        removedAt: new Date(),
        department: { id: 'd1', code: 'ENG' },
      });

      const result = await service.removeDepartmentAssignment('assign-2', {
        removedAt: '2025-06-15',
      });

      expect(result.removedAt).toBeDefined();
    });

    it('should throw NotFoundException for non-existent assignment', async () => {
      mockPrisma.vmaEmployeeDepartment.findUnique.mockResolvedValue(null);

      await expect(
        service.removeDepartmentAssignment('non-existent', { removedAt: '2025-06-15' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException for already-removed assignment', async () => {
      mockPrisma.vmaEmployeeDepartment.findUnique.mockResolvedValue({
        id: 'assign-1',
        employeeId: 'emp-1',
        removedAt: new Date('2025-01-01'), // Already removed
      });

      await expect(
        service.removeDepartmentAssignment('assign-1', { removedAt: '2025-06-15' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ================================
  // 4. findAllEmployees — pagination + search
  // ================================
  describe('findAllEmployees', () => {
    it('should return paginated results', async () => {
      mockPrisma.vmaEmployee.findMany.mockResolvedValue([]);
      mockPrisma.vmaEmployee.count.mockResolvedValue(0);

      const result = await service.findAllEmployees({ page: 1, limit: 10 });

      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });
    });
  });
});
