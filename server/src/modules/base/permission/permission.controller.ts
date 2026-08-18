import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PermissionService } from './permission.service';

/**
 * 权限点管理 HTTP 接口。
 */
@ApiTags('权限管理')
@Controller('permissions')
export class PermissionController {
  constructor(private readonly permissionService: PermissionService) {}

  @Get()
  @RequirePermissions('permission:list')
  @ApiOperation({ summary: '查询权限列表' })
  findAll() {
    return this.permissionService.findAll();
  }

  @Post()
  @RequirePermissions('permission:create')
  @ApiOperation({ summary: '创建权限' })
  create(@Body() dto: CreatePermissionDto) {
    return this.permissionService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('permission:update')
  @ApiOperation({ summary: '更新权限' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePermissionDto) {
    return this.permissionService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('permission:delete')
  @ApiOperation({ summary: '删除权限' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.permissionService.remove(id);
  }
}
