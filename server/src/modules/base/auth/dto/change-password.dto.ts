import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

/** 当前用户修改自己的密码 */
export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  oldPassword: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  newPassword: string;
}
