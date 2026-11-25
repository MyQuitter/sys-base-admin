import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  @Matches(/^[a-zA-Z0-9_@.-]{2,50}$/, { message: '用户名格式无效' })
  username: string;

  @ApiProperty({ example: 'Admin@123' })
  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  password: string;

  @ApiProperty({ description: '验证码 ID（GET /auth/captcha 返回）' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  captchaId?: string;

  @ApiProperty({ description: '图形验证码' })
  @IsOptional()
  @IsString()
  @MaxLength(8)
  captchaCode?: string;
}
