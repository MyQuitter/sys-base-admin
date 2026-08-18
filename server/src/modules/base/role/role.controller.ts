import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RoleService } from './role.service';

/**
 * 角色管理 HTTP 接口：含权限分配端点。
 */
@ApiTags('角色管理')
@Controller('roles')
export class RoleController {
  constructor(private readonly roleService: RoleService) {}

  @Get()
  @RequirePermissions('role:list')
  @ApiOperation({ summary: '查询角色列表' })
  findAll() {
    return this.roleService.findAll();
  }

  @Get(':id')
  @RequirePermissions('role:list')
  @ApiOperation({ summary: '查询角色详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.findOne(id);
  }

  @Post()
  @RequirePermissions('role:create')
  @ApiOperation({ summary: '创建角色' })
  create(@Body() dto: CreateRoleDto) {
    return this.roleService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('role:update')
  @ApiOperation({ summary: '更新角色' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) {
    return this.roleService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('role:delete')
  @ApiOperation({ summary: '删除角色' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.roleService.remove(id);
  }

  @Post(':id/permissions')
  @RequirePermissions('role:assign-permission')
  @ApiOperation({ summary: '为角色分配权限' })
  assignPermissions(@Param('id', ParseIntPipe) id: number, @Body() dto: AssignPermissionsDto) {
    return this.roleService.assignPermissions(id, dto);
  }
}
