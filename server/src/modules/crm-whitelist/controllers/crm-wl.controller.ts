import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Put,
  Query,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { Public } from '../../../common/decorators/public.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import {
  LookupAddressDto,
  QueryCrmTeamListDto,
  QueryCrmWlKlineDto,
  QueryCrmWlListDto,
  UpdateCrmWlConfigDto,
  ImportCrmWlTxDto,
} from '../dto/crm-wl.dto';
import { CrmWlConfigService } from '../services/crm-wl-config.service';
import { CrmWlDashboardService } from '../services/crm-wl-dashboard.service';
import { CrmWlRealtimeService } from '../services/crm-wl-realtime.service';
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
    private readonly realtimeService: CrmWlRealtimeService,
  ) {}

  @Get('stats')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: 'CrmToken 数据面板统计（链上全局 + 本地分布）' })
  getDashboard() {
    return this.dashboardService.getStats();
  }

  @Get('stats/kline')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: 'CRAM 薄饼池 USD K 线（GeckoTerminal）' })
  getPriceKline(@Query() query: QueryCrmWlKlineDto) {
    return this.dashboardService.getPriceKline(query.interval ?? '1h');
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

  @Get('realtime')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '入金/团队实时同步状态（Webhook / WSS / 轮询）' })
  getRealtime() {
    return this.realtimeService.getStatus();
  }

  @Public()
  @SkipThrottle()
  @Post('hooks/logs')
  @HttpCode(200)
  @ApiOperation({ summary: 'Alchemy Notify Webhook（ADDRESS_ACTIVITY HMAC + Custom GraphQL logs）' })
  async ingestHook(
    @Req() req: RawBodyRequest<Request>,
    @Body() body: unknown,
    @Headers('x-alchemy-signature') alchemySignature?: string,
    @Headers('x-crm-wl-webhook-secret') secretA?: string,
    @Headers('x-webhook-secret') secretB?: string,
    @Headers('authorization') authorization?: string,
  ) {
    try {
      return await this.realtimeService.ingestWebhook({
        body,
        rawBody: req.rawBody,
        alchemySignature,
        headerSecret: secretA || secretB || authorization,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('未配置') || msg.includes('未找到')) {
        throw new ServiceUnavailableException(msg);
      }
      if (msg.includes('密钥') || msg.includes('签名')) {
        throw new UnauthorizedException(msg);
      }
      throw err;
    }
  }

  @Get('joins')
  @RequirePermissions('crm-wl:join-list')
  @ApiOperation({ summary: '入金记录分页列表（ParticipationAdded 索引）' })
  listJoins(@Query() query: QueryCrmWlListDto) {
    return this.teamService.listJoins(query);
  }

  @Post('joins/sync')
  @RequirePermissions('crm-wl:join-list')
  @ApiOperation({ summary: '同步链上入金事件到本地' })
  syncJoins() {
    return this.teamService.syncJoins();
  }

  @Post('team/sync-relations')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '同步链上 ReferralBound 团队关系' })
  syncRelations() {
    return this.teamService.syncRelations();
  }

  @Post('team/sync-metrics')
  @RequirePermissions('crm-team:list')
  @ApiOperation({ summary: '全量刷新业绩/额度/节点并写入数据库' })
  syncMetrics() {
    return this.teamService.syncMetrics();
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

  @Public()
  @SkipThrottle()
  @Get('team/metrics')
  @ApiOperation({ summary: '公开：按地址读库，返回本人业绩及直推成员的个人/团队业绩' })
  getMetrics(@Query() query: LookupAddressDto) {
    return this.teamService.metricsFromDb(query.address);
  }

  @Public()
  @SkipThrottle()
  @SkipWrap()
  @Post('rpc')
  @HttpCode(200)
  @ApiOperation({ summary: '公开：只读 JSON-RPC 代理（浏览器经本域转发到 Alchemy/BSC）' })
  proxyRpc(@Body() body: unknown) {
    return this.queryService.proxyRpc(body);
  }
}
