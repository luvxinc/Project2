import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { VmaInventoryAction, VmaProductType } from '@prisma/client';
import { parsePacificDate } from './vma-shared.util';

interface CaseLineItem {
  productType: 'PVALVE' | 'DELIVERY_SYSTEM';
  specNo: string;
  serialNo: string;
  qty: number;
  expDate: string;   // YYYY-MM-DD
  batchNo?: string;
}

interface CreateCaseDto {
  caseNo?: string;
  siteId: string;
  patientId: string;
  caseDate: string;  // YYYY-MM-DD
  items: CaseLineItem[];
}

export interface PickedProduct {
  serialNo: string;
  specNo: string;
  expDate: string;
  batchNo: string;
  qty: number;
}

@Injectable()
export class ClinicalCaseService {
  constructor(private readonly prisma: PrismaService) {}

  // ====================================
  // List all cases
  // ====================================
  async findAll() {
    return this.prisma.vmaClinicalCase.findMany({
      orderBy: { caseDate: 'desc' },
      include: {
        site: { select: { siteName: true } },
      },
    });
  }

  // ====================================
  // Get case with related transactions
  // ====================================
  async findOne(caseId: string) {
    const c = await this.prisma.vmaClinicalCase.findUnique({
      where: { caseId },
      include: {
        site: true,
        transactions: {
          where: { action: 'OUT_CASE' },
          orderBy: [{ productType: 'asc' }, { specNo: 'asc' }, { serialNo: 'asc' }],
        },
      },
    });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    return c;
  }

  // ====================================
  // Update Case basic info (caseNo, siteId, patientId, caseDate)
  // ====================================
  async updateCaseInfo(
    caseId: string,
    dto: { caseNo?: string; siteId?: string; patientId?: string; caseDate?: string },
  ) {
    const c = await this.prisma.vmaClinicalCase.findUnique({ where: { caseId } });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    if (c.status === 'COMPLETED') throw new BadRequestException('Cannot modify a completed case');

    // Check caseNo uniqueness if changing
    if (dto.caseNo !== undefined && dto.caseNo !== c.caseNo) {
      if (dto.caseNo) {
        const dup = await this.prisma.vmaClinicalCase.findUnique({ where: { caseNo: dto.caseNo } });
        if (dup) throw new ConflictException(`Case # "${dto.caseNo}" already exists`);
      }
    }

    const updateData: any = {};
    if (dto.caseNo !== undefined) updateData.caseNo = dto.caseNo || null;
    if (dto.siteId !== undefined) updateData.siteId = dto.siteId;
    if (dto.patientId !== undefined) updateData.patientId = dto.patientId;
    if (dto.caseDate !== undefined) updateData.caseDate = parsePacificDate(dto.caseDate);

    return this.prisma.vmaClinicalCase.update({
      where: { caseId },
      data: updateData,
      include: { site: { select: { siteName: true } } },
    });
  }

  // ====================================
  // Internal: compute on-shelf candidates for a spec
  // Returns all available products sorted by expDate ASC
  // ====================================
  private async getCandidates(
    specNo: string,
    caseDate: string,
    productType: 'PVALVE' | 'DELIVERY_SYSTEM',
  ) {
    const caseDateObj = parsePacificDate(caseDate);

    const txns = await this.prisma.vmaInventoryTransaction.findMany({
      where: { specNo, productType, deletedAt: null, action: { not: VmaInventoryAction.MOVE_DEMO } },
    });

    // Group by serialNo → compute on-shelf qty
    const serialMap = new Map<string, {
      onShelf: number;
      expDate: Date | null;
      batchNo: string;
    }>();

    for (const txn of txns) {
      const sn = txn.serialNo || '__no_serial__';
      if (!serialMap.has(sn)) serialMap.set(sn, { onShelf: 0, expDate: null, batchNo: '' });
      const entry = serialMap.get(sn)!;

      const mult: Record<string, number> = {
        REC_CN: 1, REC_CASE: 1,
        OUT_CASE: -1, OUT_CN: -1, MOVE_DEMO: -1,
        USED_CASE: 0,
      };
      entry.onShelf += txn.qty * (mult[txn.action] ?? 0);

      if (txn.action === 'REC_CN') {
        if (!entry.expDate || (txn.expDate && txn.expDate < entry.expDate)) {
          entry.expDate = txn.expDate;
        }
        entry.batchNo = txn.batchNo || '';
      }
    }

    // Filter to on-shelf > 0, not expired relative to caseDate
    const candidates: { serialNo: string; expDate: Date; batchNo: string; onShelf: number }[] = [];
    for (const [sn, data] of serialMap) {
      if (data.onShelf <= 0) continue;
      if (sn === '__no_serial__') continue;
      if (data.expDate && data.expDate < caseDateObj) continue;
      candidates.push({
        serialNo: sn,
        expDate: data.expDate || new Date('2099-12-31'),
        batchNo: data.batchNo,
        onShelf: data.onShelf,
      });
    }

    // Sort by expDate ASC (soonest expiring first)
    candidates.sort((a, b) => a.expDate.getTime() - b.expDate.getTime());
    return { candidates, specNo };
  }

