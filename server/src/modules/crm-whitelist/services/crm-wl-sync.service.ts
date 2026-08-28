import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  decodeEventLog,
  getAddress,
  type Abi,
  type AbiEvent,
  type Log,
  type PublicClient,
  type Hash,
} from 'viem';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { Chain } from '../../blockchain/entities/chain.entity';
import { BlockchainRpcService } from '../../blockchain/services/blockchain-rpc.service';
import {
  fetchExplorerTxList,
  resolveExplorerApiUrl,
} from '../../blockchain/utils/explorer-api';
import {
  describeRpcLogError,
  fetchLogsAdaptive,
  classifyRpcLogError,
  LogFetchDeadlineError,
} from '../../blockchain/utils/log-fetch';
import { CRAM_BUSINESS_ABI, resolveTokenAbi } from '../abi/load-abi';
import { CrmWlNode } from '../entities/crm-wl-node.entity';
import { CrmWlTrader } from '../entities/crm-wl-trader.entity';
import { CrmWlConfigService } from './crm-wl-config.service';

/** setTraderWhitelist(address,bool) / setNodeWhitelist(address,uint8) */
const SELECTOR_TRADER = '0x9104d6a7';
const SELECTOR_NODE = '0x1c942360';

/** 交易回执扫块：单次最多扫多少块（公共 RPC 免费且稀疏事件时最快） */
const RECEIPT_SCAN_MAX_SPAN = 4_000n;
const RECEIPT_SCAN_CONCURRENCY = 6;
const RECEIPT_BLOCK_DELAY_MS = 60;

/** getLogs 兜底：单次跨度与墙钟 */
const GETLOGS_MAX_SPAN = 15_000n;
const GETLOGS_MAX_MS = 35_000;
const GETLOGS_TIMEOUT_MS = 12_000;

const SYNC_LOCK_TTL_MS = 90_000;

export interface CrmWlSyncPartResult {
  syncedTo: string;
  processed: number;
  skippedBlocks: string[];
  caughtUp: boolean;
  /** 本次使用的索引策略，便于排查 */
  strategy?: string;
}

@Injectable()
export class CrmWlSyncService {
  private readonly logger = new Logger(CrmWlSyncService.name);
  private syncing = false;
  private syncStartedAt = 0;

  constructor(
    private readonly configService: CrmWlConfigService,
    private readonly rpcService: BlockchainRpcService,
    private readonly nestConfig: ConfigService,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    @InjectRepository(CrmWlTrader)
    private readonly traderRepository: Repository<CrmWlTrader>,
    @InjectRepository(CrmWlNode)
    private readonly nodeRepository: Repository<CrmWlNode>,
  ) {}

  private getExplorerApiKey(chainId: number): string | undefined {
    const keys = this.nestConfig.get<Record<string, string>>('blockchain.explorerApiKeys', {});
    return keys[String(chainId)] ?? this.nestConfig.get<string>('blockchain.explorerApiKey');
  }

  private getLogChunkSize(rpcUrl: string, chainId: number): bigint {
    if (/alchemy\.com/i.test(rpcUrl)) return 50_000n;
    if (chainId === 56 && /binance\.org|publicnode|defibit|ninicoin/i.test(rpcUrl)) {
      return 20n;
    }
    const byChain = this.nestConfig.get<Record<string, number>>(
      'blockchain.eventSync.logChunkByChain',
      {},
    );
    const fallback = this.nestConfig.get<number>('blockchain.eventSync.logChunkSize', 500);
    const size = byChain[String(chainId)] ?? fallback;
    return BigInt(Math.max(1, Math.min(size, 500)));
  }

  private async resolveChain(chainId: number): Promise<Chain> {
    const chain = await this.chainRepository.findOne({ where: { chainId, status: 1 } });
    if (!chain?.rpcUrls?.length) {
      throw new BusinessException(
        `未找到 chainId=${chainId} 的启用链配置，请先在「链管理」中配置 RPC`,
        'CRM_WL_CHAIN_MISSING',
      );
    }
    return chain;
  }

  private findEvent(abi: Abi, name: string): AbiEvent {
    const item = abi.find((x) => x.type === 'event' && 'name' in x && x.name === name);
    if (!item || item.type !== 'event') {
      throw new BusinessException(`ABI 中缺少事件 ${name}`, 'CRM_WL_ABI_EVENT_MISSING');
    }
    return item as AbiEvent;
  }

