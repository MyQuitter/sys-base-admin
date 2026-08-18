import { Controller, Get, Param, ParseIntPipe, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { MonitorService } from './monitor.service';

@ApiTags('系统监控')
@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitorService: MonitorService) {}

  @Get('online-users')
  @RequirePermissions('monitor:online')
  @ApiOperation({ summary: '获取在线用户列表' })
  getOnlineUsers() {
    return this.monitorService.getOnlineUsers();
  }

  @Post('online-users/:id/kickout')
  @RequirePermissions('monitor:online')
  @ApiOperation({ summary: '强制用户下线' })
  kickout(@Param('id', ParseIntPipe) id: number) {
    return this.monitorService.kickout(id);
  }

  @Get('system')
  @RequirePermissions('monitor:system')
  @ApiOperation({ summary: '获取系统状态' })
  getSystemStatus() {
    return this.monitorService.getSystemStatus();
  }
}
