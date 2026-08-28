import { Body, Controller, Get, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import {
  LookupAddressDto,
  QueryCrmTeamListDto,
  QueryCrmWlListDto,
  UpdateCrmWlConfigDto,
  ImportCrmWlTxDto,
} from '../dto/crm-wl.dto';
import { CrmWlConfigService } from '../services/crm-wl-config.service';
import { CrmWlDashboardService } from '../services/crm-wl-dashboard.service';
import { CrmTeamService } from '../services/crm-team.service';
import { CrmWlQueryService } from '../services/crm-wl-query.service';
import { CrmWlSyncService } from '../services/crm-wl-sync.service';

@ApiTags('CrmToken白名单')
@Controller('crm-whitelist')
export class CrmWlController {
  constructor(
    private readonly configService: CrmWlConfigService,
    private readonly queryService: CrmWlQueryService,
    private readonly syncService: CrmWlSyncService,
    private readonly teamService: CrmTeamService,
    private readonly dashboardService: CrmWlDashboardService,
  ) {}

  @Get('stats')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: 'CrmToken 数据面板统计（链上全局 + 本地分布）' })
  getDashboard() {
    return this.dashboardService.getStats();
  }

  @Get('config')
  @ApiOperation({ summary: '获取白名单合约配置（登录即可读，便于写链页取地址）' })
  getConfig() {
    return this.configService.getOrEmpty();
  }

  @Put('config')
  @RequirePermissions('crm-wl:config')
  @ApiOperation({ summary: '保存白名单合约配置（清空索引并从起始块重扫）' })
  saveConfig(@Body() dto: UpdateCrmWlConfigDto) {
    return this.configService.upsert(dto);
  }

  @Post('sync')
  @RequirePermissions('crm-wl:config')
  @ApiOperation({ summary: '同步链上白名单事件到本地' })
  sync() {
    return this.syncService.syncAll();
  }

  @Post('import-tx')
  @RequirePermissions('crm-wl:config')
  @ApiOperation({ summary: '按交易哈希即时索引（MetaMask 写链后调用，几乎零 RPC）' })
  importTx(@Body() dto: ImportCrmWlTxDto) {
    return this.syncService.importTx(dto.kind, dto.txHash);
  }

  @Get('traders')
  @RequirePermissions('crm-wl:trader-list')
  @ApiOperation({ summary: '交易白名单有效列表' })
  listTraders(@Query() query: QueryCrmWlListDto) {
    return this.queryService.listTraders(query);
  }

  @Get('traders/lookup')
  @RequirePermissions('crm-wl:trader-list')
  @ApiOperation({ summary: '按地址核对交易白名单（索引+链上）' })
  lookupTrader(@Query() query: LookupAddressDto) {
    return this.queryService.lookupTrader(query.address);
  }

  @Get('nodes')
  @RequirePermissions('crm-wl:node-list')
  @ApiOperation({ summary: '节点白名单有效列表' })
  listNodes(@Query() query: QueryCrmWlListDto) {
    return this.queryService.listNodes(query);
  }

  @Get('nodes/lookup')
  @RequirePermissions('crm-wl:node-list')
  @ApiOperation({ summary: '按地址核对节点白名单（索引+链上）' })
  lookupNode(@Query() query: LookupAddressDto) {
    return this.queryService.lookupNode(query.address);
  }

  @Post('team/sync-relations')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '同步链上 ReferralBound 团队关系' })
  syncRelations() {
    return this.teamService.syncRelations();
  }

  @Get('team/members')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '团队成员分页列表（关系索引 + 链上指标）' })
  listMembers(@Query() query: QueryCrmTeamListDto) {
    return this.teamService.listMembers(query);
  }

  @Get('team/tree')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '按地址查看团队树' })
  getTree(@Query() query: LookupAddressDto) {
    return this.teamService.tree(query.address);
  }

  @Get('team/overview')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '按地址查看团队详情' })
  getOverview(@Query() query: LookupAddressDto) {
    return this.teamService.overview(query.address);
  }
}