  private sleep(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  private wrapRpcError(err: unknown, scope: string): never {
    if (err instanceof LogFetchDeadlineError) throw err;
    const kind = classifyRpcLogError(err);
    const tip = describeRpcLogError(kind);
    this.logger.error(`${scope} 同步失败: ${err instanceof Error ? err.message : err}`);
    throw new BusinessException(
      `${scope}同步失败：${tip}。建议配置 BC_EXPLORER_API_KEY 或缩小起始区块`,
      'CRM_WL_SYNC_RPC_FAILED',
    );
  }

  async syncAll() {
    if (this.syncing) {
      const heldMs = Date.now() - this.syncStartedAt;
      if (heldMs < SYNC_LOCK_TTL_MS) {
        throw new BusinessException('同步进行中，请稍候再试', 'CRM_WL_SYNC_BUSY', HttpStatus.CONFLICT);
      }
      this.logger.warn(`同步锁已持有 ${heldMs}ms，强制释放`);
    }
    this.syncing = true;
    this.syncStartedAt = Date.now();
    try {
      const trader = await this.syncTrader();
      const node = await this.syncNode();
      return { trader, node };
    } finally {
      this.syncing = false;
      this.syncStartedAt = 0;
    }
  }

  /** MetaMask 写链后按 txHash 即时入库，几乎零 RPC 成本 */
  async importTx(kind: 'trader' | 'node', txHash: string) {
    const config = await this.configService.requireConfig();
    const chain = await this.resolveChain(config.chainId);
    const client = this.rpcService.getClient(chain);
    const hash = txHash as Hash;
    const receipt = await client.getTransactionReceipt({ hash });
    if (!receipt) {
      throw new BusinessException('交易回执不存在（可能尚未上链）', 'CRM_WL_TX_NOT_FOUND');
    }

    let processed = 0;
    if (kind === 'trader') {
      const abi = resolveTokenAbi(config.tokenAbiKey);
      const token = getAddress(config.tokenAddress);
      for (const log of receipt.logs) {
        if (!log.address || getAddress(log.address) !== token) continue;
        if (await this.applyTraderLog(abi, log)) processed += 1;
      }
      const block = receipt.blockNumber ?? 0n;
      if (block > 0n) await this.configService.saveSynced('trader', block);
    } else {
      const abi = CRAM_BUSINESS_ABI;
      const business = getAddress(config.businessAddress);
      for (const log of receipt.logs) {
        if (!log.address || getAddress(log.address) !== business) continue;
        if (await this.applyNodeLog(abi, log)) processed += 1;
      }
      const block = receipt.blockNumber ?? 0n;
      if (block > 0n) await this.configService.saveSynced('node', block);
    }

    return { processed, blockNumber: receipt.blockNumber?.toString() ?? null };
  }

  private async syncPart(params: {
    scope: string;
    chain: Chain;
    client: PublicClient;
    rpcUrl: string;
    contractAddress: `0x${string}`;
    methodSelector: string;
    eventTarget: `0x${string}`;
    eventName: string;
    abi: Abi;
    from: bigint;
    latest: bigint;
    syncedBlock: string;
    startBlock: string;
    save: (block: bigint) => Promise<void>;
    apply: (log: Log) => Promise<boolean>;
  }): Promise<CrmWlSyncPartResult> {
    const {
      scope,
      chain,
      client,
      rpcUrl,
      contractAddress,
      methodSelector,
      eventTarget,
      eventName,
      abi,
      from,
      latest,
      save,
      apply,
    } = params;

    let lastSaved = BigInt(params.syncedBlock || '0');
    const start = BigInt(params.startBlock || '0');
    if (lastSaved < start) lastSaved = start > 0n ? start - 1n : 0n;

    if (from > latest) {
      return { syncedTo: latest.toString(), processed: 0, skippedBlocks: [], caughtUp: true };
    }

    const span = latest - from + 1n;
    const apiKey = this.getExplorerApiKey(chain.chainId);

    // 1) 浏览器 API：按合约地址拉 txlist，只解析匹配 method 的交易（最便宜）
    if (apiKey) {
      try {
        const r = await this.syncViaExplorer({
          scope,
          chain,
          client,
          contractAddress,
          methodSelector,
          eventTarget,
          eventName,
          abi,
          from,
          latest,
          apiKey,
          save,
          apply,
        });
        if (r.processed > 0 || r.caughtUp) return r;
        this.logger.warn(`${scope} 浏览器 API 无匹配交易，回退扫块`);
      } catch (err) {
        this.logger.warn(
          `${scope} 浏览器 API 不可用: ${err instanceof Error ? err.message : err}，回退扫块`,
        );
      }
    }

    // 2) 扫块 + 回执：稀疏事件时比 getLogs 快且免费
    if (span <= RECEIPT_SCAN_MAX_SPAN) {
      return await this.syncViaReceiptScan({
        scope,
        client,
        contractAddress,
        methodSelector,
        eventTarget,
        eventName,
        abi,
        from,
        latest,
        lastSaved,
        save,
        apply,
      });
    }

    // 3) getLogs 兜底（大范围且无浏览器 API 时较慢）
    const event = this.findEvent(abi, eventName);
    return await this.syncViaGetLogs({
      scope,
      chain,
      client,
      rpcUrl,
      address: eventTarget,
      event,
      from,
      latest,
      lastSaved,
      save,
      apply,
    });
  }

  private async syncViaExplorer(p: {
    scope: string;
    chain: Chain;
    client: PublicClient;
    contractAddress: `0x${string}`;
    methodSelector: string;
    eventTarget: `0x${string}`;
    eventName: string;
    abi: Abi;
    from: bigint;
    latest: bigint;
    apiKey: string;
    save: (block: bigint) => Promise<void>;
    apply: (log: Log) => Promise<boolean>;
  }): Promise<CrmWlSyncPartResult> {
    const apiUrl = resolveExplorerApiUrl(p.chain.chainId, p.chain.explorerUrl);
    const startBlock = Number(p.from);
    const hashes: string[] = [];
    let page = 1;

    while (page <= 50) {
      const items = await fetchExplorerTxList({
        apiUrl,
        apiKey: p.apiKey,
        chainId: p.chain.chainId,
        address: p.contractAddress,
        startBlock,
        page,
        offset: 100,
      });
      if (!items.length) break;

      for (const item of items) {
        const blockNum = BigInt(item.blockNumber);
        if (blockNum < p.from || blockNum > p.latest) continue;
        if (item.isError === '1') continue;
        const input = item.input?.toLowerCase() ?? '';
        const method = item.methodId?.toLowerCase() ?? '';
        if (input.startsWith(p.methodSelector) || method === p.methodSelector) {
          hashes.push(item.hash);
        }
      }
      if (items.length < 100) break;
      page += 1;
    }

    let processed = 0;
    let lastSaved = p.from - 1n;
    for (const hash of hashes) {
      const receipt = await p.client.getTransactionReceipt({ hash: hash as Hash });
      for (const log of receipt.logs) {
        if (!log.address || getAddress(log.address) !== p.eventTarget) continue;
        if (await p.apply(log)) processed += 1;
      }
      const bn = receipt.blockNumber ?? 0n;
      if (bn > lastSaved) lastSaved = bn;
      await this.sleep(40);
    }

    if (lastSaved >= p.from) {
      await p.save(lastSaved > p.latest ? p.latest : lastSaved);
    } else if (hashes.length === 0) {
      await p.save(p.latest);
      lastSaved = p.latest;
    }

    const caughtUp = lastSaved >= p.latest;
    this.logger.log(
      `${p.scope} explorer txs=${hashes.length} processed=${processed} to=${lastSaved} caughtUp=${caughtUp}`,
    );
    return {
      syncedTo: lastSaved.toString(),
      processed,
      skippedBlocks: [],
      caughtUp,
      strategy: 'explorer',
    };
  }

  private async syncViaReceiptScan(p: {
    scope: string;
    client: PublicClient;
    contractAddress: `0x${string}`;
    methodSelector: string;
    eventTarget: `0x${string}`;
    eventName: string;
    abi: Abi;
    from: bigint;
    latest: bigint;
    lastSaved: bigint;
    save: (block: bigint) => Promise<void>;
    apply: (log: Log) => Promise<boolean>;
  }): Promise<CrmWlSyncPartResult> {
    const hardCap =
      p.from + RECEIPT_SCAN_MAX_SPAN - 1n > p.latest ? p.latest : p.from + RECEIPT_SCAN_MAX_SPAN - 1n;
    let lastSaved = p.lastSaved;
    let processed = 0;
    const blocks: bigint[] = [];
    for (let b = p.from; b <= hardCap; b++) blocks.push(b);

    this.logger.log(
      `${p.scope} receipt-scan blocks=${blocks.length} contract=${p.contractAddress.slice(0, 10)}`,
    );

    for (let i = 0; i < blocks.length; i += RECEIPT_SCAN_CONCURRENCY) {
      const batch = blocks.slice(i, i + RECEIPT_SCAN_CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (blockNum) => {
          const block = await p.client.getBlock({ blockNumber: blockNum, includeTransactions: true });
          const hits: Hash[] = [];
          for (const tx of block.transactions) {
            if (typeof tx !== 'object' || !tx.to) continue;
            if (getAddress(tx.to) !== p.contractAddress) continue;
            if (!tx.input?.toLowerCase().startsWith(p.methodSelector)) continue;
            hits.push(tx.hash);
          }
          return { blockNum, hits };
        }),
      );

      for (const { blockNum, hits } of results) {
        for (const hash of hits) {
          const receipt = await p.client.getTransactionReceipt({ hash });
          for (const log of receipt.logs) {
            if (!log.address || getAddress(log.address) !== p.eventTarget) continue;
            if (await p.apply(log)) processed += 1;
          }
        }
        lastSaved = blockNum;
      }
      await p.save(lastSaved);
      await this.sleep(RECEIPT_BLOCK_DELAY_MS);
    }

    const caughtUp = lastSaved >= p.latest;
    this.logger.log(
      `${p.scope} receipt-scan to=${lastSaved} processed=${processed} caughtUp=${caughtUp}`,
    );
    return {
      syncedTo: lastSaved.toString(),
      processed,
      skippedBlocks: [],
      caughtUp,
      strategy: 'receipt-scan',
    };
  }

