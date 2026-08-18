import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { QueryEventLogDto } from '../dto/event-subscription.dto';
import { EventSyncService } from '../services/event-sync.service';

@ApiTags('区块链-事件日志')
@Controller('blockchain/event-logs')
export class EventLogController {
  constructor(private readonly eventSyncService: EventSyncService) {}

  @Get()
  @RequirePermissions('event-sub:list')
  @ApiOperation({ summary: '分页查询事件日志' })
  findAll(@Query() query: QueryEventLogDto) {
    return this.eventSyncService.findLogs(query);
  }

  @Get('export')
  @SkipWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=blockchain-event-logs.csv')
  @RequirePermissions('event-sub:list')
  @ApiOperation({ summary: '导出事件日志 CSV' })
  export(@Query() query: QueryEventLogDto) {
    return this.eventSyncService.exportLogs(query);
  }
}
