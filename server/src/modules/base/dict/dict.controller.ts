import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateDictDataDto } from './dto/create-dict-data.dto';
import { CreateDictTypeDto } from './dto/create-dict-type.dto';
import { QueryDictDataDto } from './dto/query-dict-data.dto';
import { UpdateDictDataDto } from './dto/update-dict-data.dto';
import { UpdateDictTypeDto } from './dto/update-dict-type.dto';
import { DictService } from './dict.service';

@ApiTags('字典管理')
@Controller('dict')
export class DictController {
  constructor(private readonly dictService: DictService) {}

  @Get('types')
  @RequirePermissions('dict:list')
  @ApiOperation({ summary: '查询字典类型列表' })
  findAllTypes() {
    return this.dictService.findAllTypes();
  }

  @Post('types')
  @RequirePermissions('dict:create')
  @ApiOperation({ summary: '创建字典类型' })
  createType(@Body() dto: CreateDictTypeDto) {
    return this.dictService.createType(dto);
  }

  @Put('types/:id')
  @RequirePermissions('dict:update')
  @ApiOperation({ summary: '更新字典类型' })
  updateType(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDictTypeDto) {
    return this.dictService.updateType(id, dto);
  }

  @Delete('types/:id')
  @RequirePermissions('dict:delete')
  @ApiOperation({ summary: '删除字典类型' })
  removeType(@Param('id', ParseIntPipe) id: number) {
    return this.dictService.removeType(id);
  }

  @Get('data')
  @RequirePermissions('dict:list')
  @ApiOperation({ summary: '查询字典数据列表' })
  findAllData(@Query() query: QueryDictDataDto) {
    return this.dictService.findAllData(query);
  }

  @Post('data')
  @RequirePermissions('dict:create')
  @ApiOperation({ summary: '创建字典数据' })
  createData(@Body() dto: CreateDictDataDto) {
    return this.dictService.createData(dto);
  }

  @Put('data/:id')
  @RequirePermissions('dict:update')
  @ApiOperation({ summary: '更新字典数据' })
  updateData(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDictDataDto) {
    return this.dictService.updateData(id, dto);
  }

  @Delete('data/:id')
  @RequirePermissions('dict:delete')
  @ApiOperation({ summary: '删除字典数据' })
  removeData(@Param('id', ParseIntPipe) id: number) {
    return this.dictService.removeData(id);
  }
}
