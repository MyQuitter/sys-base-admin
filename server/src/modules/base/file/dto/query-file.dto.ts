import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { PaginationQuery } from '../../../../common/utils/pagination';

export class QueryFileDto implements PaginationQuery {
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

  @ApiPropertyOptional({ description: '原始文件名模糊搜索' })
  @IsOptional()
  @IsString()
  filename?: string;

  @ApiPropertyOptional({ description: 'MIME 类型' })
  @IsOptional()
  @IsString()
  mimeType?: string;

  @ApiPropertyOptional({ description: '上传人 userId' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  userId?: number;

  @ApiPropertyOptional({ description: '上传时间起（ISO）' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ description: '上传时间止（ISO）' })
  @IsOptional()
  @IsDateString()
  endTime?: string;
}
