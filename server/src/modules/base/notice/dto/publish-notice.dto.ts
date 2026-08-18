import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional } from 'class-validator';

export class PublishNoticeDto {
  @ApiPropertyOptional({ default: 'all' })
  @IsOptional()
  @IsIn(['all', 'user', 'dept', 'role'])
  targetType?: string;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  targetIds?: number[];
}
