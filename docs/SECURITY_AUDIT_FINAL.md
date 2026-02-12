# MGMT ERP V2 - 公网部署安全审计报告

> **审计日期:** 2026-02-06  
> **审计目标:** 公网暴露前的全面安全评估  
> **威胁模型:** 外部攻击者 (黑客、DDoS、自动化扫描、APT)  
> **防御原则:** 纵深防御 (Defense in Depth) - 不依赖单一防护层  
> **最终评分:** 🔴 **72/100 (需完成关键修复后才能公网部署)**

---

## 0. 修复阶段总览

### 完整安全加固共分 **4 个阶段**

| 阶段 | 名称 | 目标 | 预计时间 | 优先级 |
|:---:|:---|:---|:---:|:---:|
| **Phase 1** | 应用层加固 | 代码级安全修复，无需外部依赖 | **2-3 小时** | 🔴 CRITICAL |
| **Phase 2** | 认证强化 | 暴力破解防护、账户锁定、IP 黑名单 | **3-4 小时** | 🔴 HIGH |
| **Phase 3** | 基础设施防护 | Nginx 配置、TLS、系统级限流 | **2-3 小时** | 🟡 MEDIUM |
| **Phase 4** | 监控告警 | 入侵检测、异常告警、自动响应 | **2-3 小时** | 🟡 MEDIUM |

**总计: 9-13 小时** (分阶段执行，每阶段可独立部署)

---

## 1. Phase 1: 应用层加固 (无需外部依赖)

> **目标:** 即使没有 Cloudflare/Nginx，应用本身也能抵御常见攻击

### 1.1 修复清单

| # | 问题 | 文件位置 | 修复方案 | 时间 |
|:---:|:---|:---|:---|:---:|
| **1.1** | JWT 默认密钥 | `jwt.strategy.ts:13` | 移除默认值，启动时强制检查 | 10分钟 |
| **1.2** | Cookie 安全属性 | `LoginModal.tsx:69` | 添加 `Secure; SameSite=Strict` | 10分钟 |
| **1.3** | Helmet 中间件 | `main.ts` | HTTP 安全头 (防点击劫持/XSS) | 15分钟 |
| **1.4** | 全局请求限流 | `app.module.ts` | `@nestjs/throttler` 全局配置 | 30分钟 |
| **1.5** | 认证端点强限流 | `auth.controller.ts` | 登录 5次/分，安保验证 3次/5分 | 20分钟 |
| **1.6** | API URL 环境变量 | `LoginModal.tsx:54` | 移除硬编码 `localhost:3001` | 15分钟 |
| **1.7** | 请求体大小限制 | `main.ts` | 限制 JSON 大小防 DoS | 10分钟 |
| **1.8** | 超时配置 | `main.ts` | 请求超时 30 秒 | 10分钟 |

**Phase 1 总计: ~2 小时**

---

### 1.2 详细代码实现

#### 1.1 移除 JWT 默认密钥 (🔴 CRITICAL)

```typescript
// apps/api/src/modules/auth/strategies/jwt.strategy.ts

import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { JwtPayload } from '@mgmt/shared';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);
  
  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');
    
    // 🔒 强制要求配置 JWT_SECRET - 无默认值
    if (!jwtSecret || jwtSecret.length < 32) {
      const errorMsg = 
        'FATAL: JWT_SECRET is missing or too short (min 32 chars)!\n' +
        'Generate a secure secret with: openssl rand -base64 64';
      throw new Error(errorMsg);
    }
    
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
    
    this.logger.log('JWT Strategy initialized with secure secret');
  }

  async validate(payload: JwtPayload) {
    return {
      userId: payload.sub,
      username: payload.username,
      roles: payload.roles,
      permissions: payload.permissions,
    };
  }
}
```

---

#### 1.3 Helmet + 请求限制 (main.ts 完整配置)

