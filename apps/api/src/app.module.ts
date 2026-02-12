import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './common/prisma';
import { CacheModule } from './common/redis';
import { LoggingModule } from './common/logging';
import { AlertModule } from './common/alert';
import { IpBlacklistGuard } from './common/guards';
import { AuthModule, JwtAuthGuard } from './modules/auth';
import { UsersModule } from './modules/users';
import { RolesModule } from './modules/roles';
import { LogsModule } from './modules/logs/logs.module';
import { ProductsModule } from './modules/products';
import { VmaModule } from './modules/vma';


@Module({
  imports: [
    // 配置模块 - 加载环境变量
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.v2', '../../.env'],
    }),

    // 🔒 全局限流配置 (多层策略)
    // 即使没有 Nginx/Cloudflare，应用层也能抵御暴力破解
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,    // 1秒
        limit: 10,    // 最多10次/秒 (防止快速扫描)
      },
      {
        name: 'medium',
        ttl: 10000,   // 10秒
        limit: 50,    // 最多50次/10秒
      },
      {
        name: 'long',
        ttl: 60000,   // 1分钟
        limit: 200,   // 最多200次/分钟
      },
    ]),

    // 数据库模块
    PrismaModule,

    // 缓存模块 (Redis)
    CacheModule,

    // 日志模块 (全局)
    LoggingModule,

    // 🔔 告警模块 (全局)
    AlertModule,

    // 业务模块
    AuthModule,
    UsersModule,
    RolesModule,
    LogsModule,
    ProductsModule,
    VmaModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // 🔒 全局 IP 黑名单守卫 (第一道防线)
    {
      provide: APP_GUARD,
      useClass: IpBlacklistGuard,
    },
    // 全局 JWT 守卫
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    // 🔒 全局限流守卫
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
