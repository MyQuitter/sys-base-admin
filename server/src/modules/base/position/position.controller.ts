import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreatePositionDto } from './dto/create-position.dto';
import { QueryPositionDto } from './dto/query-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { PositionService } from './position.service';

@ApiTags('岗位管理')
@Controller('positions')
export class PositionController {
  constructor(private readonly positionService: PositionService) {}

  @Get()
  @RequirePermissions('position:list')
  @ApiOperation({ summary: '分页查询岗位' })
  findAll(@Query() query: QueryPositionDto) {
    return this.positionService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('position:list')
  @ApiOperation({ summary: '查询岗位详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.positionService.findOne(id);
  }

  @Post()
  @RequirePermissions('position:create')
  @ApiOperation({ summary: '创建岗位' })
  create(@Body() dto: CreatePositionDto) {
    return this.positionService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('position:update')
  @ApiOperation({ summary: '更新岗位' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdatePositionDto) {
    return this.positionService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('position:delete')
  @ApiOperation({ summary: '删除岗位' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.positionService.remove(id);
  }
}
