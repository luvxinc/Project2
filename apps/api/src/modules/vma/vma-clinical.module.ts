import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma';
import { LoggingModule } from '../../common/logging/logging.module';
import { AuthModule } from '../auth';
import { ClinicalCaseController } from './clinical-case.controller';
import { ClinicalCaseService } from './clinical-case.service';
import { PackingListPdfService } from './packing-list-pdf.service';

@Module({
  imports: [PrismaModule, AuthModule, LoggingModule],
  controllers: [ClinicalCaseController],
  providers: [ClinicalCaseService, PackingListPdfService],
  exports: [ClinicalCaseService, PackingListPdfService],
})
export class VmaClinicalModule {}
