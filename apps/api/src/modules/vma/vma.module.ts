import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma';
import { AuthModule } from '../auth';
import { CacheModule } from '../../common/redis';
import { VmaController } from './vma.controller';
import { VmaService } from './vma.service';

// Sub-modules (A-1: God Module split)
import { VmaEmployeesModule } from './vma-employees.module';
import { VmaTrainingModule } from './vma-training.module';
import { VmaInventoryModule } from './vma-inventory.module';
import { VmaClinicalModule } from './vma-clinical.module';
import { VmaSiteModule } from './vma-site.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    CacheModule,
    // Domain sub-modules
    VmaEmployeesModule,
    VmaTrainingModule,
    VmaInventoryModule,
    VmaClinicalModule,
    VmaSiteModule,
  ],
  controllers: [VmaController],
  providers: [VmaService],
  exports: [VmaService],
})
export class VmaModule {}
