/**
 * Security Policy Service - 安全策略管理器
 * 
 * 功能:
 * 1. L0-L4 密码映射标准
 * 2. 动态配置加载 (action_registry.json)
 * 3. 运行时覆盖 (security_overrides.json)
 * 4. 智能热更新: 自动检测配置文件修改时间
 * 
 * 移植自: backend/core/services/security/policy_manager.py
 */
import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../common/prisma';

// Token 元数据
export interface TokenMeta {
  level: string;
  env: string | null;
  label: string;
  codeKey: string;
}

// Action 配置
export interface ActionConfig {
  key: string;
  name: string;
  description?: string;
  defaultSecurity?: string[];
}

@Injectable()
export class SecurityPolicyService implements OnModuleInit {
  private readonly logger = new Logger(SecurityPolicyService.name);
  
  // 缓存
  private registryCache: Map<string, ActionConfig> = new Map();
  private overridesCache: Map<string, string[]> = new Map();
  private lastOverridesMtime: number = 0;
  private isInitialized: boolean = false;

  // 配置文件路径
  private readonly dataDir: string;
  private readonly registryFile: string;
  private readonly overridesFile: string;

  // [核心] 令牌与环境变量的映射
  static readonly TOKEN_MAP: Record<string, TokenMeta> = {
    user: { level: 'L0', env: null, label: '当前用户密码', codeKey: 'sec_code_l0' },
    query: { level: 'L1', env: 'SEC_CODE_QUERY', label: '查询安保码 (L1)', codeKey: 'sec_code_l1' },
    modify: { level: 'L2', env: 'SEC_CODE_MODIFY', label: '修改安保码 (L2)', codeKey: 'sec_code_l2' },
    db: { level: 'L3', env: 'SEC_CODE_DB', label: '数据库管理码 (L3)', codeKey: 'sec_code_l3' },
    system: { level: 'L4', env: 'SEC_CODE_SYSTEM', label: '系统核弹码 (L4)', codeKey: 'sec_code_l4' },
  };

