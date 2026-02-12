import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * 告警类型定义
 */
export type AlertType = 
  | 'SECURITY_L3_USED'      // L3 安全码使用
  | 'SECURITY_L4_USED'      // L4 安全码使用
  | 'LOGIN_ANOMALY'         // 登录异常
  | 'ACCOUNT_LOCKED'        // 账户锁定
  | 'IP_BLOCKED'            // IP 封禁
  | 'BRUTE_FORCE_DETECTED'  // 暴力破解检测
  | 'HIGH_ERROR_RATE'       // 高错误率
  | 'SECURITY_CODE_BLOCKED' // 安全码验证被阻止
  | 'SYSTEM_ERROR';         // 系统错误

/**
 * 告警级别
 */
export type AlertLevel = 'INFO' | 'WARNING' | 'CRITICAL';

/**
 * 告警数据
 */
export interface AlertData {
  type: AlertType;
  level?: AlertLevel;
  title?: string;
  message: string;
  details?: Record<string, unknown>;
  userId?: string;
  username?: string;
  ipAddress?: string;
  timestamp?: Date;
}

/**
 * 🔔 告警服务
 * 
 * 发送安全告警邮件
 * 支持: SMTP / Gmail / SendGrid
 */
@Injectable()
export class AlertService implements OnModuleInit {
  private readonly logger = new Logger(AlertService.name);
  private transporter: Transporter | null = null;
  private readonly alertEmail: string;
  private readonly fromEmail: string;
  private readonly enabled: boolean;

  // 告警节流 (防止邮件轰炸)
  private alertThrottleMap = new Map<string, number>();
  private readonly THROTTLE_DURATION = 5 * 60 * 1000; // 5分钟内同类告警只发一次

  constructor(private readonly configService: ConfigService) {
    this.alertEmail = this.configService.get<string>('ALERT_EMAIL') || 'luvx.inc@gmail.com';
    this.fromEmail = this.configService.get<string>('SMTP_FROM') || 'noreply@mgmt.local';
    this.enabled = this.configService.get<string>('SMTP_HOST') !== undefined;
  }

  async onModuleInit() {
    await this.initTransporter();
  }

