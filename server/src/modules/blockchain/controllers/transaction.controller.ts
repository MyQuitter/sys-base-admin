import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateTransactionDto, QueryTransactionDto } from '../dto/transaction.dto';
import { TransactionService } from '../services/transaction.service';

@ApiTags('区块链-交易记录')
@Controller('blockchain/transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  @RequirePermissions('tx:list')
  @ApiOperation({ summary: '分页查询交易记录' })
  findAll(@Query() query: QueryTransactionDto) {
    return this.transactionService.findAll(query);
  }

  @Get('export')
  @SkipWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=blockchain-transactions.csv')
  @RequirePermissions('tx:list')
  @ApiOperation({ summary: '导出交易记录 CSV' })
  export(@Query() query: QueryTransactionDto) {
    return this.transactionService.exportTransactions(query);
  }

  @Get(':id')
  @RequirePermissions('tx:list')
  @ApiOperation({ summary: '查询交易详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.findOne(id);
  }

  @Post()
  @RequirePermissions('tx:create')
  @ApiOperation({ summary: '手工登记交易哈希' })
  create(@Body() dto: CreateTransactionDto) {
    return this.transactionService.create(dto);
  }

  @Post(':id/sync')
  @RequirePermissions('tx:create')
  @ApiOperation({ summary: '立即同步交易状态' })
  sync(@Param('id', ParseIntPipe) id: number) {
    return this.transactionService.syncOne(id);
  }
}
