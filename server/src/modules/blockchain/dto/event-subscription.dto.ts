import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class QueryEventSubscriptionDto {
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
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contractId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  chainId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

export class CreateEventSubscriptionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  contractId: number;

  @ApiProperty({ description: 'ABI 中的事件名，如 Transfer' })
  @IsString()
  @MaxLength(100)
  eventName: string;

  @ApiPropertyOptional({ description: '起始区块，不填则从当前最新块开始' })
  @IsOptional()
  @IsString()
  fromBlock?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class UpdateEventSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fromBlock?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}

export class QueryEventLogDto {
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
  pageSize?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  subscriptionId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contractId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  chainId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  eventName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  txHash?: string;
}