  // Level 到 Token 的映射
  static readonly LEVEL_TO_TOKEN: Record<string, string> = {
    L0: 'user',
    L1: 'query',
    L2: 'modify',
    L3: 'db',
    L4: 'system',
  };

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // 设置数据目录路径
    this.dataDir = path.resolve(__dirname, '../../../data');
    this.registryFile = path.join(this.dataDir, 'action_registry.json');
    this.overridesFile = path.join(this.dataDir, 'security_overrides.json');
  }

  async onModuleInit() {
    await this.loadRegistry();
    this.logger.log('SecurityPolicyService initialized');
  }

  /**
   * 重置缓存并强制重新加载
   */
  resetCache(): void {
    this.registryCache.clear();
    this.overridesCache.clear();
    this.lastOverridesMtime = 0;
    this.isInitialized = false;
    this.loadRegistry();
    this.logger.log('Security policy cache reset');
  }

  /**
   * 加载 action_registry.json
   */
  private loadRegistry(): void {
    if (this.isInitialized) return;

    try {
      if (!fs.existsSync(this.registryFile)) {
        this.logger.warn(`Registry file not found: ${this.registryFile}`);
        this.isInitialized = true;
        return;
      }

      const data = JSON.parse(fs.readFileSync(this.registryFile, 'utf-8'));
      
      // 扁平化解析所有 actions
      if (data.modules) {
        for (const mod of data.modules) {
          // 直接 tabs
          for (const tab of mod.tabs || []) {
            for (const action of tab.actions || []) {
              if (action.key) {
                this.registryCache.set(action.key, {
                  key: action.key,
                  name: action.name,
                  description: action.description,
                  defaultSecurity: action.default_security || [],
                });
              }
            }
          }
          // 嵌套 submodules
          for (const sub of mod.submodules || []) {
            for (const tab of sub.tabs || []) {
              for (const action of tab.actions || []) {
                if (action.key) {
                  this.registryCache.set(action.key, {
                    key: action.key,
                    name: action.name,
                    description: action.description,
                    defaultSecurity: action.default_security || [],
                  });
                }
              }
            }
          }
        }
      }

      this.isInitialized = true;
      this.logger.log(`Loaded ${this.registryCache.size} action definitions`);
    } catch (error) {
      this.logger.error(`Failed to load registry: ${error}`);
      this.isInitialized = true;
    }

    // 加载覆盖配置
    this.checkAndReloadOverrides();
  }

  /**
   * 检查并热重载 security_overrides.json
   */
  private checkAndReloadOverrides(): void {
    try {
      if (!fs.existsSync(this.overridesFile)) {
        this.overridesCache.clear();
        return;
      }

      const stats = fs.statSync(this.overridesFile);
      const currentMtime = stats.mtimeMs;

      // 如果文件未变更且缓存非空，跳过
      if (currentMtime <= this.lastOverridesMtime && this.overridesCache.size > 0) {
        return;
      }

      const data = JSON.parse(fs.readFileSync(this.overridesFile, 'utf-8'));
      this.overridesCache.clear();
      
      for (const [key, tokens] of Object.entries(data)) {
        if (Array.isArray(tokens)) {
          this.overridesCache.set(key, tokens as string[]);
        }
      }

      this.lastOverridesMtime = currentMtime;
      this.logger.log(`Reloaded security overrides (${this.overridesCache.size} rules)`);
    } catch (error) {
      this.logger.error(`Failed to reload overrides: ${error}`);
    }
  }

  /**
   * 获取某个 Action 需要的 Token 类型列表
   */
  getRequiredTokens(actionKey: string): string[] {
    // 每次调用前检查热更新
    this.checkAndReloadOverrides();

    // 1. 优先读取覆盖配置
    if (this.overridesCache.has(actionKey)) {
      return this.overridesCache.get(actionKey)!;
    }

    // 2. 读取默认配置
    const config = this.registryCache.get(actionKey);
    if (!config) return [];
    return config.defaultSecurity || [];
  }

  /**
   * 获取某个 Security Level 需要的 Tokens
   * 例如: L2 -> ['modify'] 或 ['user', 'modify'] 取决于配置
   */
  getTokensForLevel(level: string): string[] {
    const token = SecurityPolicyService.LEVEL_TO_TOKEN[level];
    return token ? [token] : [];
  }

  /**
   * 验证单个 Token
   * 优先从数据库读取（支持动态更新），回退到环境变量
   */
  async validateSingleToken(
    tokenType: string,
    inputValue: string,
    userId?: string,
  ): Promise<boolean> {
    if (!inputValue) return false;

    const normalizedType = tokenType.toLowerCase();
    const meta = SecurityPolicyService.TOKEN_MAP[normalizedType];
    if (!meta) return false;

    // L0: 用户密码验证
    if (normalizedType === 'user') {
      if (!userId) return false;
      
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { passwordHash: true },
      });
      
      if (!user) return false;
      return bcrypt.compare(inputValue, user.passwordHash);
    }

    // L1-L4: 优先从数据库验证（动态），回退到环境变量（静态）
    const level = meta.level;
    
    // 尝试从数据库获取安全码
    const securityCode = await this.prisma.securityCode.findFirst({
      where: { level, isActive: true },
      select: { codeHash: true },
    });

    if (securityCode?.codeHash) {
      // 数据库中存在安全码，使用 bcrypt 验证
      return bcrypt.compare(inputValue.trim(), securityCode.codeHash);
    }

    // 回退到环境变量（兼容模式）
    if (meta.env) {
      const correctCode = this.configService.get<string>(meta.env);
      if (correctCode) {
        this.logger.debug(`Using env fallback for ${level}`);
        return inputValue.trim() === correctCode.trim();
      }
    }

    return false;
  }

  /**
   * 验证 Action 请求
   * 主要验证入口
   */
  async verifyActionRequest(
    actionKey: string,
    requestData: Record<string, string>,
    userId?: string,
  ): Promise<{ valid: boolean; message: string }> {
    const requiredTokens = this.getRequiredTokens(actionKey);

    if (requiredTokens.length === 0) {
      return { valid: true, message: 'No security required' };
    }

    for (const token of requiredTokens) {
      const meta = SecurityPolicyService.TOKEN_MAP[token];
      if (!meta) continue;

      const inputValue = requestData[meta.codeKey] || '';
      
      if (!inputValue) {
        return { valid: false, message: `缺少验证码: ${meta.label}` };
      }

      const isValid = await this.validateSingleToken(token, inputValue, userId);
      if (!isValid) {
        return { valid: false, message: `验证失败: ${meta.label} 错误` };
      }
    }

    return { valid: true, message: 'Security Check Passed' };
  }

  /**
   * 验证 Security Level (简化版，用于 Guard)
   * 直接验证某个安全等级
   */
  async verifySecurityLevel(
    level: string,
    requestData: Record<string, string>,
    userId?: string,
  ): Promise<{ valid: boolean; message: string }> {
    const meta = this.getMetaForLevel(level);
    if (!meta) {
      return { valid: false, message: `Invalid security level: ${level}` };
    }

    const inputValue = requestData[meta.codeKey] || '';
    
    if (!inputValue) {
      return { valid: false, message: `缺少验证码: ${meta.label}` };
    }

    const isValid = await this.validateSingleToken(
      SecurityPolicyService.LEVEL_TO_TOKEN[level],
      inputValue,
      userId,
    );

    if (!isValid) {
      return { valid: false, message: `验证失败: ${meta.label} 错误` };
    }

    return { valid: true, message: 'Security Check Passed' };
  }

  /**
   * 获取某个 Level 的元数据
   */
  getMetaForLevel(level: string): TokenMeta | null {
    const token = SecurityPolicyService.LEVEL_TO_TOKEN[level];
    return token ? SecurityPolicyService.TOKEN_MAP[token] : null;
  }

  /**
   * 获取 Action 的完整信息
   */
  getActionInfo(actionKey: string): ActionConfig | null {
    return this.registryCache.get(actionKey) || null;
  }
}
