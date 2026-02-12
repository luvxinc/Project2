/**
 * Roles Module - 职能角色管理模块
 */
import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PrismaModule } from '../../common/prisma';
import { CacheModule } from '../../common/redis';
import { SecurityPolicyService } from '../auth/security-policy.service';
import { LoggingModule } from '../../common/logging/logging.module';

@Module({
  imports: [PrismaModule, LoggingModule, CacheModule],
  controllers: [RolesController],
  providers: [RolesService, SecurityPolicyService],
  exports: [RolesService],
})
export class RolesModule {}



