import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { MenuService } from './menu.service';

/**
 * 菜单管理 HTTP 接口：`/tree` 按当前用户权限返回侧边栏数据。
 */
@ApiTags('菜单管理')
@Controller('menus')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get('tree')
  @ApiOperation({ summary: '获取当前用户可见菜单树' })
  getTree(@Req() req: { user?: { userId?: number; permissions?: string[] } }) {
    const permissions = req.user?.permissions ?? [];
    return this.menuService.getTreeForUser(permissions, req.user?.userId);
  }

  @Get()
  @RequirePermissions('menu:list')
  @ApiOperation({ summary: '查询菜单列表' })
  findAll() {
    return this.menuService.findAll();
  }

  @Post()
  @RequirePermissions('menu:create')
  @ApiOperation({ summary: '创建菜单' })
  create(@Body() dto: CreateMenuDto) {
    return this.menuService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('menu:update')
  @ApiOperation({ summary: '更新菜单' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMenuDto) {
    return this.menuService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('menu:delete')
  @ApiOperation({ summary: '删除菜单' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.menuService.remove(id);
  }
}
