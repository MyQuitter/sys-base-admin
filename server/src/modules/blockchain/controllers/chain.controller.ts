import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateChainDto, QueryChainDto, UpdateChainDto } from '../dto/chain.dto';
import { ChainService } from '../services/chain.service';

@ApiTags('区块链-链管理')
@Controller('blockchain/chains')
export class ChainController {
  constructor(private readonly chainService: ChainService) {}

  @Get()
  @RequirePermissions('chain:list')
  @ApiOperation({ summary: '分页查询链配置' })
  findAll(@Query() query: QueryChainDto) {
    return this.chainService.findAll(query);
  }

  @Public()
  @Get('enabled')
  @ApiOperation({ summary: '获取启用链列表（公开）' })
  findEnabled() {
    return this.chainService.findEnabled();
  }

  @Get('login-enabled')
  @RequirePermissions('chain:list')
  @ApiOperation({ summary: '获取可钱包登录链列表' })
  findLoginEnabled() {
    return this.chainService.findLoginEnabled();
  }

  @Get(':id')
  @RequirePermissions('chain:list')
  @ApiOperation({ summary: '查询链配置详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.chainService.findOne(id);
  }

  @Post()
  @RequirePermissions('chain:create')
  @ApiOperation({ summary: '创建链配置' })
  create(@Body() dto: CreateChainDto) {
    return this.chainService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('chain:update')
  @ApiOperation({ summary: '更新链配置' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateChainDto) {
    return this.chainService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('chain:delete')
  @ApiOperation({ summary: '删除链配置' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.chainService.remove(id);
  }

  @Post(':id/health')
  @RequirePermissions('chain:list')
  @ApiOperation({ summary: 'RPC 探活' })
  checkHealth(@Param('id', ParseIntPipe) id: number) {
    return this.chainService.checkHealth(id);
  }
}