```typescript
// apps/api/src/main.ts

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TraceIdMiddleware } from './common/middleware/trace-id.middleware';
import { AccessLogInterceptor } from './common/logging';
import helmet from 'helmet';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  // ================================
  // 🔒 安全配置 (第一优先级)
  // ================================
  
  // 1. Helmet - HTTP 安全头
  app.use(helmet({
    // 防止点击劫持
    frameguard: { action: 'deny' },
    // 防止 MIME 嗅探
    noSniff: true,
    // XSS 过滤
    xssFilter: true,
    // 隐藏 X-Powered-By
    hidePoweredBy: true,
    // HSTS (仅 HTTPS)
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // CSP 策略
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    // 防止 DNS 预解析泄露
    dnsPrefetchControl: { allow: false },
    // 期望 CT
    expectCt: {
      enforce: true,
      maxAge: 86400,
    },
    // Referrer 策略
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  // 2. 请求体大小限制 (防止 DoS)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // 3. 请求超时 (防止慢速攻击)
  app.use((req, res, next) => {
    req.setTimeout(30000); // 30秒超时
    res.setTimeout(30000);
    next();
  });

  // ================================
  // CORS 配置
  // ================================
  const allowedOrigins = process.env.CORS_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:3002',
  ];
  
  app.enableCors({
    origin: (origin, callback) => {
      // 允许无 origin 的请求 (如 Postman) 仅在开发环境
      if (!origin && process.env.NODE_ENV !== 'production') {
        return callback(null, true);
      }
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      callback(new Error('CORS policy violation'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id', 'X-Security-Code'],
    maxAge: 86400, // 24小时预检缓存
  });

  // ================================
  // 其他配置
  // ================================
  
  // API 前缀
  app.setGlobalPrefix(process.env.API_PREFIX || '/api/v1');

  // 全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // 全局异常过滤器
  app.useGlobalFilters(app.get(AllExceptionsFilter));

  // 中间件
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));
  
  // 拦截器
  app.useGlobalInterceptors(app.get(AccessLogInterceptor));

  // 启动
  const port = process.env.PORT || 3001;
  await app.listen(port);
  
  Logger.log(`🚀 API Server running on port ${port}`, 'Bootstrap');
  Logger.log(`🔒 Security: Helmet enabled, body limit 1MB, timeout 30s`, 'Bootstrap');
}

bootstrap();
```

---

#### 1.4 & 1.5 全局 + 端点级限流

```typescript
// apps/api/src/app.module.ts

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
// ... 其他 imports

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env.v2', '../../.env'],
    }),
    
    // 🔒 全局限流配置 (多层策略)
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,    // 1秒
        limit: 5,     // 最多5次/秒 (防止快速扫描)
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
    
    // 数据库/缓存/日志
    PrismaModule,
    CacheModule,
    LoggingModule,
    
    // 业务模块
    AuthModule,
    UsersModule,
    RolesModule,
    LogsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
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
```

```typescript
// apps/api/src/modules/auth/auth.controller.ts

import { Throttle, SkipThrottle } from '@nestjs/throttler';
// ... 其他 imports

@Controller('auth')
export class AuthController {
  
  // 🔒 登录: 每分钟最多 5 次 (严格限制暴力破解)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Request() req: ExpressRequest) {
    // ... 现有逻辑
  }

  // 🔒 安全码验证: 每 5 分钟最多 3 次 (防止暴力猜测 L1-L4)
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @UseGuards(JwtAuthGuard)
  @Post('verify-security')
  @HttpCode(HttpStatus.OK)
  async verifySecurity(@Request() req, @Body() dto: VerifySecurityDto) {
    // ... 现有逻辑
  }

  // 🔒 刷新 Token: 每分钟最多 10 次
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    // ... 现有逻辑
  }

  // 获取用户信息: 使用全局限流即可
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Request() req) {
    // ... 现有逻辑
  }
}
```

---

## 2. Phase 2: 认证强化 (暴力破解纵深防御)

> **目标:** 即使攻击者绕过限流，仍有多层防护

### 2.1 修复清单

