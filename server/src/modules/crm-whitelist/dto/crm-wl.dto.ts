import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { PaginationQuery } from '../../../common/utils/pagination';

const ADDR = /^0x[a-fA-F0-9]{40}$/;

export class UpdateCrmWlConfigDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chainId: number;

  @ApiProperty()
  @IsString()
  @Matches(ADDR, { message: 'tokenAddress 格式无效' })
  tokenAddress: string;

  @ApiProperty()
  @IsString()
  @Matches(ADDR, { message: 'businessAddress 格式无效' })
  businessAddress: string;

  @ApiPropertyOptional({ enum: ['modular', 'legacy'], default: 'modular' })
  @IsOptional()
  @IsIn(['modular', 'legacy'])
  tokenAbiKey?: string;

  @ApiPropertyOptional({ description: '交易白名单扫描起始块' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  traderStartBlock?: string;

  @ApiPropertyOptional({ description: '节点白名单扫描起始块' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  nodeStartBlock?: string;

  @ApiPropertyOptional({ description: '团队关系扫描起始块' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  relationStartBlock?: string;
}

export class QueryCrmWlListDto implements PaginationQuery {
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
  @MaxLength(64)
  address?: string;
}

export class LookupAddressDto {
  @ApiProperty()
  @IsString()
  @Matches(ADDR, { message: 'address 格式无效' })
  address: string;
}

export class ImportCrmWlTxDto {
  @ApiProperty({ enum: ['trader', 'node'] })
  @IsIn(['trader', 'node'])
  kind: 'trader' | 'node';

  @ApiProperty({ description: 'MetaMask 提交后的交易哈希' })
  @IsString()
  @Matches(/^0x[a-fA-F0-9]{64}$/, { message: 'txHash 格式无效' })
  txHash: string;
}

export class QueryCrmTeamListDto extends QueryCrmWlListDto {
  @ApiPropertyOptional({ description: '推荐人地址' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  inviterAddress?: string;

  @ApiPropertyOptional({ description: '是否刷新当前页链上业绩（默认仅读库）' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  refreshMetrics?: boolean;
}
