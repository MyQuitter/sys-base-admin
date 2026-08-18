import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class AssignPermissionsDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @ArrayMinSize(0)
  @Type(() => Number)
  @IsInt({ each: true })
  permissionIds: number[];
}
