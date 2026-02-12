/**
 * Users Module - 用户管理模块
 * 
 * 功能:
 * - 用户 CRUD (创建/读取/更新/删除)
 * - 权限管理
 * - 用户锁定/解锁
 * - 密码重置
 */
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaModule } from '../../common/prisma';
import { AuthModule } from '../auth';
import { LoggingModule } from '../../common/logging/logging.module';

@Module({
  imports: [PrismaModule, AuthModule, LoggingModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}