  private async syncViaGetLogs(p: {
    scope: string;
    chain: Chain;
    client: PublicClient;
    rpcUrl: string;
    address: `0x${string}`;
    event: AbiEvent;
    from: bigint;
    latest: bigint;
    lastSaved: bigint;
    save: (block: bigint) => Promise<void>;
    apply: (log: Log) => Promise<boolean>;
  }): Promise<CrmWlSyncPartResult> {
    const chunkSize = this.getLogChunkSize(p.rpcUrl, p.chain.chainId);
    const delayMs = this.nestConfig.get<number>('blockchain.eventSync.logRequestDelayMs', 200);
    const hardCap =
      p.from + GETLOGS_MAX_SPAN - 1n > p.latest ? p.latest : p.from + GETLOGS_MAX_SPAN - 1n;
    const deadlineAt = Date.now() + GETLOGS_MAX_MS;

    let processed = 0;
    const skippedAll: bigint[] = [];
    let lastSaved = p.lastSaved;
    let cursor = p.from;

    this.logger.log(`${p.scope} getLogs fallback chunk=${chunkSize}`);

    try {
      while (cursor <= hardCap) {
        if (Date.now() >= deadlineAt) break;
        const to = cursor + chunkSize - 1n > hardCap ? hardCap : cursor + chunkSize - 1n;
        try {
          const { logs, skippedBlocks } = await fetchLogsAdaptive(
            (fromBlock, toBlock) =>
              this.withTimeout(
                p.client.getLogs({ address: p.address, event: p.event, fromBlock, toBlock }),
                GETLOGS_TIMEOUT_MS,
                'eth_getLogs',
              ),
            cursor,
            to,
            { requestDelayMs: Math.min(delayMs, 100), deadlineAt },
          );
          skippedAll.push(...skippedBlocks);
          for (const log of logs) {
            if (await p.apply(log)) processed += 1;
          }
          await p.save(to);
          lastSaved = to;
          cursor = to + 1n;
        } catch (err) {
          if (err instanceof LogFetchDeadlineError) break;
          throw err;
        }
      }
    } catch (err) {
      this.wrapRpcError(err, p.scope);
    }

    return {
      syncedTo: lastSaved.toString(),
      processed,
      skippedBlocks: skippedAll.map(String),
      caughtUp: lastSaved >= p.latest,
      strategy: 'getLogs',
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`${label} 超时 ${ms}ms`)), ms);
      promise.then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  async syncTrader(): Promise<CrmWlSyncPartResult> {
    const config = await this.configService.requireConfig();
    const chain = await this.resolveChain(config.chainId);
    const { client, rpcUrl } = this.rpcService.getClientForLogs(chain);
    const abi = resolveTokenAbi(config.tokenAbiKey);
    const latest = await this.rpcService.withHttpFailover(chain, (c) => c.getBlockNumber());
    const token = getAddress(config.tokenAddress);

    let from = BigInt(config.traderSyncedBlock || '0');
    const start = BigInt(config.traderStartBlock || '0');
    if (from < start) from = start;
    if (from > 0n) from = from + 1n;

    return this.syncPart({
      scope: '交易白名单',
      chain,
      client,
      rpcUrl,
      contractAddress: token,
      methodSelector: SELECTOR_TRADER,
      eventTarget: token,
      eventName: 'TraderWhitelistUpdated',
      abi,
      from,
      latest,
      syncedBlock: config.traderSyncedBlock,
      startBlock: config.traderStartBlock,
      save: (b) => this.configService.saveSynced('trader', b),
      apply: (log) => this.applyTraderLog(abi, log),
    });
  }

  async syncNode(): Promise<CrmWlSyncPartResult> {
    const config = await this.configService.requireConfig();
    const chain = await this.resolveChain(config.chainId);
    const { client, rpcUrl } = this.rpcService.getClientForLogs(chain);
    const abi = CRAM_BUSINESS_ABI;
    const latest = await this.rpcService.withHttpFailover(chain, (c) => c.getBlockNumber());
    const business = getAddress(config.businessAddress);

    let from = BigInt(config.nodeSyncedBlock || '0');
    const start = BigInt(config.nodeStartBlock || '0');
    if (from < start) from = start;
    if (from > 0n) from = from + 1n;

    return this.syncPart({
      scope: '节点白名单',
      chain,
      client,
      rpcUrl,
      contractAddress: business,
      methodSelector: SELECTOR_NODE,
      eventTarget: business,
      eventName: 'NodeWhitelistUpdated',
      abi,
      from,
      latest,
      syncedBlock: config.nodeSyncedBlock,
      startBlock: config.nodeStartBlock,
      save: (b) => this.configService.saveSynced('node', b),
      apply: (log) => this.applyNodeLog(abi, log),
    });
  }

  private async applyTraderLog(abi: Abi, log: Log): Promise<boolean> {
    let args: { trader: `0x${string}`; allowed: boolean };
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'TraderWhitelistUpdated') return false;
      args = decoded.args as unknown as { trader: `0x${string}`; allowed: boolean };
    } catch {
      return false;
    }
    const address = getAddress(args.trader);
    const blockNumber = (log.blockNumber ?? 0n).toString();
    const logIndex = Number(log.logIndex ?? 0);
    let row = await this.traderRepository.findOne({ where: { address } });
    if (!row) {
      row = this.traderRepository.create({ address });
    } else {
      const prevBlock = BigInt(row.blockNumber || '0');
      const curBlock = log.blockNumber ?? 0n;
      if (curBlock < prevBlock || (curBlock === prevBlock && logIndex < row.logIndex)) {
        return false;
      }
    }
    row.allowed = args.allowed ? 1 : 0;
    row.blockNumber = blockNumber;
    row.txHash = log.transactionHash ?? null;
    row.logIndex = logIndex;
    row.eventAt = new Date();
    await this.traderRepository.save(row);
    return true;
  }

  private async applyNodeLog(abi: Abi, log: Log): Promise<boolean> {
    let args: { account: `0x${string}`; level: number };
    try {
      const decoded = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (decoded.eventName !== 'NodeWhitelistUpdated') return false;
      args = decoded.args as unknown as { account: `0x${string}`; level: number };
    } catch {
      return false;
    }
    const address = getAddress(args.account);
    const blockNumber = (log.blockNumber ?? 0n).toString();
    const logIndex = Number(log.logIndex ?? 0);
    let row = await this.nodeRepository.findOne({ where: { address } });
    if (!row) {
      row = this.nodeRepository.create({ address });
    } else {
      const prevBlock = BigInt(row.blockNumber || '0');
      const curBlock = log.blockNumber ?? 0n;
      if (curBlock < prevBlock || (curBlock === prevBlock && logIndex < row.logIndex)) {
        return false;
      }
    }
    row.level = Number(args.level);
    row.blockNumber = blockNumber;
    row.txHash = log.transactionHash ?? null;
    row.logIndex = logIndex;
    row.eventAt = new Date();
    await this.nodeRepository.save(row);
    return true;
  }
}
