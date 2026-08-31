import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { Log } from 'viem';
import { Repository } from 'typeorm';
import { Chain } from '../../blockchain/entities/chain.entity';
import { BlockchainRpcService } from '../../blockchain/services/blockchain-rpc.service';
import { CRAM_BUSINESS_ABI } from '../abi/load-abi';
import {
  extractAlchemyTxHashes,
  isAlchemyActivityPayload,
  verifyAlchemySignature,
} from '../utils/alchemy-webhook';
import { parseWebhookLogs } from '../utils/crm-wl-webhook-logs';
import { CrmWlConfigService } from './crm-wl-config.service';
import { CrmTeamService } from './crm-team.service';

/**
 * 入金 / 团队：启动时补扫历史块，之后走 Webhook 或 WSS，并保留短轮询补漏。
 */
@Injectable()
export class CrmWlRealtimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CrmWlRealtimeService.name);
  private unwatch?: () => void;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private catchingUp = false;
  private lastIngestAt?: Date;
  private lastIngestProcessed = 0;
  private liveMode: 'idle' | 'websocket' | 'polling' = 'idle';

  constructor(
    private readonly teamService: CrmTeamService,
    private readonly configService: CrmWlConfigService,
    private readonly rpcService: BlockchainRpcService,
    private readonly config: ConfigService,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
  ) {}

  onModuleInit() {
    void this.bootstrap();
  }

  onModuleDestroy() {
    this.stopWatch();
    if (this.pollTimer) clearTimeout(this.pollTimer);
  }

  getStatus() {
    const secret = this.config.get<string>('crmWl.webhookSecret') || '';
    return {
      webhookEnabled: Boolean(secret),
      webhookPath: '/api/crm-whitelist/hooks/logs',
      liveMode: this.liveMode,
      lastIngestAt: this.lastIngestAt ?? null,
      lastIngestProcessed: this.lastIngestProcessed,
    };
  }

  async ingestWebhook(params: {
    body: unknown;
    rawBody?: Buffer;
    alchemySignature?: string;
    headerSecret?: string;
  }) {
    const expected = this.config.get<string>('crmWl.webhookSecret') || '';
    if (!expected) {
      throw new Error('未配置 CRM_WL_WEBHOOK_SECRET，Webhook 未启用');
    }
    const alchemyOk = verifyAlchemySignature(params.rawBody, params.alchemySignature, expected);
    const got = (params.headerSecret || '').replace(/^Bearer\s+/i, '').trim();
    const headerOk = Boolean(got) && got === expected;
    if (!alchemyOk && !headerOk) {
      if (params.alchemySignature && !params.rawBody?.length) {
        throw new Error('未配置 rawBody，无法校验 Alchemy 签名');
      }
      throw new Error('Webhook 密钥无效');
    }
    const body = this.parseBody(params.rawBody, params.body);
    const logs = await this.resolveWebhookLogs(body);
    const result = await this.ingestLogs(logs);
    this.lastIngestAt = new Date();
    this.lastIngestProcessed = result.processed;
    return result;
  }

  private parseBody(rawBody: Buffer | undefined, fallback: unknown): unknown {
    if (!rawBody?.length) return fallback;
    try {
      return JSON.parse(rawBody.toString('utf8')) as unknown;
    } catch {
      return fallback;
    }
  }

  private async resolveWebhookLogs(body: unknown): Promise<Log[]> {
    if (isAlchemyActivityPayload(body)) {
      const hashes = extractAlchemyTxHashes(body);
      this.logger.log(`Alchemy ${String((body as { type?: string }).type || 'activity')} txs=${hashes.length}`);
      return this.fetchLogsForTxs(hashes);
    }
    const parsed = parseWebhookLogs(body);
    if (parsed.length) return parsed;
    return this.fetchLogsForTxs(extractAlchemyTxHashes(body));
  }

  private async fetchLogsForTxs(hashes: string[]): Promise<Log[]> {
    if (!hashes.length) return [];
    const cfg = await this.configService.getOrEmpty();
    if (!cfg.chainId) {
      throw new Error('未配置白名单 chainId，Webhook 无法拉 receipt');
    }
    const chain = await this.chainRepository.findOne({ where: { chainId: cfg.chainId, status: 1 } });
    if (!chain) {
      throw new Error('未找到对应链或链未启用');
    }
    const { client } = this.rpcService.getClientForLogs(chain);
    const logs: Log[] = [];
    for (const hash of hashes) {
      const receipt = await client.getTransactionReceipt({ hash: hash as `0x${string}` });
      logs.push(...receipt.logs);
    }
    return logs;
  }

  async ingestLogs(logs: Log[]) {
    if (!logs.length) return { processed: 0, joins: 0, binds: 0 };
    const result = await this.teamService.ingestBusinessLogs(logs);
    this.lastIngestAt = new Date();
    this.lastIngestProcessed = result.processed;
    if (result.processed) {
      this.logger.log(`实时入库 joins=${result.joins} binds=${result.binds}`);
    }
    return result;
  }

  private async bootstrap() {
    const enabled = this.config.get<boolean>('crmWl.liveEnabled', true);
    if (!enabled) return;
    try {
      await this.catchUp();
    } catch (err) {
      this.logger.warn(`首次补扫未完成: ${err instanceof Error ? err.message : String(err)}`);
    }
    await this.startLive();
  }

  private async catchUp() {
    if (this.catchingUp) return;
    this.catchingUp = true;
    try {
      const cfg = await this.configService.getOrEmpty();
      if (!cfg.chainId || !cfg.businessAddress) return;
      this.logger.log('入金/团队首次扫块开始');
      const joins = await this.teamService.syncJoins();
      const team = await this.teamService.syncRelations();
      this.logger.log(
        `首次扫块结束 join=${joins.syncedTo} caughtUp=${joins.caughtUp} team=${team.syncedTo} caughtUp=${team.caughtUp}`,
      );
    } finally {
      this.catchingUp = false;
    }
  }

  private async startLive() {
    this.stopWatch();
    const cfg = await this.configService.getOrEmpty();
    if (!cfg.chainId || !cfg.businessAddress) {
      this.schedulePoll();
      return;
    }
    const chain = await this.chainRepository.findOne({ where: { chainId: cfg.chainId, status: 1 } });
    if (chain && this.rpcService.hasWebSocket(chain)) {
      const ws = this.rpcService.getWsClient(chain);
      if (ws) {
        try {
          this.unwatch = ws.watchEvent({
            address: cfg.businessAddress as `0x${string}`,
            events: CRAM_BUSINESS_ABI.filter(
              (item) =>
                item.type === 'event' &&
                'name' in item &&
                (item.name === 'ParticipationAdded' || item.name === 'ReferralBound'),
            ),
            onLogs: (logs) => {
              void this.ingestLogs(logs).catch((err) =>
                this.logger.warn(`WSS 入库失败: ${err instanceof Error ? err.message : String(err)}`),
              );
            },
            onError: (err) => {
              this.logger.warn(`WSS 中断: ${String(err)}`);
              this.stopWatch();
              this.schedulePoll();
            },
          });
          this.liveMode = 'websocket';
          this.logger.log('入金/团队 WebSocket 实时监听已启动');
        } catch (err) {
          this.logger.warn(`WSS 启动失败，改用轮询: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    this.schedulePoll();
  }

  private stopWatch() {
    try {
      this.unwatch?.();
    } catch {
      /* ignore */
    }
    this.unwatch = undefined;
    if (this.liveMode === 'websocket') this.liveMode = 'idle';
  }

  private schedulePoll() {
    if (this.config.get<boolean>('crmWl.livePoll', true) === false) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    const delay = this.config.get<number>('crmWl.livePollMs', 20000);
    this.pollTimer = setTimeout(() => {
      void this.pollOnce().finally(() => this.schedulePoll());
    }, delay);
    if (this.liveMode !== 'websocket') this.liveMode = 'polling';
  }

  private async pollOnce() {
    if (this.catchingUp) return;
    try {
      await this.teamService.syncJoins();
      await this.teamService.syncRelations();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('同步进行中') && !msg.includes('配置不存在') && !msg.includes('未找到')) {
        this.logger.warn(`实时轮询失败: ${msg}`);
      }
    }
  }
}
