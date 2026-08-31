import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt } from 'class-validator';

export class AssignMenusDto {
  @ApiProperty({ type: [Number], description: '菜单 ID 列表；空数组表示该角色不展示任何侧栏菜单' })
  @IsArray()
  @ArrayMinSize(0)
  @Type(() => Number)
  @IsInt({ each: true })
  menuIds: number[];
}
