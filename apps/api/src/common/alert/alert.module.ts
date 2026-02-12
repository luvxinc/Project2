import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AlertService } from './alert.service';

/**
 * 🔔 告警模块
 * 
 * 提供安全告警邮件服务
 * 全局模块，可在任何地方注入 AlertService
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [AlertService],
  exports: [AlertService],
})
export class AlertModule {}
