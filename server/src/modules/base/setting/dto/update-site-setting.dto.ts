import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import type { LoginMode } from '../site-setting.types';

export class UpdateSiteSettingDto {
  @ApiPropertyOptional({ description: '系统名称' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  siteName?: string;

  @ApiPropertyOptional({ description: '系统副标题' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  siteSubtitle?: string;

  @ApiPropertyOptional({ description: '登录方式', enum: ['password', 'wallet', 'both'] })
  @IsOptional()
  @IsIn(['password', 'wallet', 'both'])
  loginMode?: LoginMode;

  @ApiPropertyOptional({ description: '钱包登录链 ID' })
  @IsOptional()
  @IsInt()
  walletChainId?: number;
}