| # | 问题 | 修复方案 | 时间 |
|:---:|:---|:---|:---:|
| **2.1** | 登录失败锁定 | 5次失败后锁定账户15分钟 | 45分钟 |
| **2.2** | IP 黑名单 | 连续攻击 IP 自动封禁 | 45分钟 |
| **2.3** | 安全码失败计数 | L3/L4 验证失败累计触发告警 | 30分钟 |
| **2.4** | 密码复杂度 | 强制大小写+数字+特殊字符 | 20分钟 |
| **2.5** | 登录异常检测 | 异地登录、频繁切换设备告警 | 45分钟 |
| **2.6** | JWT 黑名单 | 支持即时吊销被盗 Token | 30分钟 |

**Phase 2 总计: ~3.5 小时**

---

### 2.2 账户锁定实现

```typescript
// apps/api/src/common/redis/cache.service.ts - 添加方法

// ================================
// 登录失败计数 (账户锁定)
// ================================

private readonly LOGIN_FAIL_PREFIX = 'login_fail:';
private readonly LOGIN_LOCK_PREFIX = 'login_lock:';
private readonly MAX_LOGIN_ATTEMPTS = 5;
private readonly LOCK_DURATION = 15 * 60; // 15分钟

/**
 * 记录登录失败
 * @returns 剩余尝试次数，如果返回 0 表示已锁定
 */
async recordLoginFailure(username: string): Promise<{ remainingAttempts: number; locked: boolean }> {
  const failKey = `${this.LOGIN_FAIL_PREFIX}${username}`;
  const lockKey = `${this.LOGIN_LOCK_PREFIX}${username}`;
  
  // 检查是否已锁定
  const isLocked = await this.get<boolean>(lockKey);
  if (isLocked) {
    return { remainingAttempts: 0, locked: true };
  }
  
  // 增加失败计数
  const failures = await this.client.incr(failKey);
  
  // 首次失败设置过期时间
  if (failures === 1) {
    await this.client.expire(failKey, this.LOCK_DURATION);
  }
  
  // 达到阈值则锁定
  if (failures >= this.MAX_LOGIN_ATTEMPTS) {
    await this.set(lockKey, true, this.LOCK_DURATION);
    return { remainingAttempts: 0, locked: true };
  }
  
  return { 
    remainingAttempts: this.MAX_LOGIN_ATTEMPTS - failures, 
    locked: false 
  };
}

/**
 * 检查账户是否锁定
 */
async isAccountLocked(username: string): Promise<boolean> {
  const lockKey = `${this.LOGIN_LOCK_PREFIX}${username}`;
  return (await this.get<boolean>(lockKey)) === true;
}

/**
 * 登录成功后清除失败计数
 */
async clearLoginFailures(username: string): Promise<void> {
  const failKey = `${this.LOGIN_FAIL_PREFIX}${username}`;
  await this.del(failKey);
}

/**
 * 获取锁定剩余时间
 */
async getLockRemainingTime(username: string): Promise<number> {
  const lockKey = `${this.LOGIN_LOCK_PREFIX}${username}`;
  return this.client.ttl(lockKey);
}
```

```typescript
// apps/api/src/modules/auth/auth.service.ts - 修改 login 方法

async login(dto: LoginDto): Promise<LoginResponse> {
  const { username, password } = dto;
  
  // 🔒 1. 检查账户是否被锁定
  const isLocked = await this.cacheService.isAccountLocked(username);
  if (isLocked) {
    const remainingTime = await this.cacheService.getLockRemainingTime(username);
    throw new ForbiddenException({
      code: 'ACCOUNT_LOCKED',
      message: `账户已锁定，请在 ${Math.ceil(remainingTime / 60)} 分钟后重试`,
      remainingSeconds: remainingTime,
    });
  }
  
  // 2. 验证用户
  const user = await this.validateUser(username, password);
  
  if (!user) {
    // 🔒 3. 记录失败并检查是否需要锁定
    const { remainingAttempts, locked } = await this.cacheService.recordLoginFailure(username);
    
    if (locked) {
      throw new ForbiddenException({
        code: 'ACCOUNT_LOCKED',
        message: '登录失败次数过多，账户已锁定 15 分钟',
        remainingSeconds: 15 * 60,
      });
    }
    
    throw new UnauthorizedException({
      code: 'INVALID_CREDENTIALS',
      message: `用户名或密码错误 (剩余 ${remainingAttempts} 次尝试)`,
      remainingAttempts,
    });
  }
  
  // 🔒 4. 登录成功，清除失败计数
  await this.cacheService.clearLoginFailures(username);
  
  // ... 现有的 token 生成逻辑
}
```

