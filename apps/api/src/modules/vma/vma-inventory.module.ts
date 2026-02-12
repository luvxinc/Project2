import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma';
import { LoggingModule } from '../../common/logging/logging.module';
import { AuthModule } from '../auth';
import { InventoryTransactionController } from './inventory-transaction.controller';
import { InventoryTransactionService } from './inventory-transaction.service';
import { PValveProductController } from './pvalve-product.controller';
import { PValveProductService } from './pvalve-product.service';
import { ReceivingInspectionPdfService } from './receiving-inspection-pdf.service';

@Module({
  imports: [PrismaModule, AuthModule, LoggingModule],
  controllers: [InventoryTransactionController, PValveProductController],
  providers: [InventoryTransactionService, PValveProductService, ReceivingInspectionPdfService],
  exports: [InventoryTransactionService, PValveProductService, ReceivingInspectionPdfService],
})
export class VmaInventoryModule {}
