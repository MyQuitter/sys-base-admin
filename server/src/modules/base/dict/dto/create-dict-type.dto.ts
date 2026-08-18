import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDictTypeDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;
}