---

### 2.3 IP 黑名单实现

```typescript
// apps/api/src/common/guards/ip-blacklist.guard.ts (新文件)

import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { CacheService } from '../redis/cache.service';

@Injectable()
export class IpBlacklistGuard implements CanActivate {
  private readonly BLACKLIST_PREFIX = 'ip_blacklist:';
  private readonly ATTACK_COUNT_PREFIX = 'ip_attack:';
  private readonly MAX_ATTACKS = 10; // 10次异常行为
  private readonly BLACKLIST_DURATION = 60 * 60; // 封禁1小时
  
  constructor(private readonly cacheService: CacheService) {}
  
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const clientIp = this.extractClientIp(request);
    
    // 检查 IP 是否在黑名单
    const isBlacklisted = await this.cacheService.get<boolean>(`${this.BLACKLIST_PREFIX}${clientIp}`);
    
    if (isBlacklisted) {
      throw new ForbiddenException({
        code: 'IP_BLOCKED',
        message: 'Your IP has been temporarily blocked due to suspicious activity',
      });
    }
    
    return true;
  }
  
  /**
   * 记录可疑行为 (由其他 Guard/Filter 调用)
   */
  async recordSuspiciousActivity(ip: string): Promise<void> {
    const key = `${this.ATTACK_COUNT_PREFIX}${ip}`;
    const count = await this.cacheService.increment(key);
    
    if (count === 1) {
      await this.cacheService.expire(key, this.BLACKLIST_DURATION);
    }
    
    if (count >= this.MAX_ATTACKS) {
      await this.cacheService.set(`${this.BLACKLIST_PREFIX}${ip}`, true, this.BLACKLIST_DURATION);
    }
  }
  
  private extractClientIp(req: any): string {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }
}
```

---

## 3. Phase 3: 基础设施防护 (无 Cloudflare 版)

> **目标:** 在没有 CDN/WAF 的情况下，服务器本身也能抵御攻击

### 3.1 修复清单

| # | 问题 | 修复方案 | 时间 |
|:---:|:---|:---|:---:|
| **3.1** | Nginx 限流 | 连接数 + 请求速率限制 | 30分钟 |
| **3.2** | Nginx 安全头 | 备份 Helmet (双重防护) | 20分钟 |
| **3.3** | TLS 配置 | 仅允许 TLS 1.2+ | 30分钟 |
| **3.4** | 慢速攻击防护 | 超时 + 连接限制 | 20分钟 |
| **3.5** | 系统级防火墙 | iptables/ufw 规则 | 30分钟 |
| **3.6** | Fail2Ban | 自动封禁恶意 IP | 30分钟 |

**Phase 3 总计: ~2.5 小时**

---

### 3.2 Nginx 完整安全配置 (无 Cloudflare)

