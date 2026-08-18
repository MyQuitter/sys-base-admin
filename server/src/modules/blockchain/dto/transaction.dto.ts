import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, MaxLength, Min } from 'class-validator';

export class QueryTransactionDto {
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
  chainId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  txHash?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  bizRef?: string;
}

export class CreateTransactionDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  chainId: number;

  @ApiProperty()
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, { message: '交易哈希格式无效' })
  txHash: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  contractId?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bizRef?: string;
}
