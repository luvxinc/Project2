import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// 手动加载 .env 文件
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const key in envConfig) {
    if (!process.env[key]) {
      process.env[key] = envConfig[key];
    }
  }
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    this.logger.log(`Database URL: ${databaseUrl?.replace(/:[^:@]+@/, ':***@')}`);
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected successfully');
    } catch (error) {
      this.logger.warn(`Database connection failed: ${error.message}`);
      if (process.env.NODE_ENV === 'production') {
        throw error;
      }
      this.logger.warn('Running in development mode without database connection');
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
    } catch (error) {
      this.logger.warn(`Database disconnect failed: ${error.message}`);
    }
  }
}