```nginx
# /etc/nginx/nginx.conf

user nginx;
worker_processes auto;
worker_rlimit_nofile 65535;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    # ================================
    # 隐藏版本信息
    # ================================
    server_tokens off;
    more_clear_headers Server;
    more_clear_headers X-Powered-By;
    
    # ================================
    # 连接限制 (防 DDoS)
    # ================================
    
    # 限制每个 IP 的连接数
    limit_conn_zone $binary_remote_addr zone=conn_per_ip:10m;
    limit_conn conn_per_ip 20;  # 每IP最多20个并发连接
    
    # 请求速率限制 (全局)
    limit_req_zone $binary_remote_addr zone=req_global:10m rate=30r/s;
    
    # 登录端点专用限制
    limit_req_zone $binary_remote_addr zone=req_login:10m rate=5r/m;
    
    # API 端点限制
    limit_req_zone $binary_remote_addr zone=req_api:10m rate=100r/m;
    
    # ================================
    # 超时配置 (防慢速攻击)
    # ================================
    client_body_timeout 10s;
    client_header_timeout 10s;
    keepalive_timeout 30s;
    send_timeout 10s;
    
    # 请求体大小限制
    client_max_body_size 10m;
    
    # 请求缓冲区限制
    client_body_buffer_size 128k;
    client_header_buffer_size 1k;
    large_client_header_buffers 4 16k;
    
    # ================================
    # SSL/TLS 配置
    # ================================
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_timeout 1d;
    ssl_session_cache shared:SSL:50m;
    ssl_session_tickets off;
    
    # OCSP Stapling
    ssl_stapling on;
    ssl_stapling_verify on;
    resolver 8.8.8.8 8.8.4.4 valid=300s;
    resolver_timeout 5s;
    
    # ================================
    # 安全头 (备份 Helmet)
    # ================================
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none';" always;
    add_header Permissions-Policy "geolocation=(), microphone=(), camera=()" always;
    
    # ================================
    # 恶意请求过滤
    # ================================
    
    # 阻止常见扫描器
    if ($http_user_agent ~* (sqlmap|nikto|nmap|masscan|zgrab|curl|wget)) {
        return 444;
    }
    
    # 阻止空 User-Agent
    if ($http_user_agent = "") {
        return 444;
    }
    
    # 阻止可疑请求方法
    if ($request_method !~ ^(GET|POST|PUT|PATCH|DELETE|OPTIONS)$) {
        return 405;
    }

    include /etc/nginx/conf.d/*.conf;
}
```

```nginx
# /etc/nginx/conf.d/mgmt.conf

upstream api_backend {
    server 127.0.0.1:3001;
    keepalive 64;
}

upstream web_backend {
    server 127.0.0.1:3000;
    keepalive 64;
}

# HTTP -> HTTPS 重定向
server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    # SSL 证书
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    
    # ================================
    # 登录端点 (严格限流)
    # ================================
    location /api/v1/auth/login {
        limit_req zone=req_login burst=3 nodelay;
        limit_req_status 429;
        
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    location /api/v1/auth/verify-security {
        limit_req zone=req_login burst=2 nodelay;
        limit_req_status 429;
        
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # ================================
    # API 端点 (标准限流)
    # ================================
    location /api/ {
        limit_req zone=req_api burst=50 nodelay;
        limit_req_status 429;
        
        proxy_pass http://api_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 超时配置
        proxy_connect_timeout 30s;
        proxy_send_timeout 30s;
        proxy_read_timeout 30s;
    }
    
    # ================================
    # 前端
    # ================================
    location / {
        limit_req zone=req_global burst=100 nodelay;
        
        proxy_pass http://web_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    
    # ================================
    # 阻止敏感路径
    # ================================
    location ~ /\. {
        deny all;
    }
    
    location ~ /(\.env|\.git|\.svn|\.htaccess) {
        deny all;
    }
}
```

---

### 3.3 Fail2Ban 配置

```ini
# /etc/fail2ban/jail.local

[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

# 封禁 SSH 暴力破解
[sshd]
enabled = true
port = ssh
filter = sshd
logpath = /var/log/auth.log

# 封禁 Nginx 状态码 444 (被拒绝的请求)
[nginx-badbots]
enabled = true
port = http,https
filter = nginx-badbots
logpath = /var/log/nginx/access.log
maxretry = 3
bantime = 86400

# 封禁登录失败
[mgmt-login]
enabled = true
port = http,https
filter = mgmt-login
logpath = /var/log/nginx/access.log
maxretry = 5
bantime = 900
```

```ini
# /etc/fail2ban/filter.d/mgmt-login.conf

[Definition]
failregex = ^<HOST>.*"POST /api/v1/auth/login.*" 401
            ^<HOST>.*"POST /api/v1/auth/verify-security.*" 403
ignoreregex =
```

