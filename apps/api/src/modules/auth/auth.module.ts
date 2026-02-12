import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SecurityService } from './security.service';
import { SecurityPolicyService } from './security-policy.service';
import { JwtStrategy, LocalStrategy } from './strategies';
import { PrismaModule } from '../../common/prisma';
import { LoggingModule } from '../../common/logging/logging.module';

@Module({
  imports: [
    PrismaModule,
    LoggingModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET', 'default-secret-change-me'),
        signOptions: {
          expiresIn: '6h', // 6小时自动登出
          issuer: 'mgmt-v2',
          audience: 'mgmt-v2-users',
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SecurityService,
    SecurityPolicyService,
    JwtStrategy,
    LocalStrategy,
  ],
  exports: [AuthService, SecurityService, SecurityPolicyService],
})
export class AuthModule {}

