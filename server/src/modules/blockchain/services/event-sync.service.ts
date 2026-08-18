import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { decodeEventLog, type AbiEvent, type Log } from 'viem';
import { In, Repository } from 'typeorm';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { QueryEventLogDto } from '../dto/event-subscription.dto';
import { Chain } from '../entities/chain.entity';
import { Contract } from '../entities/contract.entity';
import { EventLog } from '../entities/event-log.entity';
import { EventSubscription } from '../entities/event-subscription.entity';
import { resolveEventAbiItem } from '../utils/abi';
import {
  classifyRpcLogError,
  describeRpcLogError,
  fetchLogsAdaptive,
} from '../utils/log-fetch';
import { BlockchainRpcService } from './blockchain-rpc.service';

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (text.includes(',') || text.includes('"') || text.includes('\n')) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

@Injectable()
export class EventSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventSyncService.name);
  private loopTimer?: ReturnType<typeof setTimeout>;
  private readonly scanningIds = new Set<number>();
  private readonly wsUnwatchers = new Map<number, () => void>();

  constructor(
    @InjectRepository(EventSubscription)
    private readonly subscriptionRepository: Repository<EventSubscription>,
    @InjectRepository(EventLog)
    private readonly eventLogRepository: Repository<EventLog>,
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    private readonly rpcService: BlockchainRpcService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.bootstrapSchedules();
    this.scheduleNextTick();
    void this.refreshWebSocketWatchers();
    this.logger.log('事件订阅自动同步已启动（HTTP 轮询 + 可选 WebSocket）');
  }

  onModuleDestroy() {
    if (this.loopTimer) clearTimeout(this.loopTimer);
    this.stopAllWebSocketWatchers();
  }

  private get eventSyncConfig() {
    return {
      tickMinMs: this.config.get<number>('blockchain.eventSync.tickMinMs', 3000),
      tickMaxMs: this.config.get<number>('blockchain.eventSync.tickMaxMs', 10000),
      pollMinMs: this.config.get<number>('blockchain.eventSync.pollMinMs', 15000),
      pollMaxMs: this.config.get<number>('blockchain.eventSync.pollMaxMs', 45000),
      maxPerTick: this.config.get<number>('blockchain.eventSync.maxPerTick', 3),
      useWebSocket: this.config.get<boolean>('blockchain.eventSync.useWebSocket', true),
      logChunkSize: this.config.get<number>('blockchain.eventSync.logChunkSize', 500),
      logRequestDelayMs: this.config.get<number>('blockchain.eventSync.logRequestDelayMs', 200),
    };
  }

  private mergeSkippedBlocks(existing: string[] | undefined, added: bigint[]): string[] {
    if (!added.length) return existing ?? [];
    const merged = new Set([...(existing ?? []), ...added.map(String)]);
    return [...merged].slice(-200);
  }

  private logSkippedBlocks(subscriptionId: number, blocks: bigint[]) {
    if (!blocks.length) return;
    const preview = blocks.slice(0, 5).map(String).join(', ');
    const suffix = blocks.length > 5 ? ` 等 ${blocks.length} 个` : '';
    this.logger.warn(
      `订阅 ${subscriptionId} 跳过无法拉取的区块: ${preview}${suffix}（单区块日志过密或 RPC 限流）`,
    );
  }

  private getLogChunkSize(chainId: number): bigint {
    const byChain = this.config.get<Record<string, number>>('blockchain.eventSync.logChunkByChain', {});
    const specific = byChain[String(chainId)];
    const size = specific ?? this.eventSyncConfig.logChunkSize;
    return BigInt(Math.max(1, size));
  }

  private randomMs(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private randomNextScanAt(): Date {
    const { pollMinMs, pollMaxMs } = this.eventSyncConfig;
    return new Date(Date.now() + this.randomMs(pollMinMs, pollMaxMs));
  }

  private scheduleNextTick() {
    const { tickMinMs, tickMaxMs } = this.eventSyncConfig;
    const delay = this.randomMs(tickMinMs, tickMaxMs);
    this.loopTimer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNextTick());
    }, delay);
  }

  /** 为已启用但尚未排期的订阅初始化 nextScanAt */
  private async bootstrapSchedules() {
    const subs = await this.subscriptionRepository.find({ where: { status: 1 } });
    for (const sub of subs) {
      if (!sub.nextScanAt) {
        sub.nextScanAt = new Date(Date.now() + this.randomMs(0, 10000));
        await this.subscriptionRepository.save(sub);
      }
    }
  }

  /** 重建 WebSocket 监听器（链配置了 wssUrls 时启用） */
  async refreshWebSocketWatchers() {
    this.stopAllWebSocketWatchers();
    const { useWebSocket } = this.eventSyncConfig;
    if (!useWebSocket) return;

    const subs = await this.subscriptionRepository.find({ where: { status: 1 }, order: { id: 'ASC' } });
    for (const sub of subs) {
      await this.ensureWebSocketWatcher(sub.id);
    }
  }

  private stopAllWebSocketWatchers() {
    for (const unwatch of this.wsUnwatchers.values()) {
      try {
        unwatch();
      } catch {
        // ignore
      }
    }
    this.wsUnwatchers.clear();
  }

  private async ensureWebSocketWatcher(subscriptionId: number) {
    if (this.wsUnwatchers.has(subscriptionId)) return;

    const sub = await this.subscriptionRepository.findOne({ where: { id: subscriptionId, status: 1 } });
    if (!sub) return;

    const chain = await this.chainRepository.findOne({ where: { chainId: sub.chainId, status: 1 } });
    if (!chain || !this.rpcService.hasWebSocket(chain)) return;

    const contract = await this.contractRepository.findOne({ where: { id: sub.contractId } });
    if (!contract) return;

    let eventAbi: AbiEvent;
    try {
      eventAbi = resolveEventAbiItem(contract.abi, sub.eventName);
    } catch {
      return;
    }

    const wsClient = this.rpcService.getWsClient(chain);
    if (!wsClient) return;

    try {
      const unwatch = wsClient.watchContractEvent({
        address: contract.address as `0x${string}`,
        abi: [eventAbi],
        eventName: sub.eventName as 'Transfer',
        onLogs: (logs) => {
          void this.persistWsLogs(sub, contract, eventAbi, logs);
        },
        onError: (err) => {
          this.logger.warn(`WebSocket 监听中断 subscriptionId=${subscriptionId}: ${String(err)}`);
          this.wsUnwatchers.get(subscriptionId)?.();
          this.wsUnwatchers.delete(subscriptionId);
        },
      });
      this.wsUnwatchers.set(subscriptionId, unwatch);
      this.logger.log(`WebSocket 监听已启动 subscriptionId=${subscriptionId} event=${sub.eventName}`);
    } catch (e) {
      this.logger.warn(`WebSocket 监听启动失败 subscriptionId=${subscriptionId}: ${String(e)}`);
    }
  }

  private async persistWsLogs(
    sub: EventSubscription,
    contract: Contract,
    eventAbi: AbiEvent,
    logs: Log[],
  ) {
    let newLogs = 0;
    let maxBlock = sub.lastScannedBlock ? BigInt(sub.lastScannedBlock) : 0n;

    for (const log of logs) {
      const saved = await this.saveEventLog(sub, contract, eventAbi, log);
      if (saved) {
        newLogs += 1;
        if (log.blockNumber && log.blockNumber > maxBlock) maxBlock = log.blockNumber;
      }
    }

    if (newLogs > 0) {
      sub.lastScannedBlock = String(maxBlock);
      sub.lastScannedAt = new Date();
      await this.subscriptionRepository.save(sub);
      this.logger.log(`WebSocket 写入 subscriptionId=${sub.id} newLogs=${newLogs}`);
    }
  }

  /** 调度心跳：处理已到期的订阅（HTTP 补漏） */
  private async tick() {
    const now = new Date();
    const { maxPerTick } = this.eventSyncConfig;
    const due = await this.subscriptionRepository
      .createQueryBuilder('sub')
      .where('sub.status = 1')
      .andWhere('(sub.nextScanAt IS NULL OR sub.nextScanAt <= :now)', { now })
      .orderBy('sub.nextScanAt IS NULL', 'DESC')
      .addOrderBy('sub.nextScanAt', 'ASC')
      .take(maxPerTick)
      .getMany();

    for (const sub of due) {
      if (this.scanningIds.has(sub.id)) continue;
      await this.runScheduledScan(sub.id);
    }
  }

  private async runScheduledScan(subscriptionId: number) {
    this.scanningIds.add(subscriptionId);
    try {
      await this.scanOne(subscriptionId);
      await this.subscriptionRepository.update(subscriptionId, {
        lastScannedAt: new Date(),
        nextScanAt: this.randomNextScanAt(),
      });
    } catch (e) {
      const kind = classifyRpcLogError(e);
      const hint = describeRpcLogError(kind);
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`自动扫描失败 subscriptionId=${subscriptionId}: ${hint} — ${msg}`);
      await this.subscriptionRepository.update(subscriptionId, {
        nextScanAt: new Date(Date.now() + this.randomMs(30000, 90000)),
      });
    } finally {
      this.scanningIds.delete(subscriptionId);
    }
  }

  /** 手动触发单次扫描（补扫） */
  async scanSubscription(id: number) {
    if (this.scanningIds.has(id)) {
      throw new ConflictException('该订阅正在扫描中');
    }
    this.scanningIds.add(id);
    try {
      const result = await this.scanOne(id);
      await this.subscriptionRepository.update(id, {
        lastScannedAt: new Date(),
        nextScanAt: this.randomNextScanAt(),
      });
      return result;
    } finally {
      this.scanningIds.delete(id);
    }
  }

  private async saveEventLog(
    sub: EventSubscription,
    contract: Contract,
    eventAbi: AbiEvent,
    log: Pick<Log, 'transactionHash' | 'logIndex' | 'blockNumber' | 'data' | 'topics'>,
  ): Promise<boolean> {
    if (!log.transactionHash) return false;

    const exists = await this.eventLogRepository.findOne({
      where: {
        chainId: sub.chainId,
        txHash: log.transactionHash,
        logIndex: Number(log.logIndex),
      },
    });
    if (exists) return false;

    let args: Record<string, unknown> = {};
    try {
      const decoded = decodeEventLog({
        abi: [eventAbi],
        data: log.data,
        topics: log.topics,
      });
      args = decoded.args as Record<string, unknown>;
    } catch {
      args = {};
    }

    await this.eventLogRepository.save(
      this.eventLogRepository.create({
        subscriptionId: sub.id,
        contractId: sub.contractId,
        chainId: sub.chainId,
        eventName: sub.eventName,
        txHash: log.transactionHash,
        blockNumber: String(log.blockNumber),
        logIndex: Number(log.logIndex),
        args,
      }),
    );
    return true;
  }

  private async scanOne(subscriptionId: number) {
    const sub = await this.subscriptionRepository.findOne({ where: { id: subscriptionId } });
    if (!sub) throw new NotFoundException('事件订阅不存在');
    if (sub.status !== 1) {
      return { newLogs: 0, scannedBlocks: '0', skippedBlocks: sub.skippedBlocks ?? [] };
    }

    const contract = await this.contractRepository.findOne({ where: { id: sub.contractId } });
    if (!contract) throw new NotFoundException('合约不存在');

    const eventAbi = resolveEventAbiItem(contract.abi, sub.eventName);
    const chain = await this.chainRepository.findOne({ where: { chainId: sub.chainId, status: 1 } });
    if (!chain) throw new NotFoundException('链未启用或不存在');
    const latest = await this.rpcService.withHttpFailover(chain, (client) => client.getBlockNumber());

    let fromBlock: bigint;
    if (sub.lastScannedBlock) {
      fromBlock = BigInt(sub.lastScannedBlock) + 1n;
    } else if (sub.fromBlock) {
      fromBlock = BigInt(sub.fromBlock);
    } else {
      fromBlock = latest;
    }

    if (fromBlock > latest) {
      return {
        newLogs: 0,
        scannedBlocks: sub.lastScannedBlock ?? String(fromBlock - 1n),
        skippedBlocks: sub.skippedBlocks ?? [],
      };
    }

    let cursor = fromBlock;
    let newLogs = 0;
    const initialLastBlock = sub.lastScannedBlock ? BigInt(sub.lastScannedBlock) : fromBlock - 1n;
    let lastBlock = initialLastBlock;
    const chunkSize = this.getLogChunkSize(chain.chainId);
    const { logRequestDelayMs } = this.eventSyncConfig;
    const skippedInRun: bigint[] = [];

    const fetchChunk = async (chunkFrom: bigint, chunkTo: bigint) =>
      this.rpcService.withHttpFailover(chain, (client) =>
        client.getLogs({
          address: contract.address as `0x${string}`,
          event: eventAbi,
          fromBlock: chunkFrom,
          toBlock: chunkTo,
        }),
      );

    try {
      while (cursor <= latest) {
        const toBlock = cursor + chunkSize - 1n > latest ? latest : cursor + chunkSize - 1n;
        const { logs, skippedBlocks } = await fetchLogsAdaptive(fetchChunk, cursor, toBlock, {
          requestDelayMs: logRequestDelayMs,
        });

        if (skippedBlocks.length) {
          skippedInRun.push(...skippedBlocks);
          this.logSkippedBlocks(subscriptionId, skippedBlocks);
        }

        for (const log of logs) {
          const saved = await this.saveEventLog(sub, contract, eventAbi, log);
          if (saved) newLogs += 1;
        }

        lastBlock = toBlock;
        cursor = toBlock + 1n;

        sub.lastScannedBlock = String(lastBlock);
        if (skippedInRun.length) {
          sub.skippedBlocks = this.mergeSkippedBlocks(sub.skippedBlocks, skippedInRun);
        }
        await this.subscriptionRepository.save(sub);
      }
    } catch (e) {
      if (lastBlock > initialLastBlock) {
        sub.lastScannedBlock = String(lastBlock);
        if (skippedInRun.length) {
          sub.skippedBlocks = this.mergeSkippedBlocks(sub.skippedBlocks, skippedInRun);
        }
        await this.subscriptionRepository.save(sub);
      }
      throw e;
    }

    return {
      newLogs,
      scannedBlocks: String(lastBlock),
      skippedBlocks: sub.skippedBlocks ?? [],
    };
  }

  private toLogVo(log: EventLog, explorerUrl?: string) {
    return {
      id: log.id,
      subscriptionId: log.subscriptionId,
      contractId: log.contractId,
      chainId: log.chainId,
      eventName: log.eventName,
      txHash: log.txHash,
      blockNumber: log.blockNumber,
      logIndex: log.logIndex,
      args: log.args,
      explorerUrl: explorerUrl ? `${explorerUrl.replace(/\/$/, '')}/tx/${log.txHash}` : undefined,
      createdAt: log.createdAt,
    };
  }

  async findLogs(query: QueryEventLogDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.eventLogRepository.createQueryBuilder('log');

    if (query.subscriptionId !== undefined) {
      qb.andWhere('log.subscriptionId = :subscriptionId', { subscriptionId: query.subscriptionId });
    }
    if (query.contractId !== undefined) {
      qb.andWhere('log.contractId = :contractId', { contractId: query.contractId });
    }
    if (query.chainId !== undefined) {
      qb.andWhere('log.chainId = :chainId', { chainId: query.chainId });
    }
    if (query.eventName) {
      qb.andWhere('log.eventName = :eventName', { eventName: query.eventName });
    }
    if (query.txHash) {
      qb.andWhere('log.txHash = :txHash', { txHash: query.txHash });
    }

    qb.orderBy('log.id', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    const chainIds = [...new Set(items.map((i) => i.chainId))];
    const chains = chainIds.length
      ? await this.chainRepository.find({ where: { chainId: In(chainIds) } })
      : [];
    const explorerMap = new Map(chains.map((c) => [c.chainId, c.explorerUrl]));

    return toPageResult(
      items.map((log) => this.toLogVo(log, explorerMap.get(log.chainId))),
      total,
      page,
      pageSize,
    );
  }

  async exportLogs(query: QueryEventLogDto) {
    const result = await this.findLogs({ ...query, page: 1, pageSize: 5000 });
    const header = 'ID,链ID,事件,交易哈希,区块,LogIndex,参数,时间\n';
    const rows = result.items
      .map((r) =>
        [
          r.id,
          r.chainId,
          csvCell(r.eventName),
          csvCell(r.txHash),
          csvCell(r.blockNumber),
          r.logIndex,
          csvCell(r.args ? JSON.stringify(r.args) : ''),
          csvCell(r.createdAt),
        ].join(','),
      )
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }
}
