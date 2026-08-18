import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;
}
