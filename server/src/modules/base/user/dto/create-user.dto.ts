import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  username: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  nickname?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  status?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  departmentId?: number;

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  roleIds?: number[];

  @ApiPropertyOptional({ type: [Number] })
  @IsOptional()
  @IsArray()
  @Type(() => Number)
  @IsInt({ each: true })
  positionIds?: number[];
}