  // ====================================
  // Auto-pick products for a spec
  // Priority: near-exp first (based on caseDate), then available
  // ====================================
  async pickProducts(
    specNo: string,
    qty: number,
    caseDate: string,
    productType: 'PVALVE' | 'DELIVERY_SYSTEM',
  ): Promise<PickedProduct[]> {
    const { candidates } = await this.getCandidates(specNo, caseDate, productType);

    // Pick until qty fulfilled
    const picked: PickedProduct[] = [];
    let remaining = qty;
    for (const cand of candidates) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, cand.onShelf);
      for (let i = 0; i < take; i++) {
        picked.push({
          serialNo: cand.serialNo,
          specNo,
          expDate: cand.expDate.toISOString().split('T')[0],
          batchNo: cand.batchNo,
          qty: 1,
        });
      }
      remaining -= take;
    }

    return picked;
  }

  // ====================================
  // Get ALL available products for a spec (for manual user selection)
  // ====================================
  async getAvailableProducts(
    specNo: string,
    caseDate: string,
    productType: 'PVALVE' | 'DELIVERY_SYSTEM',
  ): Promise<PickedProduct[]> {
    const { candidates } = await this.getCandidates(specNo, caseDate, productType);

    // Return all candidates (each unit as separate row)
    const all: PickedProduct[] = [];
    for (const cand of candidates) {
      for (let i = 0; i < cand.onShelf; i++) {
        all.push({
          serialNo: cand.serialNo,
          specNo,
          expDate: cand.expDate.toISOString().split('T')[0],
          batchNo: cand.batchNo,
          qty: 1,
        });
      }
    }
    return all;
  }

  // ====================================
  // Get compatible Delivery Systems for given P-Valve specs
  // ====================================
  async getCompatibleDS(pvalveSpecs: string[]) {
    // Find P-Valve product IDs by specification
    const pvalves = await this.prisma.vmaPValveProduct.findMany({
      where: { specification: { in: pvalveSpecs } },
      select: { id: true, specification: true },
    });

    if (pvalves.length === 0) return [];

    const pvalveIds = pvalves.map(p => p.id);

    // Find fits
    const fits = await this.prisma.vmaDeliverySystemFit.findMany({
      where: { pvalveId: { in: pvalveIds } },
      include: {
        deliverySystem: { select: { id: true, specification: true, model: true } },
      },
    });

    // Deduplicate DS
    const dsMap = new Map<string, { specification: string; model: string }>();
    for (const fit of fits) {
      dsMap.set(fit.deliverySystem.specification, {
        specification: fit.deliverySystem.specification,
        model: fit.deliverySystem.model,
      });
    }

    return Array.from(dsMap.values()).sort((a, b) => a.specification.localeCompare(b.specification));
  }

  // ====================================
  // Create Case + OUT_CASE transactions
  // ====================================
  async createCase(dto: CreateCaseDto) {
    const caseId = `UVP-${dto.siteId}-${dto.patientId}`;

    // Check uniqueness
    const existing = await this.prisma.vmaClinicalCase.findUnique({ where: { caseId } });
    if (existing) throw new ConflictException(`Case "${caseId}" already exists`);

    // Check caseNo uniqueness
    if (dto.caseNo) {
      const existingNo = await this.prisma.vmaClinicalCase.findUnique({ where: { caseNo: dto.caseNo } });
      if (existingNo) throw new ConflictException(`Case # "${dto.caseNo}" already exists`);
    }

    // Verify site exists
    const site = await this.prisma.vmaSite.findUnique({ where: { siteId: dto.siteId } });
    if (!site) throw new NotFoundException(`Site "${dto.siteId}" not found`);

    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one product item is required');
    }

    // Create case + transactions in a single Prisma transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Create clinical case
      const clinicalCase = await tx.vmaClinicalCase.create({
        data: {
          caseId,
          caseNo: dto.caseNo || null,
          siteId: dto.siteId,
          patientId: dto.patientId,
          caseDate: parsePacificDate(dto.caseDate),
          status: 'IN_PROGRESS',
        },
      });

      // 2. Create OUT_CASE transactions for each item
      const txnData = dto.items.map(item => ({
        date: parsePacificDate(dto.caseDate),
        action: 'OUT_CASE' as const,
        productType: item.productType as VmaProductType,
        specNo: item.specNo,
        serialNo: item.serialNo,
        qty: item.qty,
        expDate: item.expDate ? parsePacificDate(item.expDate) : null,
        caseId,
        batchNo: item.batchNo || null,
      }));

      await tx.vmaInventoryTransaction.createMany({ data: txnData });

      return clinicalCase;
    });

    return { ...result, site };
  }

  // ====================================
  // Update a single case item (swap product / change qty)
  // Cannot modify if case status is COMPLETED
  // ====================================
  async updateCaseItem(
    caseId: string,
    txnId: string,
    dto: { specNo?: string; serialNo?: string; qty?: number; expDate?: string; batchNo?: string },
  ) {
    const c = await this.prisma.vmaClinicalCase.findUnique({ where: { caseId } });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    if (c.status === 'COMPLETED') throw new BadRequestException('Cannot modify a completed case');

    const txn = await this.prisma.vmaInventoryTransaction.findUnique({ where: { id: txnId } });
    if (!txn || txn.caseId !== caseId) throw new NotFoundException(`Transaction not found in case "${caseId}"`);

    const updateData: any = {};
    if (dto.specNo !== undefined) updateData.specNo = dto.specNo;
    if (dto.serialNo !== undefined) updateData.serialNo = dto.serialNo;
    if (dto.qty !== undefined) updateData.qty = dto.qty;
    if (dto.expDate !== undefined) updateData.expDate = dto.expDate ? parsePacificDate(dto.expDate) : null;
    if (dto.batchNo !== undefined) updateData.batchNo = dto.batchNo;

    return this.prisma.vmaInventoryTransaction.update({
      where: { id: txnId },
      data: updateData,
    });
  }

  // ====================================
  // Delete a single case item
  // Cannot modify if case status is COMPLETED
  // ====================================
  async deleteCaseItem(caseId: string, txnId: string) {
    const c = await this.prisma.vmaClinicalCase.findUnique({ where: { caseId } });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    if (c.status === 'COMPLETED') throw new BadRequestException('Cannot modify a completed case');

    const txn = await this.prisma.vmaInventoryTransaction.findUnique({ where: { id: txnId } });
    if (!txn || txn.caseId !== caseId) throw new NotFoundException(`Transaction not found in case "${caseId}"`);

    return this.prisma.vmaInventoryTransaction.delete({ where: { id: txnId } });
  }

  // ====================================
  // Add new item to existing case
  // ====================================
  async addCaseItem(
    caseId: string,
    dto: { productType: string; specNo: string; serialNo: string; qty: number; expDate?: string; batchNo?: string },
  ) {
    const c = await this.prisma.vmaClinicalCase.findUnique({ where: { caseId } });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    if (c.status === 'COMPLETED') throw new BadRequestException('Cannot modify a completed case');

    return this.prisma.vmaInventoryTransaction.create({
      data: {
        date: c.caseDate,
        action: 'OUT_CASE',
        productType: dto.productType as VmaProductType,
        specNo: dto.specNo,
        serialNo: dto.serialNo,
        qty: dto.qty,
        expDate: dto.expDate ? parsePacificDate(dto.expDate) : null,
        batchNo: dto.batchNo || null,
        caseId,
      },
    });
  }

  // ====================================
  // Complete Case — close out all items
  // ====================================
  async completeCase(
    caseId: string,
    dto: {
      items: Array<{
        txnId: string;
        returned: boolean;
        accepted?: boolean;  // true = All OK, false = has issues → demo
        returnCondition?: number[];  // indices of failed conditional items
      }>;
    },
  ) {
    const c = await this.prisma.vmaClinicalCase.findUnique({
      where: { caseId },
      include: { transactions: true },
    });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    if (c.status === 'COMPLETED') throw new BadRequestException('Case is already completed');

    // Validate all txnIds belong to this case
    const caseTxnIds = new Set(c.transactions.map(t => t.id));
    for (const item of dto.items) {
      if (!caseTxnIds.has(item.txnId)) {
        throw new BadRequestException(`Transaction "${item.txnId}" does not belong to this case`);
      }
    }

    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      for (const item of dto.items) {
        const origTxn = c.transactions.find(t => t.id === item.txnId);
        if (!origTxn) continue;

        if (!item.returned) {
          // Product was USED — consumed, not returning
          await tx.vmaInventoryTransaction.create({
            data: {
              date: now,
              action: 'USED_CASE',
              productType: origTxn.productType,
              specNo: origTxn.specNo,
              serialNo: origTxn.serialNo,
              qty: origTxn.qty,
              expDate: origTxn.expDate,
              batchNo: origTxn.batchNo,
              caseId,
              notes: 'COMPLETION_AUTO|USED',
            },
          });
        } else {
          // Product is being RETURNED
          const accepted = item.accepted !== false; // default true
          const condArr = item.returnCondition?.length ? item.returnCondition : [];

          // REC_CASE: return to inventory
          await tx.vmaInventoryTransaction.create({
            data: {
              date: now,
              action: 'REC_CASE',
              productType: origTxn.productType,
              specNo: origTxn.specNo,
              serialNo: origTxn.serialNo,
              qty: origTxn.qty,
              expDate: origTxn.expDate,
              batchNo: origTxn.batchNo,
              caseId,
              inspection: accepted ? 'ACCEPT' : 'REJECT',
              condition: condArr,
              notes: `COMPLETION_AUTO|REC`,
            },
          });

          if (!accepted) {
            // MOVE_DEMO: product has issues, move to demo/sample (can't be used clinically)
            await tx.vmaInventoryTransaction.create({
              data: {
                date: now,
                action: 'MOVE_DEMO',
                productType: origTxn.productType,
                specNo: origTxn.specNo,
                serialNo: origTxn.serialNo,
                qty: origTxn.qty,
                expDate: origTxn.expDate,
                batchNo: origTxn.batchNo,
                caseId,
                inspection: 'REJECT',
                condition: condArr,
                notes: `COMPLETION_AUTO|DEMO`,
              },
            });
          }
        }
      }

      // Update case status to COMPLETED
      await tx.vmaClinicalCase.update({
        where: { caseId },
        data: { status: 'COMPLETED' },
      });
    });

    return { success: true, caseId, status: 'COMPLETED' };
  }

  // ====================================
  // Reverse Completion — undo all completion transactions
  // ====================================
  async reverseCompletion(caseId: string) {
    const c = await this.prisma.vmaClinicalCase.findUnique({ where: { caseId } });
    if (!c) throw new NotFoundException(`Case "${caseId}" not found`);
    if (c.status !== 'COMPLETED') throw new BadRequestException('Case is not completed');

    await this.prisma.$transaction(async (tx) => {
      // Delete all COMPLETION_AUTO transactions for this case
      await tx.vmaInventoryTransaction.deleteMany({
        where: {
          caseId,
          notes: { startsWith: 'COMPLETION_AUTO' },
        },
      });

      // Revert case status to IN_PROGRESS
      await tx.vmaClinicalCase.update({
        where: { caseId },
        data: { status: 'IN_PROGRESS' },
      });
    });

    return { success: true, caseId, status: 'IN_PROGRESS' };
  }
}