  /**
   * 初始化邮件传输器
   */
  private async initTransporter() {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT') || 587;
    const user = this.configService.get<string>('SMTP_USER');
    const pass = this.configService.get<string>('SMTP_PASS');

    if (!host || !user || !pass) {
      this.logger.warn('⚠️ SMTP not configured - email alerts disabled');
      this.logger.warn('Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env.v2 to enable');
      return;
    }

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure: port === 465, // true for 465, false for other ports
        auth: { user, pass },
      });

      // 验证连接
      await this.transporter.verify();
      this.logger.log(`✅ SMTP connected: ${host}:${port}`);
      this.logger.log(`📧 Alert emails will be sent to: ${this.alertEmail}`);
    } catch (error) {
      this.logger.error('❌ SMTP connection failed:', error);
      this.transporter = null;
    }
  }

  /**
   * 发送告警
   */
  async sendAlert(data: AlertData): Promise<boolean> {
    const {
      type,
      level = this.getDefaultLevel(type),
      title = this.getDefaultTitle(type),
      message,
      details = {},
      userId,
      username,
      ipAddress,
      timestamp = new Date(),
    } = data;

    // 节流检查
    const throttleKey = `${type}:${username || ipAddress || 'global'}`;
    const lastAlert = this.alertThrottleMap.get(throttleKey);
    if (lastAlert && Date.now() - lastAlert < this.THROTTLE_DURATION) {
      this.logger.debug(`Throttled alert: ${throttleKey}`);
      return false;
    }
    this.alertThrottleMap.set(throttleKey, Date.now());

    // 记录到日志
    this.logger.warn(`🔔 ALERT [${level}] ${type}: ${message}`);

    // 发送邮件
    if (this.transporter) {
      try {
        await this.transporter.sendMail({
          from: `"MGMT Security" <${this.fromEmail}>`,
          to: this.alertEmail,
          subject: `[${level}] ${title}`,
          html: this.buildEmailHtml({
            type,
            level,
            title,
            message,
            details,
            userId,
            username,
            ipAddress,
            timestamp,
          }),
        });
        this.logger.log(`📧 Alert email sent: ${type}`);
        return true;
      } catch (error) {
        this.logger.error('Failed to send alert email:', error);
        return false;
      }
    }

    return false;
  }

  /**
   * Shortcut: L3 security code usage alert
   */
  async alertSecurityL3Used(username: string, action: string, ipAddress?: string): Promise<void> {
    await this.sendAlert({
      type: 'SECURITY_L3_USED',
      level: 'WARNING',
      message: `User ${username} used L3 database-level security code`,
      details: { action, username },
      username,
      ipAddress,
    });
  }

  /**
   * Shortcut: L4 security code usage alert
   */
  async alertSecurityL4Used(username: string, action: string, ipAddress?: string): Promise<void> {
    await this.sendAlert({
      type: 'SECURITY_L4_USED',
      level: 'CRITICAL',
      message: `User ${username} used L4 system-level security code`,
      details: { action, username },
      username,
      ipAddress,
    });
  }

  /**
   * Shortcut: Account locked alert
   */
  async alertAccountLocked(username: string, reason: string, ipAddress?: string): Promise<void> {
    await this.sendAlert({
      type: 'ACCOUNT_LOCKED',
      level: 'WARNING',
      message: `Account ${username} has been locked: ${reason}`,
      details: { reason },
      username,
      ipAddress,
    });
  }

  /**
   * Shortcut: IP blocked alert
   */
  async alertIpBlocked(ipAddress: string, reason: string): Promise<void> {
    await this.sendAlert({
      type: 'IP_BLOCKED',
      level: 'WARNING',
      message: `IP ${ipAddress} has been blocked: ${reason}`,
      details: { reason },
      ipAddress,
    });
  }

  /**
   * Shortcut: Brute force detected alert
   */
  async alertBruteForceDetected(target: string, attempts: number, ipAddress?: string): Promise<void> {
    await this.sendAlert({
      type: 'BRUTE_FORCE_DETECTED',
      level: 'CRITICAL',
      message: `Brute force attack detected against ${target} (${attempts} attempts)`,
      details: { target, attempts },
      ipAddress,
    });
  }

  /**
   * Shortcut: Login anomaly alert
   */
  async alertLoginAnomaly(username: string, reason: string, details?: Record<string, unknown>): Promise<void> {
    await this.sendAlert({
      type: 'LOGIN_ANOMALY',
      level: 'WARNING',
      message: `User ${username} login anomaly detected: ${reason}`,
      details: { ...details, reason },
      username,
    });
  }

  /**
   * Shortcut: Security code verification blocked alert
   */
  async alertSecurityCodeBlocked(username: string, level: string, ipAddress?: string): Promise<void> {
    await this.sendAlert({
      type: 'SECURITY_CODE_BLOCKED',
      level: 'WARNING',
      message: `User ${username}'s ${level} security verification blocked due to too many failures`,
      details: { securityLevel: level },
      username,
      ipAddress,
    });
  }

  /**
   * 获取默认告警级别
   */
  private getDefaultLevel(type: AlertType): AlertLevel {
    const levelMap: Record<AlertType, AlertLevel> = {
      SECURITY_L3_USED: 'WARNING',
      SECURITY_L4_USED: 'CRITICAL',
      LOGIN_ANOMALY: 'WARNING',
      ACCOUNT_LOCKED: 'WARNING',
      IP_BLOCKED: 'WARNING',
      BRUTE_FORCE_DETECTED: 'CRITICAL',
      HIGH_ERROR_RATE: 'CRITICAL',
      SECURITY_CODE_BLOCKED: 'WARNING',
      SYSTEM_ERROR: 'CRITICAL',
    };
    return levelMap[type] || 'WARNING';
  }

  /**
   * Get default title (English)
   */
  private getDefaultTitle(type: AlertType): string {
    const titleMap: Record<AlertType, string> = {
      SECURITY_L3_USED: 'L3 Security Code Used',
      SECURITY_L4_USED: '⚠️ L4 System-Level Security Code Used',
      LOGIN_ANOMALY: 'Login Anomaly Detected',
      ACCOUNT_LOCKED: 'Account Locked',
      IP_BLOCKED: 'IP Blocked',
      BRUTE_FORCE_DETECTED: '⚠️ Brute Force Attack',
      HIGH_ERROR_RATE: '⚠️ High Error Rate',
      SECURITY_CODE_BLOCKED: 'Security Code Verification Blocked',
      SYSTEM_ERROR: 'System Error',
    };
    return titleMap[type] || 'MGMT Security Alert';
  }

  /**
   * Build email HTML (English)
   */
  private buildEmailHtml(data: AlertData & { title: string; level: AlertLevel }): string {
    const levelColors: Record<AlertLevel, string> = {
      INFO: '#3b82f6',
      WARNING: '#f59e0b',
      CRITICAL: '#ef4444',
    };

    const color = levelColors[data.level];
    const timestamp = data.timestamp?.toISOString() || new Date().toISOString();

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background: ${color}; color: white; padding: 20px; text-align: center;">
      <h1 style="margin: 0; font-size: 20px;">${data.title}</h1>
      <p style="margin: 8px 0 0; opacity: 0.9; font-size: 14px;">${data.level} Alert</p>
    </div>
    
    <!-- Body -->
    <div style="padding: 24px;">
      <p style="font-size: 16px; line-height: 1.6; color: #333; margin: 0 0 20px;">
        ${data.message}
      </p>
      
      <!-- Details -->
      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Type</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;"><code>${data.type}</code></td>
          </tr>
          ${data.username ? `
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">User</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${data.username}</td>
          </tr>
          ` : ''}
          ${data.ipAddress ? `
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">IP Address</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${data.ipAddress}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 8px 0; color: #666; font-size: 14px;">Time</td>
            <td style="padding: 8px 0; color: #333; font-size: 14px; text-align: right;">${timestamp}</td>
          </tr>
        </table>
      </div>
      
      ${Object.keys(data.details || {}).length > 0 ? `
      <!-- Additional Details -->
      <div style="background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; padding: 12px; font-size: 13px; color: #856404;">
        <strong>Details:</strong>
        <pre style="margin: 8px 0 0; white-space: pre-wrap; word-break: break-all;">${JSON.stringify(data.details, null, 2)}</pre>
      </div>
      ` : ''}
    </div>
    
    <!-- Footer -->
    <div style="background: #f8f9fa; padding: 16px; text-align: center; font-size: 12px; color: #666;">
      <p style="margin: 0;">MGMT ERP V2 Security Alert System</p>
      <p style="margin: 4px 0 0;">This is an automated message, please do not reply directly</p>
    </div>
  </div>
</body>
</html>
    `;
  }
}

