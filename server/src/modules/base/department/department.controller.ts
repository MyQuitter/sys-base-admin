import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { DepartmentService } from './department.service';

/**
 * 部门管理 HTTP 接口。
 */
@ApiTags('部门管理')
@Controller('departments')
export class DepartmentController {
  constructor(private readonly departmentService: DepartmentService) {}

  @Get('tree')
  @RequirePermissions('department:list')
  @ApiOperation({ summary: '获取部门树' })
  getTree() {
    return this.departmentService.getTree();
  }

  @Get()
  @RequirePermissions('department:list')
  @ApiOperation({ summary: '查询部门列表' })
  findAll() {
    return this.departmentService.findAll();
  }

  @Get(':id')
  @RequirePermissions('department:list')
  @ApiOperation({ summary: '查询部门详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.findOne(id);
  }

  @Post()
  @RequirePermissions('department:create')
  @ApiOperation({ summary: '创建部门' })
  create(@Body() dto: CreateDepartmentDto) {
    return this.departmentService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('department:update')
  @ApiOperation({ summary: '更新部门' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    return this.departmentService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('department:delete')
  @ApiOperation({ summary: '删除部门' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.departmentService.remove(id);
  }
}
