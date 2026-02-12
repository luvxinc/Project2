import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';

@Injectable()
export class SiteService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.vmaSite.findMany({
      orderBy: { siteId: 'asc' },
    });
  }

  async create(dto: { siteId: string; siteName: string; address: string; address2?: string; city: string; state: string; zipCode: string; country: string }) {
    // Check uniqueness
    const existing = await this.prisma.vmaSite.findUnique({ where: { siteId: dto.siteId } });
    if (existing) {
      throw new ConflictException(`Site ID "${dto.siteId}" already exists`);
    }
    return this.prisma.vmaSite.create({ data: dto });
  }

  async update(siteId: string, dto: { siteName?: string; address?: string; address2?: string; city?: string; state?: string; zipCode?: string; country?: string }) {
    const existing = await this.prisma.vmaSite.findUnique({ where: { siteId } });
    if (!existing) {
      throw new NotFoundException(`Site "${siteId}" not found`);
    }
    return this.prisma.vmaSite.update({
      where: { siteId },
      data: dto,
    });
  }
}
