import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryChainDto {
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
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}

export class CreateChainDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  chainId: number;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ default: 'ETH' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nativeSymbol?: string;

  @ApiProperty({ type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  rpcUrls: string[];

  @ApiPropertyOptional({ type: [String], description: 'WebSocket RPC，用于事件实时监听' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wssUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: '浏览器地址格式无效' })
  @MaxLength(500)
  explorerUrl?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  loginEnabled?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}

export class UpdateChainDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(20)
  nativeSymbol?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  rpcUrls?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  wssUrls?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({}, { message: '浏览器地址格式无效' })
  @MaxLength(500)
  explorerUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  loginEnabled?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;
}
