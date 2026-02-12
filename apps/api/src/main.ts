// 🕐 设置服务器时区为美国西海岸 Pacific Time
process.env.TZ = 'America/Los_Angeles';

import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters';
import { LogWriterService } from './common/logging';
import { TraceIdMiddleware } from './common/middleware';
import { AccessLogInterceptor } from './common/interceptors';
import helmet from 'helmet';
import * as express from 'express';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn', 'debug'],
  });

  const logger = new Logger('Bootstrap');

  // ================================
  // 🔒 安全配置 (第一优先级)
  // ================================

  // 1. Helmet - HTTP 安全头 (防点击劫持/XSS/MIME嗅探等)
  app.use(helmet({
    // 防止点击劫持
    frameguard: { action: 'deny' },
    // 防止 MIME 嗅探
    xContentTypeOptions: true,
    // 隐藏 X-Powered-By
    hidePoweredBy: true,
    // HSTS (仅 HTTPS 生效)
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
        connectSrc: ["'self'", "http://localhost:*", "https://localhost:*"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
    // 防止 DNS 预解析泄露
    dnsPrefetchControl: { allow: false },
    // Referrer 策略
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // X-XSS-Protection (旧浏览器)
    xssFilter: true,
  }));
  logger.log('🔒 Helmet security headers enabled');

  // 2. 请求体大小限制 (防止 DoS)
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  logger.log('🔒 Request body limit: 1MB');

  // 3. 请求超时 (防止慢速攻击)
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    req.setTimeout(30000); // 30秒超时
    res.setTimeout(30000);
    next();
  });
  logger.log('🔒 Request timeout: 30s');

  // ================================
  // CORS 配置 (本地开发)
  // ================================
  app.enableCors({
    origin: true, // 本地开发允许所有来源
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Trace-Id', 'X-Security-Code'],
    exposedHeaders: ['X-Trace-Id'],
  });
  logger.log('🔒 CORS enabled (local dev mode)');

  // ================================
  // 获取服务实例
  // ================================
  const logWriter = app.get(LogWriterService);

  // 注册全局 TraceId 中间件 (为每个请求生成 traceId)
  app.use(new TraceIdMiddleware().use.bind(new TraceIdMiddleware()));

  // 注册全局 Access Log 拦截器 (记录访问日志)
  app.useGlobalInterceptors(new AccessLogInterceptor(logWriter));

  // 注册全局异常过滤器 (记录错误日志)
  app.useGlobalFilters(new AllExceptionsFilter(logWriter));

  // 注册全局验证管道
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    transform: true,
    forbidNonWhitelisted: true,
    transformOptions: { enableImplicitConversion: true },
  }));

  // ================================
  // API 版本控制 (API-6)
  // ================================
  app.setGlobalPrefix('api/v1');

  // ================================
  // 启动服务器
  // ================================
  const port = process.env.PORT ?? 3001;
  await app.listen(port);

  logger.log(`🚀 API Server running on port ${port}`);
  logger.log(`📋 Logging System V2 enabled with trace support`);
  logger.log(`🔒 Security: Helmet + Throttler + ValidationPipe active`);
}

bootstrap();
