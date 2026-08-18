import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreatePermissionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(50)
  code: string;

  @ApiProperty()
  @IsString()
  @MaxLength(50)
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  module?: string;
}
