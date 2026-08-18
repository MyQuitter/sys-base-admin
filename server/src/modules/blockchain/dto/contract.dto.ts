import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class QueryContractDto {
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
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

export class CreateContractDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  chainId: number;

  @ApiProperty()
  @IsString()
  @MaxLength(42)
  address: string;

  @ApiProperty()
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ enum: ['erc20', 'erc721', 'generic'] })
  @IsOptional()
  @IsIn(['erc20', 'erc721', 'generic'])
  contractType?: 'erc20' | 'erc721' | 'generic';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  abi?: string;

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

export class UpdateContractDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ enum: ['erc20', 'erc721', 'generic'] })
  @IsOptional()
  @IsIn(['erc20', 'erc721', 'generic'])
  contractType?: 'erc20' | 'erc721' | 'generic';

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  abi?: string;

  @ApiPropertyOptional()
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

export class SyncContractTxDto {
  @ApiPropertyOptional({ description: '起始区块，不填则从上次同步位置继续' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  startBlock?: number;

  @ApiPropertyOptional({ description: '是否全量重扫（忽略上次同步游标）' })
  @IsOptional()
  @IsBoolean()
  reset?: boolean;
}
