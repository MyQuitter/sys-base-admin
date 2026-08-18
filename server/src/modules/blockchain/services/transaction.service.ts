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
import { Repository, In } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { CreateTransactionDto, QueryTransactionDto } from '../dto/transaction.dto';
import { Chain } from '../entities/chain.entity';
import { TransactionRecord } from '../entities/transaction.entity';
import { BlockchainRpcService } from './blockchain-rpc.service';
import { ChainService } from './chain.service';

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

@Injectable()
export class TransactionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TransactionService.name);
  private loopTimer?: ReturnType<typeof setTimeout>;
  private readonly syncingIds = new Set<number>();

  constructor(
    @InjectRepository(TransactionRecord)
    private readonly txRepository: Repository<TransactionRecord>,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    private readonly chainService: ChainService,
    private readonly rpcService: BlockchainRpcService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit() {
    void this.bootstrapSchedules();
    this.scheduleNextTick();
    this.logger.log('交易记录自动同步已启动（不定时轮询）');
  }

  onModuleDestroy() {
    if (this.loopTimer) clearTimeout(this.loopTimer);
  }

  private get txSyncConfig() {
    return {
      tickMinMs: this.config.get<number>('blockchain.txSync.tickMinMs', 2000),
      tickMaxMs: this.config.get<number>('blockchain.txSync.tickMaxMs', 8000),
      pollMinMs: this.config.get<number>('blockchain.txSync.pollMinMs', 8000),
      pollMaxMs: this.config.get<number>('blockchain.txSync.pollMaxMs', 25000),
      maxPerTick: this.config.get<number>('blockchain.txSync.maxPerTick', 5),
    };
  }

  private randomMs(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
  }

  private randomNextSyncAt(): Date {
    const { pollMinMs, pollMaxMs } = this.txSyncConfig;
    return new Date(Date.now() + this.randomMs(pollMinMs, pollMaxMs));
  }

  private scheduleNextTick() {
    const { tickMinMs, tickMaxMs } = this.txSyncConfig;
    const delay = this.randomMs(tickMinMs, tickMaxMs);
    this.loopTimer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNextTick());
    }, delay);
  }

  private async bootstrapSchedules() {
    const pending = await this.txRepository.find({ where: { status: 'pending' } });
    for (const record of pending) {
      if (!record.nextSyncAt) {
        record.nextSyncAt = new Date(Date.now() + this.randomMs(0, 5000));
        await this.txRepository.save(record);
      }
    }
  }

  private async tick() {
    const now = new Date();
    const { maxPerTick } = this.txSyncConfig;
    const due = await this.txRepository
      .createQueryBuilder('tx')
      .where('tx.status = :status', { status: 'pending' })
      .andWhere('(tx.nextSyncAt IS NULL OR tx.nextSyncAt <= :now)', { now })
      .orderBy('tx.nextSyncAt IS NULL', 'DESC')
      .addOrderBy('tx.nextSyncAt', 'ASC')
      .take(maxPerTick)
      .getMany();

    for (const record of due) {
      if (this.syncingIds.has(record.id)) continue;
      await this.runScheduledSync(record.id);
    }
  }

  private async runScheduledSync(id: number) {
    this.syncingIds.add(id);
    try {
      const stillPending = await this.doSync(id);
      await this.updateSyncSchedule(id, stillPending);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`自动同步交易 id=${id} 失败: ${msg}`);
      await this.txRepository.update(id, {
        nextSyncAt: new Date(Date.now() + this.randomMs(15000, 45000)),
      });
    } finally {
      this.syncingIds.delete(id);
    }
  }

  private async updateSyncSchedule(id: number, stillPending: boolean) {
    const now = new Date();
    if (stillPending) {
      await this.txRepository.update(id, {
        lastSyncedAt: now,
        nextSyncAt: this.randomNextSyncAt(),
      });
    } else {
      await this.txRepository.update(id, {
        lastSyncedAt: now,
        nextSyncAt: undefined,
      });
    }
  }

  private toVo(record: TransactionRecord, explorerUrl?: string) {
    return {
      id: record.id,
      txHash: record.txHash,
      chainId: record.chainId,
      from: record.from,
      to: record.to,
      contractId: record.contractId,
      txType: record.txType,
      status: record.status,
      blockNumber: record.blockNumber,
      gasUsed: record.gasUsed,
      bizRef: record.bizRef,
      errorMessage: record.errorMessage,
      lastSyncedAt: record.lastSyncedAt,
      nextSyncAt: record.nextSyncAt,
      explorerUrl: explorerUrl ? `${explorerUrl.replace(/\/$/, '')}/tx/${record.txHash}` : undefined,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  async findAll(query: QueryTransactionDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.txRepository.createQueryBuilder('tx');

    if (query.chainId !== undefined) qb.andWhere('tx.chainId = :chainId', { chainId: query.chainId });
    if (query.txHash?.trim()) qb.andWhere('tx.txHash LIKE :txHash', { txHash: `%${query.txHash.trim()}%` });
    if (query.status) qb.andWhere('tx.status = :status', { status: query.status });
    if (query.bizRef?.trim()) qb.andWhere('tx.bizRef LIKE :bizRef', { bizRef: `%${query.bizRef.trim()}%` });

    qb.orderBy('tx.id', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    const chainIds = [...new Set(items.map((i) => i.chainId))];
    const chains = chainIds.length
      ? await this.chainRepository.find({ where: { chainId: In(chainIds) } })
      : [];
    const explorerMap = new Map(chains.map((c) => [c.chainId, c.explorerUrl]));

    return toPageResult(
      items.map((r) => this.toVo(r, explorerMap.get(r.chainId))),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: number) {
    const record = await this.txRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException('交易记录不存在');
    const chain = await this.chainRepository.findOne({ where: { chainId: record.chainId } });
    return this.toVo(record, chain?.explorerUrl);
  }

  async create(dto: CreateTransactionDto) {
    const chain = await this.chainService.findByChainId(dto.chainId);
    if (!chain) throw new BusinessException('链未启用或不存在', 'CHAIN_NOT_FOUND');

    const txHash = dto.txHash.toLowerCase();
    const exists = await this.txRepository.findOne({ where: { chainId: dto.chainId, txHash } });
    if (exists) throw new BusinessException('交易哈希已登记', 'TX_HASH_EXISTS');

    const record = this.txRepository.create({
      chainId: dto.chainId,
      txHash,
      contractId: dto.contractId,
      bizRef: dto.bizRef,
      txType: 'manual',
      status: 'pending',
      nextSyncAt: new Date(),
    });
    const saved = await this.txRepository.save(record);
    return this.findOne(saved.id);
  }

  async syncOne(id: number) {
    if (this.syncingIds.has(id)) {
      throw new ConflictException('该交易正在同步中');
    }
    this.syncingIds.add(id);
    try {
      const stillPending = await this.doSync(id);
      await this.updateSyncSchedule(id, stillPending);
      return this.findOne(id);
    } finally {
      this.syncingIds.delete(id);
    }
  }

  /** 执行链上查询，返回是否仍为 pending */
  private async doSync(id: number): Promise<boolean> {
    const record = await this.txRepository.findOne({ where: { id } });
    if (!record) throw new NotFoundException('交易记录不存在');
    if (record.status !== 'pending') return false;

    const chain = await this.chainRepository.findOne({ where: { chainId: record.chainId, status: 1 } });
    if (!chain) {
      record.status = 'failed';
      record.errorMessage = '链未启用';
      await this.txRepository.save(record);
      return false;
    }

    const client = this.rpcService.getClient(chain);
    const receipt = await client.getTransactionReceipt({ hash: record.txHash as `0x${string}` });

    if (!receipt) {
      record.status = 'pending';
      await this.txRepository.save(record);
      return true;
    }

    const tx = await client.getTransaction({ hash: record.txHash as `0x${string}` });
    record.from = tx?.from;
    record.to = tx?.to ?? undefined;
    record.blockNumber = receipt.blockNumber.toString();
    record.gasUsed = receipt.gasUsed.toString();
    record.status = receipt.status === 'success' ? 'success' : 'failed';
    record.errorMessage = receipt.status === 'success' ? undefined : '链上执行失败';
    record.txType = 'sync';
    await this.txRepository.save(record);
    return false;
  }

  /** 从浏览器 API 导入交易，已存在则跳过 */
  async importExplorerTx(input: {
    chainId: number;
    contractId: number;
    txHash: string;
    from?: string;
    to?: string;
    blockNumber?: string;
    gasUsed?: string;
    isError?: string;
    txreceiptStatus?: string;
  }): Promise<'imported' | 'skipped'> {
    const txHash = input.txHash.toLowerCase();
    const exists = await this.txRepository.findOne({ where: { chainId: input.chainId, txHash } });
    if (exists) {
      if (!exists.contractId) {
        exists.contractId = input.contractId;
        await this.txRepository.save(exists);
      }
      return 'skipped';
    }

    let status: TransactionRecord['status'] = 'pending';
    if (input.isError === '1') {
      status = 'failed';
    } else if (input.txreceiptStatus === '1') {
      status = 'success';
    } else if (input.txreceiptStatus === '0') {
      status = 'failed';
    } else if (input.blockNumber) {
      status = 'success';
    }

    await this.txRepository.save(
      this.txRepository.create({
        chainId: input.chainId,
        txHash,
        contractId: input.contractId,
        from: input.from,
        to: input.to,
        blockNumber: input.blockNumber,
        gasUsed: input.gasUsed,
        status,
        txType: 'sync',
        errorMessage: status === 'failed' ? '链上执行失败' : undefined,
      }),
    );
    return 'imported';
  }

  async exportTransactions(query: QueryTransactionDto) {
    const result = await this.findAll({ ...query, page: 1, pageSize: 5000 });
    const header = 'ID,链ID,交易哈希,发送方,接收方,状态,区块号,Gas,业务单号,时间\n';
    const rows = result.items
      .map((r) =>
        [
          r.id,
          r.chainId,
          csvCell(r.txHash),
          csvCell(r.from),
          csvCell(r.to),
          r.status,
          csvCell(r.blockNumber),
          csvCell(r.gasUsed),
          csvCell(r.bizRef),
          csvCell(r.createdAt),
        ].join(','),
      )
      .join('\n');
    return `\uFEFF${header}${rows}`;
  }

  async countPending(): Promise<number> {
    return this.txRepository.count({ where: { status: 'pending' } });
  }

  async countEnabledChains(): Promise<number> {
    return this.chainRepository.count({ where: { status: 1 } });
  }
}
