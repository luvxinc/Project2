import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule } from './redis.module';

/**
 * 缓存服务模块
 * 提供高层缓存抽象，依赖 RedisModule 提供的 Redis 客户端
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
