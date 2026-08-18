import { Controller, Get, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';

@ApiTags('工作台')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: '工作台聚合数据' })
  getOverview(@Req() req: { user?: { userId: number } }) {
    const userId = req.user?.userId ?? 0;
    return this.dashboardService.getOverview(userId);
  }
}
