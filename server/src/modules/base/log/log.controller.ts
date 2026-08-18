import { Controller, Get, Header, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { QueryLoginLogDto } from './dto/query-login-log.dto';
import { QueryOperationLogDto } from './dto/query-operation-log.dto';
import { QueryProtectionLogDto } from './dto/query-protection-log.dto';
import { LogService } from './log.service';

@ApiTags('日志审计')
@Controller('logs')
export class LogController {
  constructor(private readonly logService: LogService) {}

  @Get('operation')
  @RequirePermissions('log:operation')
  @ApiOperation({ summary: '分页查询操作日志' })
  findOperationLogs(@Query() query: QueryOperationLogDto) {
    return this.logService.findOperationLogs(query);
  }

  @Get('operation/export')
  @SkipWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=operation-logs.csv')
  @RequirePermissions('log:operation')
  @ApiOperation({ summary: '导出操作日志 CSV' })
  exportOperationLogs(@Query() query: QueryOperationLogDto) {
    return this.logService.exportOperationLogs(query);
  }

  @Get('login')
  @RequirePermissions('log:login')
  @ApiOperation({ summary: '分页查询登录日志' })
  findLoginLogs(@Query() query: QueryLoginLogDto) {
    return this.logService.findLoginLogs(query);
  }

  @Get('login/export')
  @SkipWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=login-logs.csv')
  @RequirePermissions('log:login')
  @ApiOperation({ summary: '导出登录日志 CSV' })
  exportLoginLogs(@Query() query: QueryLoginLogDto) {
    return this.logService.exportLoginLogs(query);
  }

  @Get('protection')
  @RequirePermissions('log:protection')
  @ApiOperation({ summary: '分页查询防护日志' })
  findProtectionLogs(@Query() query: QueryProtectionLogDto) {
    return this.logService.findProtectionLogs(query);
  }

  @Get('protection/export')
  @SkipWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=protection-logs.csv')
  @RequirePermissions('log:protection')
  @ApiOperation({ summary: '导出防护日志 CSV' })
  exportProtectionLogs(@Query() query: QueryProtectionLogDto) {
    return this.logService.exportProtectionLogs(query);
  }
}
