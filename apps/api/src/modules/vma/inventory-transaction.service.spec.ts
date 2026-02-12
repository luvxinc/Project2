/**
 * VMA Inventory Transaction Service — Unit Tests
 *
 * Coverage:
 * - P0: Inventory calculation formulas (Available/WIP/Expired)
 * - P0: getInventorySummary() (Prisma groupBy)
 * - P0: getInventoryDetail() (multi-bucket serial classification)
 * - P0: getDemoInventory() (raw SQL + Prisma)
 * - D-1: Soft delete behavior (deletedAt filtering)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { InventoryTransactionService, InventoryDetailRow } from './inventory-transaction.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotFoundException } from '@nestjs/common';
import { VmaInventoryAction } from '@prisma/client';

// ================================
// Mock PrismaService
// ================================
const mockPrisma = {
  vmaInventoryTransaction: {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    groupBy: jest.fn(),
  },
  vmaEmployee: {
    findMany: jest.fn(),
  },
  vmaPValveProduct: {
    findMany: jest.fn(),
  },
  vmaDeliverySystemProduct: {
    findMany: jest.fn(),
  },
  vmaReceivingBatch: {
    upsert: jest.fn(),
    findUnique: jest.fn(),
  },
  $queryRaw: jest.fn(),
};

describe('InventoryTransactionService', () => {
  let service: InventoryTransactionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryTransactionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<InventoryTransactionService>(InventoryTransactionService);
    jest.clearAllMocks();
  });

  // ================================
  // 1. findAll — deletedAt filter
  // ================================
  describe('findAll', () => {
    it('should filter soft-deleted records', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([]);
      await service.findAll();
      expect(mockPrisma.vmaInventoryTransaction.findMany).toHaveBeenCalledWith({
        where: { deletedAt: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
    });

    it('should filter by productType + deletedAt', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([]);
      await service.findAll('PVALVE' as any);
      expect(mockPrisma.vmaInventoryTransaction.findMany).toHaveBeenCalledWith({
        where: { productType: 'PVALVE', deletedAt: null },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      });
    });
  });

  // ================================
  // 2. findOne — soft-deleted records excluded
  // ================================
  describe('findOne', () => {
    it('should find an existing non-deleted record', async () => {
      const mockRecord = { id: 'txn-1', deletedAt: null };
      mockPrisma.vmaInventoryTransaction.findFirst.mockResolvedValue(mockRecord);
      const result = await service.findOne('txn-1');
      expect(result).toEqual(mockRecord);
      expect(mockPrisma.vmaInventoryTransaction.findFirst).toHaveBeenCalledWith({
        where: { id: 'txn-1', deletedAt: null },
      });
    });

    it('should throw NotFoundException for soft-deleted record', async () => {
      mockPrisma.vmaInventoryTransaction.findFirst.mockResolvedValue(null);
      await expect(service.findOne('deleted-id')).rejects.toThrow(NotFoundException);
    });
  });

  // ================================
  // 3. remove — soft delete
  // ================================
  describe('remove (soft delete)', () => {
    it('should set deletedAt instead of physical delete', async () => {
      const mockRecord = { id: 'txn-1', deletedAt: null };
      mockPrisma.vmaInventoryTransaction.findFirst.mockResolvedValue(mockRecord);
      mockPrisma.vmaInventoryTransaction.update.mockResolvedValue({ ...mockRecord, deletedAt: new Date() });

      await service.remove('txn-1');

      expect(mockPrisma.vmaInventoryTransaction.update).toHaveBeenCalledWith({
        where: { id: 'txn-1' },
        data: { deletedAt: expect.any(Date) },
      });
    });
  });

  // ================================
  // 4. getActiveOperators — excludes deleted employees
  // ================================
  describe('getActiveOperators', () => {
    it('should filter deleted employees', async () => {
      mockPrisma.vmaEmployee.findMany.mockResolvedValue([
        { firstName: 'John', lastName: 'Doe' },
      ]);
      const result = await service.getActiveOperators();
      expect(result).toEqual(['John Doe']);
      expect(mockPrisma.vmaEmployee.findMany).toHaveBeenCalledWith({
        where: { status: 'ACTIVE', deletedAt: null },
        select: { firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
    });
  });

  // ================================
  // 5. getInventorySummary — DB-level groupBy (P-2 fix)
  // ================================
  describe('getInventorySummary', () => {
    it('should use Prisma groupBy for aggregation', async () => {
      mockPrisma.vmaInventoryTransaction.groupBy
        .mockResolvedValueOnce([
          // Pass 1: totals per (specNo, action)
          { specNo: 'SP-001', action: 'REC_CN', _sum: { qty: 10 } },
          { specNo: 'SP-001', action: 'OUT_CASE', _sum: { qty: 3 } },
          { specNo: 'SP-001', action: 'REC_CASE', _sum: { qty: 1 } },
          { specNo: 'SP-001', action: 'USED_CASE', _sum: { qty: 1 } },
        ])
        .mockResolvedValueOnce([
          // Pass 2: expiry tracking — no expired items in this test
        ]);

      const result = await service.getInventorySummary('PVALVE' as any);

      expect(result).toEqual([{
        specNo: 'SP-001',
        available: 8,   // 10 + 1 - 3 = 8
        wip: 1,          // 3 - 1 - 1 = 1
        approachingExp: 0,
        expired: 0,
      }]);
    });

    it('should calculate expired and near-expiry correctly', async () => {
      const pastDate = new Date('2020-01-01');
      const soonDate = new Date();
      soonDate.setDate(soonDate.getDate() + 15); // 15 days from now

      mockPrisma.vmaInventoryTransaction.groupBy
        .mockResolvedValueOnce([
          { specNo: 'SP-002', action: 'REC_CN', _sum: { qty: 20 } },
        ])
        .mockResolvedValueOnce([
          // Expiry tracking
          { specNo: 'SP-002', action: 'REC_CN', expDate: pastDate, _sum: { qty: 5 } },
          { specNo: 'SP-002', action: 'REC_CN', expDate: soonDate, _sum: { qty: 7 } },
        ]);

      const result = await service.getInventorySummary('PVALVE' as any);

      expect(result[0].expired).toBe(5);
      expect(result[0].approachingExp).toBe(7);
      expect(result[0].available).toBe(20);
    });

    it('should never return negative values', async () => {
      mockPrisma.vmaInventoryTransaction.groupBy
        .mockResolvedValueOnce([
          { specNo: 'SP-003', action: 'OUT_CASE', _sum: { qty: 100 } },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getInventorySummary('PVALVE' as any);

      expect(result[0].available).toBe(0);   // clamped to 0
      expect(result[0].wip).toBe(100);       // OUT_CASE = 100
    });

    it('should include deletedAt: null in groupBy where clause', async () => {
      mockPrisma.vmaInventoryTransaction.groupBy
        .mockResolvedValue([]);

      await service.getInventorySummary('PVALVE' as any);

      // Both groupBy calls should include deletedAt: null
      expect(mockPrisma.vmaInventoryTransaction.groupBy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  // ================================
  // 6. getInventoryDetail — multi-bucket serial classification
  // ================================
  describe('getInventoryDetail', () => {
    const baseDate = new Date('2025-06-15T12:00:00.000Z');
    const futureDate = new Date('2028-12-31T12:00:00.000Z');
    const pastDate = new Date('2024-01-01T12:00:00.000Z');

    it('should classify Available items correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        {
          id: 'txn-1', serialNo: 'SN-001', action: 'REC_CN', qty: 1,
          date: baseDate, batchNo: 'B001', operator: 'Op1', expDate: futureDate,
          specNo: 'SP-001',
        },
      ]);

      const result = await service.getInventoryDetail('SP-001', 'PVALVE' as any);

      expect(result.available).toHaveLength(1);
      expect(result.available[0].serialNo).toBe('SN-001');
      expect(result.available[0].quantity).toBe(1);
      expect(result.wip).toHaveLength(0);
      expect(result.expired).toHaveLength(0);
    });

    it('should classify WIP items correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        { id: 't1', serialNo: 'SN-002', action: 'REC_CN', qty: 1, date: baseDate, batchNo: 'B001', operator: 'Op1', expDate: futureDate, specNo: 'SP-001' },
        { id: 't2', serialNo: 'SN-002', action: 'OUT_CASE', qty: 1, date: baseDate, batchNo: null, operator: null, expDate: null, specNo: 'SP-001' },
      ]);

      const result = await service.getInventoryDetail('SP-001', 'PVALVE' as any);

      expect(result.wip).toHaveLength(1);
      expect(result.wip[0].quantity).toBe(1);      // OUT_CASE(1) - REC_CASE(0) - USED_CASE(0) = 1
      expect(result.available).toHaveLength(0);     // REC_CN(1) + REC_CASE(0) - OUT_CASE(1) - OUT_CN(0) = 0
    });

    it('should classify Expired items correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        { id: 't1', serialNo: 'SN-003', action: 'REC_CN', qty: 1, date: baseDate, batchNo: 'B001', operator: 'Op1', expDate: pastDate, specNo: 'SP-001' },
      ]);

      const result = await service.getInventoryDetail('SP-001', 'PVALVE' as any);

      expect(result.expired).toHaveLength(1);
      expect(result.expired[0].quantity).toBe(1);
      expect(result.available).toHaveLength(0);
    });

    it('should classify Returned-to-CN items correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        { id: 't1', serialNo: 'SN-004', action: 'REC_CN', qty: 1, date: baseDate, batchNo: 'B001', operator: 'Op1', expDate: futureDate, specNo: 'SP-001' },
        { id: 't2', serialNo: 'SN-004', action: 'OUT_CN', qty: 1, date: baseDate, batchNo: null, operator: null, expDate: null, specNo: 'SP-001' },
      ]);

      const result = await service.getInventoryDetail('SP-001', 'PVALVE' as any);

      expect(result.returnedToCn).toHaveLength(1);
      expect(result.returnedToCn[0].quantity).toBe(1);
    });

    it('should pass deletedAt: null in where clause', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([]);

      await service.getInventoryDetail('SP-001', 'PVALVE' as any);

      expect(mockPrisma.vmaInventoryTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });

  // ================================
  // 7. getDemoInventory — explicit MOVE_DEMO + expired on-shelf
  // ================================
  describe('getDemoInventory', () => {
    it('should categorize manual MOVE_DEMO correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        {
          id: 'demo-1', action: 'MOVE_DEMO', qty: 1, specNo: 'SP-001',
          productType: 'PVALVE', serialNo: 'SN-010', batchNo: 'B001',
          date: new Date('2025-06-15'), expDate: new Date('2025-08-01'),
          notes: null, condition: [],
        },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([]); // No expired items

      const result = await service.getDemoInventory();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('Manually Moved');
    });

    it('should categorize RECEIVING_AUTO rejection correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        {
          id: 'demo-2', action: 'MOVE_DEMO', qty: 1, specNo: 'SP-001',
          productType: 'PVALVE', serialNo: 'SN-011', batchNo: 'B001',
          date: new Date('2025-06-15'), expDate: null,
          notes: 'RECEIVING_AUTO|item damaged', condition: [1, 2],
        },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDemoInventory();

      expect(result[0].status).toBe('Rejected (Receiving)');
    });

    it('should categorize COMPLETION_AUTO rejection correctly', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([
        {
          id: 'demo-3', action: 'MOVE_DEMO', qty: 1, specNo: 'SP-001',
          productType: 'PVALVE', serialNo: 'SN-012', batchNo: 'B001',
          date: new Date('2025-06-15'), expDate: null,
          notes: 'COMPLETION_AUTO|REJECTED→DEMO', condition: [],
        },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const result = await service.getDemoInventory();

      expect(result[0].status).toBe('Rejected (Case)');
    });

    it('should include expired on-shelf items from raw SQL', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([]); // No explicit MOVE_DEMO

      mockPrisma.$queryRaw.mockResolvedValue([
        {
          product_type: 'PVALVE', spec_no: 'SP-EXP', serial_no: 'SN-EXP',
          batch_no: 'B-EXP', exp_date: new Date('2024-01-01'),
          rec_date: new Date('2023-06-01'), on_shelf: 2,
        },
      ]);

      const result = await service.getDemoInventory();

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('Expired');
      expect(result[0].qty).toBe(2);
    });

    it('should filter with deletedAt: null for MOVE_DEMO query', async () => {
      mockPrisma.vmaInventoryTransaction.findMany.mockResolvedValue([]);
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.getDemoInventory();

      expect(mockPrisma.vmaInventoryTransaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });
  });
});
