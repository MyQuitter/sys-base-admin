import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class QueryMemberDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  nickname?: string;

  @ApiPropertyOptional({ description: '手机/邮箱/昵称模糊搜索' })
  @IsOptional()
  @IsString()
  keyword?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

export class CreateMemberDto {
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

  @ApiPropertyOptional()
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

export class UpdateMemberDto {
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

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

export class ResetMemberPasswordDto {
  @ApiPropertyOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(50)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
    message: '密码须包含大小写字母和数字',
  })
  password: string;
}
