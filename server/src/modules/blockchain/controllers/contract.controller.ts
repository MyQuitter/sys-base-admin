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
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateContractDto, QueryContractDto, SyncContractTxDto, UpdateContractDto } from '../dto/contract.dto';
import { ContractService } from '../services/contract.service';
import { ContractTxSyncService } from '../services/contract-tx-sync.service';

@ApiTags('区块链-合约管理')
@Controller('blockchain/contracts')
export class ContractController {
  constructor(
    private readonly contractService: ContractService,
    private readonly contractTxSyncService: ContractTxSyncService,
  ) {}

  @Get()
  @RequirePermissions('contract:list')
  @ApiOperation({ summary: '分页查询合约' })
  findAll(@Query() query: QueryContractDto) {
    return this.contractService.findAll(query);
  }

  @Get(':id/listen-options')
  @RequirePermissions('contract:list')
  @ApiOperation({ summary: '获取合约推荐监听方式（RPC vs 浏览器 API）' })
  getListenOptions(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.getListenOptions(id);
  }

  @Post(':id/subscribe-transfer')
  @RequirePermissions('contract:update')
  @ApiOperation({ summary: '一键 RPC 订阅 Transfer 事件（无需浏览器 API）' })
  subscribeTransfer(@Param('id', ParseIntPipe) id: number, @Body() dto: SyncContractTxDto) {
    return this.contractService.subscribeTransfer(
      id,
      dto.startBlock !== undefined ? String(dto.startBlock) : undefined,
    );
  }

  @Get(':id')
  @RequirePermissions('contract:list')
  @ApiOperation({ summary: '查询合约详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.findOne(id);
  }

  @Post()
  @RequirePermissions('contract:create')
  @ApiOperation({ summary: '登记合约' })
  create(@Body() dto: CreateContractDto) {
    return this.contractService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('contract:update')
  @ApiOperation({ summary: '更新合约' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateContractDto) {
    return this.contractService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('contract:delete')
  @ApiOperation({ summary: '删除合约' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.contractService.remove(id);
  }

  @Post(':id/sync-transactions')
  @RequirePermissions('contract:update')
  @ApiOperation({ summary: '从链上浏览器同步合约交易记录' })
  syncTransactions(@Param('id', ParseIntPipe) id: number, @Body() dto: SyncContractTxDto) {
    return this.contractTxSyncService.syncTransactions(id, dto);
  }
}
