import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class MemberRegisterDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Matches(/^1[3-9]\d{9}$/, { message: '手机号格式无效' })
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail({}, { message: '邮箱格式无效' })
  @MaxLength(100)
  email?: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '密码须包含大小写字母和数字',
  })
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;
}

export class MemberLoginDto {
  @ApiProperty({ description: '手机号或邮箱' })
  @IsString()
  @MaxLength(100)
  account: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;
}

export class MemberUpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  avatar?: string;
}

export class MemberChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  oldPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '密码须包含大小写字母和数字',
  })
  newPassword: string;
}
