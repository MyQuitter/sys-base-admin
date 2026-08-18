import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoleDto {
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
  @MaxLength(200)
  description?: string;
}
