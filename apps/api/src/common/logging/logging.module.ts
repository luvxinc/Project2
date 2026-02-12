import { Module, Global } from '@nestjs/common';
import { LogWriterService } from './log-writer.service';
import { LogContextHelper } from './log-context.helper';
import { PrismaModule } from '../prisma';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [LogWriterService, LogContextHelper],
  exports: [LogWriterService, LogContextHelper],
})
export class LoggingModule {}