---

## 4. Phase 4: 监控告警 (入侵检测)

> **目标:** 实时检测异常并自动响应

### 4.1 修复清单

| # | 功能 | 实现方案 | 时间 |
|:---:|:---|:---|:---:|
| **4.1** | 登录异常告警 | 异地登录、频繁失败通知 | 45分钟 |
| **4.2** | API 滥用检测 | 异常流量模式识别 | 45分钟 |
| **4.3** | 安全码使用监控 | L3/L4 使用实时告警 | 30分钟 |
| **4.4** | 自动 IP 封禁 | 攻击检测 → 自动加入黑名单 | 30分钟 |
| **4.5** | 日志聚合告警 | 错误激增自动通知 | 30分钟 |

**Phase 4 总计: ~3 小时**

---

## 5. 防御层次总结 (纵深防御)

```
Layer 1: Cloudflare (可选，但建议)
    ├── DDoS 吸收
    ├── Bot 识别
    └── WAF 规则

Layer 2: Nginx (必须)
    ├── TLS 终止
    ├── 连接数限制 (20/IP)
    ├── 请求速率限制 (30/s)
    ├── 慢速攻击防护
    └── 恶意 UA 过滤

Layer 3: Fail2Ban (必须)
    ├── SSH 暴力破解封禁
    └── HTTP 攻击封禁

Layer 4: 应用层 (NestJS) (必须)
    ├── Helmet 安全头
    ├── @Throttle 限流
    ├── 账户锁定
    ├── IP 黑名单
    └── JWT 强验证

Layer 5: 业务层 (必须)
    ├── L1-L4 安保协议
    ├── 单设备登录
    └── 审计日志

Layer 6: 数据层 (必须)
    ├── 密码 bcrypt 哈希
    ├── PII 自动脱敏
    └── 敏感字段加密
```

---

## 6. 实施顺序建议

```
┌─────────────────────────────────────────────────────────────────┐
│ Day 1: Phase 1 (应用层加固)                              2-3小时 │
│   ├── P0-1: JWT 密钥修复                                        │
│   ├── P0-2: Cookie 安全                                         │
│   ├── P0-3: Helmet                                              │
│   ├── P0-4: 全局限流                                            │
│   ├── P0-5: 认证限流                                            │
│   └── P0-6: API URL 环境变量                                    │
├─────────────────────────────────────────────────────────────────┤
│ Day 2: Phase 2 (认证强化)                                3-4小时 │
│   ├── 账户锁定机制                                              │
│   ├── IP 黑名单                                                 │
│   └── 密码复杂度                                                │
├─────────────────────────────────────────────────────────────────┤
│ Day 3: Phase 3 (基础设施)                                2-3小时 │
│   ├── Nginx 安全配置                                            │
│   ├── TLS 配置                                                  │
│   └── Fail2Ban 配置                                             │
├─────────────────────────────────────────────────────────────────┤
│ Day 4: Phase 4 (监控告警)                                2-3小时 │
│   ├── 登录异常告警                                              │
│   └── 自动封禁逻辑                                              │
├─────────────────────────────────────────────────────────────────┤
│ Week 2: Cloudflare 配置 (可选增强)                              │
│   ├── CDN 分发                                                  │
│   ├── WAF 规则                                                  │
│   └── DDoS L7 防护                                              │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. 无 Cloudflare 下的最低防护标准

| 防护层 | 必须实现 | 推荐实现 |
|:---|:---:|:---:|
| TLS 1.2+ | ✅ | - |
| Nginx 限流 | ✅ | - |
| Fail2Ban | ✅ | - |
| 应用限流 (@Throttle) | ✅ | - |
| 账户锁定 | ✅ | - |
| IP 黑名单 | ✅ | - |
| Helmet 安全头 | ✅ | - |
| WAF 规则 | - | ✅ (ModSecurity) |
| 异常告警 | - | ✅ |
| 自动响应 | - | ✅ |

---

**签署:**  
*企业安全审计组 - 公网部署安全评估*  
*2026-02-06*
