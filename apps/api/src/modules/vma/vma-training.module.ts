import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma';
import { LoggingModule } from '../../common/logging/logging.module';
import { AuthModule } from '../auth';
import { TrainingSopController } from './training-sop.controller';
import { TrainingSopService } from './training-sop.service';
import { TrainingRecordController } from './training-record.controller';
import { TrainingRecordService } from './training-record.service';
import { SmartFillService } from './smart-fill.service';
import { PdfGeneratorService } from './pdf-generator.service';

@Module({
  imports: [PrismaModule, AuthModule, LoggingModule],
  controllers: [TrainingSopController, TrainingRecordController],
  providers: [TrainingSopService, TrainingRecordService, SmartFillService, PdfGeneratorService],
  exports: [TrainingSopService, TrainingRecordService, SmartFillService, PdfGeneratorService],
})
export class VmaTrainingModule {}
