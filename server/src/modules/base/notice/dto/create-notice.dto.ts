import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateNoticeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(100)
  title: string;

  @ApiProperty()
  @IsString()
  content: string;

  @ApiPropertyOptional({ default: 'announcement' })
  @IsOptional()
  @IsIn(['announcement', 'notification'])
  noticeType?: string;

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

  @ApiPropertyOptional({ default: 'normal' })
  @IsOptional()
  @IsIn(['normal', 'important'])
  priority?: string;
}
