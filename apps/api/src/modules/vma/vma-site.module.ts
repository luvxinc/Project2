import { Module } from '@nestjs/common';
import { PrismaModule } from '../../common/prisma';
import { LoggingModule } from '../../common/logging/logging.module';
import { AuthModule } from '../auth';
import { SiteController } from './site.controller';
import { SiteService } from './site.service';

@Module({
  imports: [PrismaModule, AuthModule, LoggingModule],
  controllers: [SiteController],
  providers: [SiteService],
  exports: [SiteService],
})
export class VmaSiteModule {}
