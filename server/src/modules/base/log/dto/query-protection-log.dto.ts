import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class QueryProtectionLogDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string;

  @ApiPropertyOptional({ enum: ['auth', 'wallet'] })
  @IsOptional()
  @IsIn(['auth', 'wallet'])
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  errorCode?: string;

  @ApiPropertyOptional({ enum: ['info', 'warn', 'high'] })
  @IsOptional()
  @IsIn(['info', 'warn', 'high'])
  severity?: string;
}
