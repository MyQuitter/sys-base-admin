import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDictDataDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  typeId: number;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  label: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  value: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sort?: number;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}
