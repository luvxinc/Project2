/**
 * VMA Training SOP Service - 两表架构
 *
 * 主表 (VmaTrainingSop): SOP文档身份, status 控制整个文件启用/弃用
 * 版本表 (VmaTrainingSopVersion): 每次版本更新一条记录, trainingRequired 标记是否需要培训
 *
 * 培训逻辑: 员工入职时间 → 找 effectiveDate >= 入职日的所有版本 → 需要培训
 */
import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma';
import { CreateTrainingSopDto, UpdateTrainingSopDto, AddSopVersionDto } from './dto';
import { parsePacificDate } from './vma-shared.util';

@Injectable()
export class TrainingSopService {
  private readonly logger = new Logger(TrainingSopService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取所有SOP (含版本历史, 按编号排序)
   */
  async findAll() {
    const sops = await this.prisma.vmaTrainingSop.findMany({
      orderBy: { seqNo: 'asc' },
      include: {
        versions: {
          orderBy: { effectiveDate: 'desc' },
        },
      },
    });

    // 扁平化返回: 主文档信息 + 最新版本 + 所有版本列表
    return sops.map((sop: any) => {
      const latest = sop.versions[0]; // newest (sorted desc)
      return {
        id: sop.id,
        seqNo: sop.seqNo,
        sopNo: sop.sopNo,
        name: sop.name,
        description: sop.description,
        structureClassification: sop.structureClassification,
        documentType: sop.documentType,
        status: sop.status,
        // 最新版本信息 (向后兼容, 前端直接用)
        version: latest?.version || '',
        daNo: latest?.daNo || '',
        effectiveDate: latest?.effectiveDate || sop.createdAt,
        trainingRequired: latest?.trainingRequired ?? true,
        // 版本历史
        versions: sop.versions.map((v: any) => ({
          id: v.id,
          version: v.version,
          daNo: v.daNo,
          effectiveDate: v.effectiveDate,
          trainingRequired: v.trainingRequired,
        })),
        createdAt: sop.createdAt,
        updatedAt: sop.updatedAt,
      };
    });
  }

  /**
   * 获取单个SOP (含版本)
   */
  async findOne(id: string) {
    const sop = await this.prisma.vmaTrainingSop.findUnique({
      where: { id },
      include: {
        versions: { orderBy: { effectiveDate: 'desc' } },
      },
    });
    if (!sop) {
      throw new NotFoundException(`Training SOP ${id} not found`);
    }
    return sop;
  }

  /**
   * 创建SOP + 初始版本
   */
  async create(dto: CreateTrainingSopDto) {
    // 检查 sopNo 唯一性
    const existing = await this.prisma.vmaTrainingSop.findUnique({
      where: { sopNo: dto.sopNo },
    });
    if (existing) {
      throw new ConflictException(`SOP ${dto.sopNo} already exists`);
    }

    return this.prisma.vmaTrainingSop.create({
      data: {
        seqNo: dto.seqNo,
        sopNo: dto.sopNo,
        name: dto.name,
        description: dto.description || null,
        structureClassification: dto.structureClassification,
        documentType: dto.documentType,
        status: 'ACTIVE',
        versions: {
          create: {
            version: dto.version,
            daNo: dto.daNo,
            effectiveDate: new Date(
              dto.effectiveDate.length === 10
                ? parsePacificDate(dto.effectiveDate)
                : dto.effectiveDate,
            ),
            trainingRequired: dto.trainingRequired !== false,
          },
        },
      },
      include: { versions: true },
    });
  }

  /**
   * 更新SOP主文档信息 + 最新版本信息
   */
  async update(id: string, dto: UpdateTrainingSopDto) {
    const sop = await this.findOne(id);

    const data: any = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.structureClassification !== undefined) data.structureClassification = dto.structureClassification;
    if (dto.documentType !== undefined) data.documentType = dto.documentType;

    await this.prisma.vmaTrainingSop.update({
      where: { id },
      data,
    });

    // 更新最新版本的字段
    if (dto.version !== undefined || dto.daNo !== undefined || dto.effectiveDate !== undefined || dto.trainingRequired !== undefined) {
      const latestVersion = sop.versions[0];
      if (latestVersion) {
        const vData: any = {};
        if (dto.version !== undefined) vData.version = dto.version;
        if (dto.daNo !== undefined) vData.daNo = dto.daNo;
        if (dto.effectiveDate !== undefined) vData.effectiveDate = new Date(
          dto.effectiveDate.length === 10
            ? parsePacificDate(dto.effectiveDate)
            : dto.effectiveDate,
        );
        if (dto.trainingRequired !== undefined) vData.trainingRequired = dto.trainingRequired;

        await this.prisma.vmaTrainingSopVersion.update({
          where: { id: latestVersion.id },
          data: vData,
        });
      }
    }

    return this.findOne(id);
  }

  /**
   * 添加新版本 (版本更新时 INSERT 到版本表)
   */
  async addVersion(sopId: string, dto: AddSopVersionDto) {
    const sop = await this.findOne(sopId);

    // 检查版本号是否已存在
    const existing = await this.prisma.vmaTrainingSopVersion.findUnique({
      where: { sopId_version: { sopId, version: dto.version } },
    });
    if (existing) {
      throw new ConflictException(`Version ${dto.version} already exists for SOP ${sop.sopNo}`);
    }

    return this.prisma.vmaTrainingSopVersion.create({
      data: {
        sopId,
        version: dto.version,
        daNo: dto.daNo,
        effectiveDate: new Date(
          dto.effectiveDate.length === 10
            ? parsePacificDate(dto.effectiveDate)
            : dto.effectiveDate,
        ),
        trainingRequired: dto.trainingRequired !== false,
      },
    });
  }

  /**
   * 切换SOP状态 (ACTIVE/DEPRECATED — 整个文件)
   */
  async toggleStatus(id: string) {
    const sop = await this.prisma.vmaTrainingSop.findUnique({ where: { id } });
    if (!sop) throw new NotFoundException(`Training SOP ${id} not found`);

    const newStatus = sop.status === 'ACTIVE' ? 'DEPRECATED' : 'ACTIVE';
    return this.prisma.vmaTrainingSop.update({
      where: { id },
      data: { status: newStatus },
      include: { versions: { orderBy: { effectiveDate: 'desc' } } },
    });
  }

  /**
   * 获取下一个可用的 seqNo
   */
  async getNextSeqNo(): Promise<number> {
    const max = await this.prisma.vmaTrainingSop.aggregate({
      _max: { seqNo: true },
    });
    return (max._max.seqNo || 0) + 1;
  }
}
