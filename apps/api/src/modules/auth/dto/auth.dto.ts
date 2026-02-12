import { IsString, IsNotEmpty, IsOptional, IsBoolean, MinLength } from 'class-validator';

/**
 * 登录请求 DTO
 * 
 * 注意: 登录时不做密码长度验证
 * 原因: 兼容历史密码（如 admin: 1522P = 5位）
 * 实际密码验证由 bcrypt.compare() 完成
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  password: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;
}

/**
 * 刷新 Token 请求 DTO
 */
export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh Token 不能为空' })
  refreshToken: string;
}

/**
 * 修改密码请求 DTO
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  currentPassword: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: '新密码至少 8 位' })
  newPassword: string;

  @IsString()
  @IsNotEmpty()
  confirmPassword: string;
}
