import { Module, Global, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService, ConfigModule } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis 连接令牌
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * 🔒 Redis 缓存模块
 * 
 * 职责：
 * - 会话管理 (sess:{userId})
 * - 权限缓存 (perm:{userId})
 * - Refresh Token 映射 (rt:{token})
 * - 分布式锁 (lock:{resource})
 * - 限流器 (rl:{ip}:{action})
 * 
 * TTL 策略：
 * - SESSION: 6小时
 * - PERMISSIONS: 5分钟
 * - RATE_LIMIT: 1分钟
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: (configService: ConfigService): Redis => {
        const host = configService.get<string>('REDIS_HOST') || 'localhost';
        const port = parseInt(configService.get<string>('REDIS_PORT') || '6379', 10);
        const password = configService.get<string>('REDIS_PASSWORD');
        const db = parseInt(configService.get<string>('REDIS_DB') || '0', 10);

        const logger = new Logger('RedisModule');

        const redis = new Redis({
          host,
          port,
          password: password || undefined,
          db,
          // 连接名称，用于日志
          connectionName: 'mgmt-v2',
          // 重连策略
          retryStrategy: (times: number) => {
            if (times > 10) {
              logger.error('Max retries reached, stopping...');
              return null; // 停止重试
            }
            const delay = Math.min(times * 100, 3000);
            logger.warn(`Reconnecting in ${delay}ms... (attempt ${times})`);
            return delay;
          },
          // 连接超时
          connectTimeout: 10000,
          // 启用离线队列（连接断开时缓存命令）
          enableOfflineQueue: true,
        });

        // 事件监听
        redis.on('connect', () => {
          logger.log(`Connected to Redis at ${host}:${port}`);
        });

        redis.on('error', (err) => {
          logger.error(`Redis error: ${err.message}`);
        });

        redis.on('close', () => {
          logger.warn('Redis connection closed');
        });

        return redis;
      },
      inject: [ConfigService],
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor() {}

  async onModuleDestroy() {
    // Redis 连接清理在服务层处理
    this.logger.log('Redis module destroyed');
  }
}
