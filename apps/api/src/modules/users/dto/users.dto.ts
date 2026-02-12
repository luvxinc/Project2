/**
 * Users DTO - 用户数据传输对象
 * 
 * ⚠️ 安全码字段说明:
 * SecurityLevelGuard 从 request.body 读取 sec_code_lX 进行安全验证。
 * 由于 ValidationPipe 配置了 forbidNonWhitelisted: true，
 * 所有通过 Body 传递安全码的 DTO 必须声明这些可选字段，
 * 否则会触发 "property sec_code_lX should not exist" 错误。
 */
import {
  IsString,
  IsEmail,
  IsOptional,
  IsArray,
  IsObject,
  MinLength,
  MaxLength,
  Matches,
  IsEnum,
  IsBoolean,
} from 'class-validator';

/**
 * 安全码字段 Mixin
 * 用于所有需要 SecurityLevelGuard 验证的 DTO
 * Guard 在 ValidationPipe 之前执行，已从 body 提取这些值
 */
class SecurityCodeFields {
  @IsOptional()
  @IsString()
  sec_code_l0?: string;

  @IsOptional()
  @IsString()
  sec_code_l1?: string;

  @IsOptional()
  @IsString()
  sec_code_l2?: string;

  @IsOptional()
  @IsString()
  sec_code_l3?: string;

  @IsOptional()
  @IsString()
  sec_code_l4?: string;
}

/**
 * 创建用户 DTO
 * 安全等级: L2
 */
export class CreateUserDto extends SecurityCodeFields {
  @IsString()
  @MinLength(3, { message: '用户名至少3个字符' })
  @MaxLength(50, { message: '用户名最多50个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名只能包含字母、数字和下划线' })
  username: string;

  @IsEmail({}, { message: '邮箱格式不正确' })
  email: string;

  @IsString()
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(100, { message: '密码最多100个字符' })
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];

  @IsOptional()
  @IsObject()
  permissions?: Record<string, any>;
}

/**
 * 更新用户 DTO
 * 安全等级: L2
 */
export class UpdateUserDto extends SecurityCodeFields {
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_]+$/)
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  displayName?: string;
}

/**
 * 更新权限 DTO
 * 安全等级: L2
 */
export class UpdatePermissionsDto extends SecurityCodeFields {
  @IsObject()
  permissions: Record<string, any>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  roles?: string[];
}

/**
 * 重置密码 DTO (管理员重置他人密码)
 * 安全等级: L2
 */
export class ResetPasswordDto extends SecurityCodeFields {
  @IsString()
  @MinLength(8, { message: '密码至少8个字符' })
  @MaxLength(100, { message: '密码最多100个字符' })
  newPassword: string;
}

/**
 * 修改自己密码 DTO (需验证旧密码)
 * 无需安全码 (仅需 JWT 认证)
 */
export class ChangeOwnPasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(8, { message: '新密码至少8个字符' })
  @MaxLength(100, { message: '新密码最多100个字符' })
  newPassword: string;

  @IsString()
  confirmPassword: string;
}

/**
 * 删除用户 DTO (需要原因)
 * 安全等级: L3
 */
export class DeleteUserDto extends SecurityCodeFields {
  @IsString()
  @MinLength(1, { message: '请输入删除原因' })
  @MaxLength(500, { message: '删除原因最多500个字符' })
  reason: string;
}

/**
 * 用户列表查询参数
 * 无需安全码 (Query 参数, 非 Body)
 */
export class UserQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  limit?: number;

  @IsOptional()
  @IsString()
  search?: string;
}
