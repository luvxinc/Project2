/**
 * Products Module - 产品管理模块
 *
 * 功能:
 * - COGS 维护 (查询/批量更新)
 * - 新增 SKU (创建产品 + 初始化库存)
 * - 条形码生成 (PDF 下载)
 */
import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { BarcodeService } from './barcode.service';
import { PrismaModule } from '../../common/prisma';
import { AuthModule } from '../auth';
import { LoggingModule } from '../../common/logging/logging.module';
import { CacheModule } from '../../common/redis';

@Module({
  imports: [PrismaModule, AuthModule, LoggingModule, CacheModule],
  controllers: [ProductsController],
  providers: [ProductsService, BarcodeService],
  exports: [ProductsService, BarcodeService],
})
export class ProductsModule {}

