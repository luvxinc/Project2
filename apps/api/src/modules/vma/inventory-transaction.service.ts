import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { VmaInventoryAction, VmaProductType, VmaInspectionResult } from '@prisma/client';
import {
  CreateInventoryTransactionDto,
  UpdateInventoryTransactionDto,
  ProductType,
} from './dto/inventory-transaction.dto';
import { parsePacificDate } from './vma-shared.util';

export interface InventoryDetailRow {
  batchNo: string;
  specNo: string;
  recDate: string;
  serialNo: string;
  expDate: string;
  quantity: number;
  actionDate: string;
  operator: string;
  transactionIds: string[];
}

@Injectable()
export class InventoryTransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(productType?: ProductType) {
    const where = productType ? { productType, deletedAt: null } : { deletedAt: null };
    return this.prisma.vmaInventoryTransaction.findMany({
      where,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.vmaInventoryTransaction.findFirst({
      where: { id, deletedAt: null },
    });
    if (!record) throw new NotFoundException(`Transaction ${id} not found`);
    return record;
  }

  async findOneWithBatch(id: string) {
    const record = await this.prisma.vmaInventoryTransaction.findFirst({
      where: { id, deletedAt: null },
      include: { batch: true },
    });
    if (!record) throw new NotFoundException(`Transaction ${id} not found`);
    return record;
  }

  async getActiveOperators() {
    const employees = await this.prisma.vmaEmployee.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      select: { firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return employees.map(e => `${e.firstName} ${e.lastName}`);
  }

  async create(dto: CreateInventoryTransactionDto) {
    return this.prisma.vmaInventoryTransaction.create({
      data: {
        date: parsePacificDate(dto.date),
        action: dto.action as VmaInventoryAction,
        batchNo: dto.batchNo,
        productType: dto.productType as VmaProductType,
        specNo: dto.specNo,
        serialNo: dto.serialNo,
        qty: dto.qty,
        expDate: dto.expDate ? parsePacificDate(dto.expDate) : null,
        inspection: dto.inspection as VmaInspectionResult,
        condition: dto.condition || [],
        notes: dto.notes,
        caseId: dto.caseId,
        operator: dto.operator,
        location: dto.location,
      },
    });
  }

  async upsertReceivingBatch(data: {
    batchNo: string;
    poNo: string | null;
    dateShipped: string | null;
    dateReceived: string;
    timeReceived: string | null;
    operator: string;
    comments: string | null;
  }) {
    return this.prisma.vmaReceivingBatch.upsert({
      where: { batchNo: data.batchNo },
      create: {
        batchNo: data.batchNo,
        poNo: data.poNo,
        dateShipped: data.dateShipped ? parsePacificDate(data.dateShipped) : null,
        dateReceived: parsePacificDate(data.dateReceived),
        timeReceived: data.timeReceived,
        operator: data.operator,
        comments: data.comments,
      },
      update: {
        poNo: data.poNo,
        dateShipped: data.dateShipped ? parsePacificDate(data.dateShipped) : null,
        dateReceived: parsePacificDate(data.dateReceived),
        timeReceived: data.timeReceived,
        operator: data.operator,
        comments: data.comments,
      },
    });
  }

  async findBatchWithTransactions(batchNo: string) {
    const batch = await this.prisma.vmaReceivingBatch.findUnique({
      where: { batchNo },
      include: { transactions: { where: { action: 'REC_CN', deletedAt: null } } },
    });
    if (!batch) throw new NotFoundException(`Batch ${batchNo} not found`);
    return batch;
  }

  async update(id: string, dto: UpdateInventoryTransactionDto) {
    await this.findOne(id); // ensure exists
    const data: any = { ...dto };
    if (dto.date) data.date = parsePacificDate(dto.date);
    if (dto.expDate) data.expDate = parsePacificDate(dto.expDate);
    return this.prisma.vmaInventoryTransaction.update({
      where: { id },
      data,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.vmaInventoryTransaction.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  /** Get distinct spec numbers for dropdown */
  async getSpecOptions(productType: ProductType) {
    if (productType === ProductType.PVALVE) {
      return this.prisma.vmaPValveProduct.findMany({
        where: { isActive: true },
        select: { specification: true, model: true },
        orderBy: { specification: 'asc' },
      });
    }
    return this.prisma.vmaDeliverySystemProduct.findMany({
      where: { isActive: true },
      select: { specification: true, model: true },
      orderBy: { specification: 'asc' },
    });
  }

  /**
   * Calculate inventory summary per spec for a product type.
   *
   * Available = REC_CN + REC_CASE - OUT_CASE - OUT_CN - MOVE_DEMO
   * WIP       = OUT_CASE - REC_CASE - USED_CASE
   * Approaching Exp = Available units with expDate within 30 days
   * Expired         = Available units with expDate < today
   *
   * Optimized: uses Prisma groupBy to aggregate at DB level (P-2 fix).
   */
  async getInventorySummary(productType: ProductType) {
    // Multiplier per action for Available calculation
    const availMult: Record<string, number> = {
      REC_CN: 1, REC_CASE: 1,
      OUT_CASE: -1, OUT_CN: -1, MOVE_DEMO: -1,
      USED_CASE: 0, // doesn't affect shelf count (already subtracted via OUT_CASE)
    };

    // Multiplier per action for WIP calculation
    const wipMult: Record<string, number> = {
      OUT_CASE: 1, REC_CASE: -1, USED_CASE: -1,
      REC_CN: 0, OUT_CN: 0, MOVE_DEMO: 0,
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    // --- Pass 1: DB-level groupBy for totals per (specNo, action) ---
    const grouped = await this.prisma.vmaInventoryTransaction.groupBy({
      by: ['specNo', 'action'],
      where: { productType, deletedAt: null },
      _sum: { qty: true },
    });

    const specMap = new Map<string, {
      available: number; wip: number; approachingExp: number; expired: number;
    }>();

    const getEntry = (spec: string) => {
      if (!specMap.has(spec)) {
        specMap.set(spec, { available: 0, wip: 0, approachingExp: 0, expired: 0 });
      }
      return specMap.get(spec)!;
    };

    for (const row of grouped) {
      const entry = getEntry(row.specNo);
      const totalQty = row._sum.qty ?? 0;
      const am = availMult[row.action] ?? 0;
      const wm = wipMult[row.action] ?? 0;
      entry.available += totalQty * am;
      entry.wip += totalQty * wm;
    }

    // --- Pass 2: DB-level groupBy for expiry tracking (specNo + expDate) ---
    // Only actions that contribute to shelf availability
    const shelfActions = [
      VmaInventoryAction.REC_CN, VmaInventoryAction.REC_CASE,
      VmaInventoryAction.OUT_CASE, VmaInventoryAction.OUT_CN,
      VmaInventoryAction.MOVE_DEMO,
    ];

    const expGrouped = await this.prisma.vmaInventoryTransaction.groupBy({
      by: ['specNo', 'action', 'expDate'],
      where: {
        productType,
        deletedAt: null,
        action: { in: shelfActions },
        expDate: { not: null },
      },
      _sum: { qty: true },
    });

    // Aggregate net qty per (specNo, expDate)
    const expMap = new Map<string, number>();
    for (const row of expGrouped) {
      if (!row.expDate) continue;
      const am = availMult[row.action] ?? 0;
      if (am === 0) continue;
      const key = `${row.specNo}|${row.expDate.toISOString().split('T')[0]}`;
      expMap.set(key, (expMap.get(key) ?? 0) + (row._sum.qty ?? 0) * am);
    }

    for (const [key, net] of expMap.entries()) {
      if (net <= 0) continue;
      const [specNo, dateStr] = key.split('|');
      const expDate = parsePacificDate(dateStr);
      const entry = getEntry(specNo);

      if (expDate < today) {
        entry.expired += net;
      } else if (expDate <= in30Days) {
        entry.approachingExp += net;
      }
    }

    // Ensure no negative values
    const result = Array.from(specMap.entries()).map(([specNo, data]) => ({
      specNo,
      available: Math.max(0, data.available),
      wip: Math.max(0, data.wip),
      approachingExp: Math.max(0, data.approachingExp),
      expired: Math.max(0, data.expired),
    }));

    // Sort by specNo
    result.sort((a, b) => a.specNo.localeCompare(b.specNo));
    return result;
  }

  /**
   * Get inventory detail for a specific spec, split into 5 buckets.
   * Excludes MOVE_DEMO entirely.
   *
   * Available = on-shelf, not near-exp, not expired
   * WIP       = OUT_CASE - REC_CASE - USED_CASE
   * Near Exp  = on-shelf with expDate ≤ 30 days
   * Expired   = on-shelf with expDate < today
   * Returned  = OUT_CN records
   */
  async getInventoryDetail(specNo: string, productType: ProductType) {
    const txns = await this.prisma.vmaInventoryTransaction.findMany({
      where: {
        specNo,
        productType,
        deletedAt: null,
        action: { not: VmaInventoryAction.MOVE_DEMO },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    // Group transactions by serialNo
    const serialMap = new Map<string, typeof txns>();
    for (const txn of txns) {
      const key = txn.serialNo || '__no_serial__';
      if (!serialMap.has(key)) serialMap.set(key, []);
      serialMap.get(key)!.push(txn);
    }

    const available: InventoryDetailRow[] = [];
    const wip: InventoryDetailRow[] = [];
    const nearExp: InventoryDetailRow[] = [];
    const expired: InventoryDetailRow[] = [];
    const returnedToCn: InventoryDetailRow[] = [];

    for (const [serialKey, serialTxns] of serialMap) {
      let recCn = 0, outCase = 0, recCase = 0, usedCase = 0, outCn = 0;
      let recDate: Date | null = null;
      let outCnDate: Date | null = null;
      let batchNo = '';
      let operator = '';
      let expDate: Date | null = null;

      for (const txn of serialTxns) {
        switch (txn.action) {
          case 'REC_CN':
            recCn += txn.qty;
            // Use the earliest (first) REC_CN for the receiving info
            if (!recDate || txn.date < recDate) {
              recDate = txn.date;
              batchNo = txn.batchNo || '';
              operator = txn.operator || '';
              expDate = txn.expDate;
            }
            break;
          case 'OUT_CASE': outCase += txn.qty; break;
          case 'REC_CASE': recCase += txn.qty; break;
          case 'USED_CASE': usedCase += txn.qty; break;
          case 'OUT_CN':
            outCn += txn.qty;
            // Track the latest OUT_CN date for action date
            if (!outCnDate || txn.date > outCnDate) outCnDate = txn.date;
            break;
        }
      }

      const sn = serialKey === '__no_serial__' ? '' : serialKey;
      const txnIds = serialTxns.map(t => t.id);
      const baseRow: InventoryDetailRow = {
        batchNo,
        specNo,
        recDate: recDate?.toISOString().split('T')[0] || '',
        serialNo: sn,
        expDate: expDate?.toISOString().split('T')[0] || '',
        quantity: 0,
        actionDate: '',
        operator,
        transactionIds: txnIds,
      };

      // Returned to China
      if (outCn > 0) {
        returnedToCn.push({ ...baseRow, quantity: outCn, actionDate: outCnDate?.toISOString().split('T')[0] || '' });
      }

      // WIP = OUT_CASE - REC_CASE - USED_CASE
      const inWip = Math.max(0, outCase - recCase - usedCase);
      if (inWip > 0) {
        wip.push({ ...baseRow, quantity: inWip });
      }

      // On shelf = REC_CN + REC_CASE - OUT_CASE - OUT_CN
      const onShelf = Math.max(0, recCn + recCase - outCase - outCn);
      if (onShelf > 0) {
        if (expDate && expDate < today) {
          expired.push({ ...baseRow, quantity: onShelf });
        } else if (expDate && expDate <= in30Days) {
          nearExp.push({ ...baseRow, quantity: onShelf });
        } else {
          available.push({ ...baseRow, quantity: onShelf });
        }
      }
    }

    return { available, wip, nearExp, expired, returnedToCn };
  }

  /**
   * Get all demo inventory items. Combines:
   * 1. Explicit MOVE_DEMO transactions (manual, reject-at-receiving, reject-at-case)
   * 2. Expired on-shelf products (expDate < today, never moved to demo)
   *
   * Optimized: Source 2 uses raw SQL groupBy instead of loading entire table (P-4 fix).
   */
  async getDemoInventory() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ——— Source 1: Explicit MOVE_DEMO transactions ———
    const demoTxns = await this.prisma.vmaInventoryTransaction.findMany({
      where: { action: VmaInventoryAction.MOVE_DEMO, deletedAt: null },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const rows: {
      id: string;
      batchNo: string;
      productType: string;
      specNo: string;
      recDate: string;
      serialNo: string;
      expDate: string;
      qty: number;
      status: string;
      notes: string;
      condition: number[];
      date: string;
    }[] = [];

    for (const tx of demoTxns) {
      let status = 'Manually Moved';
      if (tx.notes?.startsWith('RECEIVING_AUTO')) status = 'Rejected (Receiving)';
      else if (tx.notes?.startsWith('COMPLETION_AUTO')) status = 'Rejected (Case)';

      rows.push({
        id: tx.id,
        batchNo: tx.batchNo || '',
        productType: tx.productType,
        specNo: tx.specNo,
        recDate: tx.date?.toISOString().split('T')[0] || '',
        serialNo: tx.serialNo || '',
        expDate: tx.expDate?.toISOString().split('T')[0] || '',
        qty: tx.qty,
        status,
        notes: tx.notes || '',
        condition: (tx.condition as number[]) || [],
        date: tx.date?.toISOString().split('T')[0] || '',
      });
    }

    // ——— Source 2: Expired on-shelf products ———
    // Use raw SQL to aggregate at DB level instead of loading entire table.
    // onShelf = SUM(qty * multiplier) grouped by (productType, specNo, serialNo)
    // Only include groups where expDate < today and onShelf > 0
    const expiredRows = await this.prisma.$queryRaw<Array<{
      product_type: string;
      spec_no: string;
      serial_no: string | null;
      batch_no: string | null;
      exp_date: Date | null;
      rec_date: Date | null;
      on_shelf: number;
    }>>`
      SELECT
        t.product_type,
        t.spec_no,
        COALESCE(t.serial_no, '') as serial_no,
        MIN(CASE WHEN t.action = 'REC_CN' THEN t.batch_no END) as batch_no,
        MIN(CASE WHEN t.action = 'REC_CN' THEN t.exp_date END) as exp_date,
        MIN(CASE WHEN t.action = 'REC_CN' THEN t.date END) as rec_date,
        SUM(
          CASE t.action
            WHEN 'REC_CN'    THEN t.qty
            WHEN 'REC_CASE'  THEN t.qty
            WHEN 'OUT_CASE'  THEN -t.qty
            WHEN 'OUT_CN'    THEN -t.qty
            WHEN 'MOVE_DEMO' THEN -t.qty
            ELSE 0
          END
        ) as on_shelf
      FROM vma_inventory_transactions t
      WHERE t.deleted_at IS NULL
      GROUP BY t.product_type, t.spec_no, COALESCE(t.serial_no, '')
      HAVING
        SUM(
          CASE t.action
            WHEN 'REC_CN'    THEN t.qty
            WHEN 'REC_CASE'  THEN t.qty
            WHEN 'OUT_CASE'  THEN -t.qty
            WHEN 'OUT_CN'    THEN -t.qty
            WHEN 'MOVE_DEMO' THEN -t.qty
            ELSE 0
          END
        ) > 0
        AND MIN(CASE WHEN t.action = 'REC_CN' THEN t.exp_date END) < ${today}
    `;

    for (const row of expiredRows) {
      const sn = row.serial_no || '';
      rows.push({
        id: `expired-${row.product_type}-${row.spec_no}-${sn || 'no-sn'}`,
        batchNo: row.batch_no || '',
        productType: row.product_type,
        specNo: row.spec_no,
        recDate: row.rec_date?.toISOString().split('T')[0] || '',
        serialNo: sn,
        expDate: row.exp_date?.toISOString().split('T')[0] || '',
        qty: Number(row.on_shelf),
        status: 'Expired',
        notes: '',
        condition: [],
        date: row.exp_date?.toISOString().split('T')[0] || '',
      });
    }

    // Sort: most recent first
    rows.sort((a, b) => b.date.localeCompare(a.date));
    return rows;
  }
}

