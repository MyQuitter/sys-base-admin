import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { decodeEventLog, getAddress, keccak256, toBytes, type AbiEvent, type Log, type PublicClient } from 'viem';
import { Like, Repository, type FindOperator } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { Chain } from '../../blockchain/entities/chain.entity';
import { BlockchainRpcService } from '../../blockchain/services/blockchain-rpc.service';
import { fetchLogsAdaptive, LogFetchDeadlineError } from '../../blockchain/utils/log-fetch';
import { CRAM_BUSINESS_ABI, resolveTokenAbi } from '../abi/load-abi';
import { QueryCrmTeamListDto, QueryCrmWlListDto } from '../dto/crm-wl.dto';
import { CrmTeamMember } from '../entities/crm-team-member.entity';
import { CrmWlJoin } from '../entities/crm-wl-join.entity';
import { CrmWlConfigService } from './crm-wl-config.service';

type VolumeStats = { own: bigint; direct: bigint; team: bigint; teamCount: number };

@Injectable()
export class CrmTeamService {
  private readonly referralBoundTopic = keccak256(toBytes('ReferralBound(address,address)'));
  /** V2：入金事件由 ParticipationOrderCreated 改为 ParticipationAdded */
  private readonly joinOrderTopic = keccak256(
    toBytes('ParticipationAdded(address,uint256,uint256,uint256,uint256)'),
  );
  private readonly referralBoundEvent = CRAM_BUSINESS_ABI.find(
    (item) => item.type === 'event' && 'name' in item && item.name === 'ReferralBound',
  ) as AbiEvent;
  private readonly joinOrderEvent = CRAM_BUSINESS_ABI.find(
    (item) => item.type === 'event' && 'name' in item && item.name === 'ParticipationAdded',
  ) as AbiEvent;
  private readonly zeroAddress = getAddress('0x0000000000000000000000000000000000000000');
  /** 付费 RPC 下 eth_getLogs 单次跨度；遇限流时由 fetchLogsAdaptive 自动缩小 */
  private readonly relationChunkSize = 50_000n;
  private readonly initialSyncMaxMs = 240_000;
  private joinSyncing = false;
  private metricSyncing = false;
  private readonly blockTimeMs = new Map<string, number>();

  constructor(
    private readonly configService: CrmWlConfigService,
    private readonly rpcService: BlockchainRpcService,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    @InjectRepository(CrmTeamMember)
    private readonly teamRepository: Repository<CrmTeamMember>,
    @InjectRepository(CrmWlJoin)
    private readonly joinRepository: Repository<CrmWlJoin>,
  ) {}

  private async resolveChain() {
    const config = await this.configService.requireConfig();
    const chain = await this.chainRepository.findOne({ where: { chainId: config.chainId, status: 1 } });
    if (!chain?.rpcUrls?.length) {
      throw new BusinessException('未找到启用链配置', 'CRM_TEAM_CHAIN_MISSING');
    }
    return { config, chain };
  }

  private async refreshMetricForAddress(address: string, chain: Chain, contractAddress: string, latest?: bigint) {
    const client = this.rpcService.getClient(chain);
    const overview = (await client.readContract({
      address: getAddress(contractAddress),
      abi: CRAM_BUSINESS_ABI,
      functionName: 'leaderOverview',
      args: [getAddress(address)],
    })) as [bigint, bigint, bigint, bigint, bigint, number, bigint];

    const row = await this.teamRepository.findOne({ where: { address: getAddress(address) } });
    if (!row) return null;
    // V2: (validDirectUsers, ownUsd, directUsd, teamUsd, quota, level, referralCrm)
    row.directValidUsers = overview[0].toString();
    row.ownUsd = overview[1].toString();
    row.directUsd = overview[2].toString();
    row.teamUsd = overview[3].toString();
    row.quotaUsd = overview[4].toString();
    row.nodeLevel = Number(overview[5]);
    row.referralCrm = overview[6].toString();
    row.lastMetricBlock = (latest ?? 0n).toString();
    return this.teamRepository.save(row);
  }

  private applyOverview(row: CrmTeamMember, overview: [bigint, bigint, bigint, bigint, bigint, number, bigint], latest: bigint) {
    row.directValidUsers = overview[0].toString();
    row.ownUsd = overview[1].toString();
    row.directUsd = overview[2].toString();
    row.teamUsd = overview[3].toString();
    row.quotaUsd = overview[4].toString();
    row.nodeLevel = Number(overview[5]);
    row.referralCrm = overview[6].toString();
    row.lastMetricBlock = latest.toString();
    return row;
  }

  private async refreshMetricsBatch(items: CrmTeamMember[], chain: Chain, contractAddress: string, latest: bigint) {
    if (!items.length) return items;
    const client = this.rpcService.getClient(chain);
    const contract = getAddress(contractAddress);
    const results = await client.multicall({
      contracts: items.map((item) => ({
        address: contract,
        abi: CRAM_BUSINESS_ABI,
        functionName: 'leaderOverview' as const,
        args: [getAddress(item.address)] as const,
      })),
      allowFailure: true,
    });

    const refreshed: CrmTeamMember[] = [];
    for (let i = 0; i < items.length; i++) {
      const result = results[i];
      if (result.status !== 'success') {
        refreshed.push(items[i]);
        continue;
      }
      const row = this.applyOverview(items[i], result.result as [bigint, bigint, bigint, bigint, bigint, number, bigint], latest);
      refreshed.push(await this.teamRepository.save(row));
    }
    return refreshed;
  }

  /** 链上额度 / 节点 / 有效直推写入库，不覆盖入金汇总的个人/直推/团队业绩 */
  private async refreshChainExtrasBatch(items: CrmTeamMember[], chain: Chain, contractAddress: string, latest: bigint) {
    if (!items.length) return { updated: 0, failed: 0 };
    const client = this.rpcService.getClient(chain);
    const contract = getAddress(contractAddress);
    const results = await client.multicall({
      contracts: items.map((item) => ({
        address: contract,
        abi: CRAM_BUSINESS_ABI,
        functionName: 'leaderOverview' as const,
        args: [getAddress(item.address)] as const,
      })),
      allowFailure: true,
    });
    let updated = 0;
    let failed = 0;
    for (let i = 0; i < items.length; i++) {
      const result = results[i];
      if (result.status !== 'success') {
        failed += 1;
        continue;
      }
      const overview = result.result as [bigint, bigint, bigint, bigint, bigint, number, bigint];
      const row = items[i];
      row.directValidUsers = overview[0].toString();
      row.quotaUsd = overview[4].toString();
      row.nodeLevel = Number(overview[5]);
      row.referralCrm = overview[6].toString();
      row.lastMetricBlock = latest.toString();
      await this.teamRepository.save(row);
      updated += 1;
    }
    return { updated, failed };
  }

  private buildAddressFilter(keyword?: string): string | FindOperator<string> | undefined {
    const trimmed = keyword?.trim();
    if (!trimmed) return undefined;
    if (/^0x[a-fA-F0-9]{40}$/.test(trimmed)) {
      try {
        return getAddress(trimmed);
      } catch {
        /* fall through */
      }
    }
    const lower = trimmed.toLowerCase();
    if (/^0x[a-fA-F0-9]+$/.test(lower)) {
      return Like(`${lower}%`);
    }
    return Like(`%${lower}%`);
  }

  private async resolveRewardsModule(
    chain: Chain,
    tokenAddress: string,
    tokenAbiKey: string,
    businessAddress?: string,
  ): Promise<`0x${string}`> {
    const client = this.rpcService.getClient(chain);
    const token = getAddress(tokenAddress);

    const bytecode = await client.getBytecode({ address: token });
    if (!bytecode || bytecode === '0x') {
      throw new BusinessException(
        `Token 地址 ${token} 在当前链上不是合约，请检查 Chain ID 与 Token 地址是否填反`,
        'CRM_TEAM_TOKEN_NOT_CONTRACT',
      );
    }

    const tokenAbi = resolveTokenAbi(tokenAbiKey);
    try {
      const module = (await client.readContract({
        address: token,
        abi: tokenAbi,
        functionName: 'rewardsModule',
      })) as `0x${string}`;
      if (module && module.toLowerCase() !== this.zeroAddress.toLowerCase()) {
        return getAddress(module);
      }
    } catch {
      /* Token 无 rewardsModule 或未绑定，回退 businessAddress */
    }

    if (businessAddress?.trim()) {
      const business = getAddress(businessAddress.trim());
      const businessCode = await client.getBytecode({ address: business });
      if (!businessCode || businessCode === '0x') {
        throw new BusinessException(
          `Business 地址 ${business} 在当前链上不是合约`,
          'CRM_TEAM_BUSINESS_NOT_CONTRACT',
        );
      }
      return business;
    }

    throw new BusinessException(
      `无法解析团队合约：Token ${token} 未绑定 rewardsModule，且未配置 Business 地址。请确认 Token / Business 未填反，且 Token ABI 与部署版本一致`,
      'CRM_TEAM_REWARDS_MODULE_MISSING',
    );
  }

  private async ensureMember(address: string) {
    const checksum = getAddress(address);
    const existing = await this.teamRepository.findOne({ where: { address: checksum } });
    if (existing) return existing;
    return this.teamRepository.save(
      this.teamRepository.create({
        address: checksum,
        depth: 1,
        ancestorPath: '',
      }),
    );
  }

  private async bubbleLayer(inviterAddress: string, childLayer: number) {
    let currentAddr: string | null = inviterAddress;
    let need = childLayer + 1;
    while (currentAddr) {
      const current = await this.teamRepository.findOne({ where: { address: currentAddr } });
      if (!current) break;
      if (current.depth >= need) break;
      current.depth = need;
      await this.teamRepository.save(current);
      currentAddr = current.inviterAddress ?? null;
      need += 1;
    }
  }

  private async applyBind(address: string, inviterAddress: string, log: Log) {
    const existing = await this.ensureMember(address);
    if (existing.bindBlockNumber && BigInt(existing.bindBlockNumber) > 0n) {
      return;
    }
    const inviter = await this.ensureMember(inviterAddress);
    existing.inviterAddress = inviterAddress;
    existing.ancestorPath = [inviter.ancestorPath, inviter.address].filter(Boolean).join('/');
    if (!existing.depth || existing.depth < 1) existing.depth = 1;
    existing.bindBlockNumber = (log.blockNumber ?? 0n).toString();
    existing.bindTxHash = log.transactionHash ?? null;
    await this.teamRepository.save(existing);
    await this.bubbleLayer(inviterAddress, existing.depth);
  }

  private async computeLayerMap() {
    const rows = await this.teamRepository.find();
    const children = new Map<string, string[]>();
    for (const row of rows) {
      if (!row.inviterAddress) continue;
      const list = children.get(row.inviterAddress) ?? [];
      list.push(row.address);
      children.set(row.inviterAddress, list);
    }
    const memo = new Map<string, number>();
    const visiting = new Set<string>();
    const layerOf = (addr: string): number => {
      const cached = memo.get(addr);
      if (cached !== undefined) return cached;
      if (visiting.has(addr)) return 1;
      visiting.add(addr);
      const kids = children.get(addr) ?? [];
      const layer = kids.length ? 1 + Math.max(...kids.map(layerOf)) : 1;
      visiting.delete(addr);
      memo.set(addr, layer);
      return layer;
    };
    for (const row of rows) layerOf(row.address);
    return memo;
  }

  private async rebuildLayers() {
    const layers = await this.computeLayerMap();
    const rows = await this.teamRepository.find();
    for (const row of rows) {
      const layer = layers.get(row.address) ?? 1;
      if (row.depth !== layer) {
        row.depth = layer;
        await this.teamRepository.save(row);
      }
    }
    return layers;
  }

  private async applyRelationLog(log: Log) {
    const decoded = decodeEventLog({
      abi: CRAM_BUSINESS_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'ReferralBound') return;
    const args = decoded.args as unknown as { user: `0x${string}`; inviter: `0x${string}` };
    await this.applyBind(getAddress(args.user), getAddress(args.inviter), log);
  }

  /**
   * 将 ParticipationAdded 落成入金记录（按 participationId 幂等）。
   */
  private async upsertJoin(log: Log): Promise<{ address: string; deltaUsd: bigint; deltaBnb: bigint } | null> {
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: CRAM_BUSINESS_ABI,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      return null;
    }
    if (decoded.eventName !== 'ParticipationAdded') return null;
    const args = decoded.args as unknown as {
      user: `0x${string}`;
      participationId: bigint;
      bnbAmount: bigint;
      participationUsd: bigint;
      quotaUsd: bigint;
    };
    const participationId = args.participationId.toString();
    let row = await this.joinRepository.findOne({ where: { participationId } });
    const existed = Boolean(row);
    if (!row) {
      row = this.joinRepository.create({ participationId });
    }
    const prevUsd = existed ? this.parseUsd(row.participationUsd) : 0n;
    const prevBnb = existed ? this.parseUsd(row.bnbAmount) : 0n;
    row.address = getAddress(args.user);
    row.bnbAmount = args.bnbAmount.toString();
    row.participationUsd = args.participationUsd.toString();
    row.quotaUsd = args.quotaUsd.toString();
    row.blockNumber = (log.blockNumber ?? 0n).toString();
    row.txHash = log.transactionHash ?? null;
    row.logIndex = Number(log.logIndex ?? 0);
    row.eventAt = await this.resolveJoinEventAt(log);
    await this.joinRepository.save(row);
    await this.ensureMember(row.address);
    return {
      address: row.address,
      deltaUsd: args.participationUsd - prevUsd,
      deltaBnb: args.bnbAmount - prevBnb,
    };
  }

  private async applyJoinLog(log: Log, chain: Chain, rewardsModule: `0x${string}`) {
    const client = this.rpcService.getClient(chain);
    await this.rememberLogTimes(client, [log]);
    const volumeDelta = await this.upsertJoin(log);
    const decoded = decodeEventLog({
      abi: CRAM_BUSINESS_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'ParticipationAdded') return volumeDelta;
    const args = decoded.args as unknown as { user: `0x${string}` };
    const address = getAddress(args.user);
    const row = await this.ensureMember(address);
    if (row.inviterAddress) return volumeDelta;

    const referrer = getAddress(
      (await client.readContract({
        address: rewardsModule,
        abi: CRAM_BUSINESS_ABI,
        functionName: 'referrer',
        args: [address],
      })) as `0x${string}`,
    );
    if (referrer === this.zeroAddress) return volumeDelta;
    await this.applyBind(address, referrer, log);
    return volumeDelta;
  }

  private async applyTeamLog(log: Log, chain: Chain, rewardsModule: `0x${string}`) {
    const topic = (log.topics?.[0] || '').toLowerCase();
    if (topic === this.referralBoundTopic.toLowerCase()) {
      await this.applyRelationLog(log);
      return { processed: 1, join: 0, bind: 1, volumeDelta: null as { address: string; deltaUsd: bigint; deltaBnb: bigint } | null };
    }
    if (topic === this.joinOrderTopic.toLowerCase()) {
      const volumeDelta = await this.applyJoinLog(log, chain, rewardsModule);
      return { processed: 1, join: 1, bind: 0, volumeDelta };
    }
    return { processed: 0, join: 0, bind: 0, volumeDelta: null as { address: string; deltaUsd: bigint; deltaBnb: bigint } | null };
  }

  /** Webhook/WSS 入金后只把业绩差额写回成员表，不驱动管理页 */
  private async bumpJoinVolumes(address: string, deltaUsd: bigint, deltaBnb: bigint) {
    if (deltaUsd === 0n && deltaBnb === 0n) return;
    const user = await this.ensureMember(address);
    user.ownUsd = (this.parseUsd(user.ownUsd) + deltaUsd).toString();
    user.ownBnb = (this.parseUsd(user.ownBnb) + deltaBnb).toString();
    await this.teamRepository.save(user);

    if (user.inviterAddress) {
      const parent = await this.teamRepository.findOne({ where: { address: user.inviterAddress } });
      if (parent) {
        parent.directUsd = (this.parseUsd(parent.directUsd) + deltaUsd).toString();
        parent.teamUsd = (this.parseUsd(parent.teamUsd) + deltaUsd).toString();
        parent.directBnb = (this.parseUsd(parent.directBnb) + deltaBnb).toString();
        parent.teamBnb = (this.parseUsd(parent.teamBnb) + deltaBnb).toString();
        await this.teamRepository.save(parent);
      }
    }

    const skip = new Set<string>(user.inviterAddress ? [user.inviterAddress] : []);
    const path = (user.ancestorPath || '').split('/').filter(Boolean);
    for (const raw of path) {
      let addr: string;
      try {
        addr = getAddress(raw);
      } catch {
        continue;
      }
      if (skip.has(addr)) continue;
      skip.add(addr);
      const anc = await this.teamRepository.findOne({ where: { address: addr } });
      if (!anc) continue;
      anc.teamUsd = (this.parseUsd(anc.teamUsd) + deltaUsd).toString();
      anc.teamBnb = (this.parseUsd(anc.teamBnb) + deltaBnb).toString();
      await this.teamRepository.save(anc);
    }
  }

  /**
   * 将链上日志写入入金表 / 团队关系（幂等）。供首次扫块之后的 Webhook / WSS / 轮询调用。
   */
  async ingestBusinessLogs(logs: Log[]) {
    if (!logs.length) {
      return { processed: 0, joins: 0, binds: 0 };
    }
    const { config, chain } = await this.resolveChain();
    const rewardsModule = await this.resolveRewardsModule(
      chain,
      config.tokenAddress,
      config.tokenAbiKey,
      config.businessAddress,
    );
    const sorted = this.sortLogs(logs);
    const client = this.rpcService.getClient(chain);
    await this.rememberLogTimes(client, sorted);
    let processed = 0;
    let joins = 0;
    let binds = 0;
    let maxJoinBlock = 0n;
    let maxBindBlock = 0n;
    const joinDeltas: Array<{ address: string; deltaUsd: bigint; deltaBnb: bigint }> = [];
    for (const log of sorted) {
      if (log.address && getAddress(log.address) !== rewardsModule) continue;
      const part = await this.applyTeamLog(log, chain, rewardsModule);
      processed += part.processed;
      joins += part.join;
      binds += part.bind;
      if (part.volumeDelta && (part.volumeDelta.deltaUsd !== 0n || part.volumeDelta.deltaBnb !== 0n)) {
        joinDeltas.push(part.volumeDelta);
      }
      const bn = log.blockNumber ?? 0n;
      if (part.join && bn > maxJoinBlock) maxJoinBlock = bn;
      if (part.bind && bn > maxBindBlock) maxBindBlock = bn;
    }
    if (maxJoinBlock > 0n) await this.configService.saveSyncedIfAhead('join', maxJoinBlock);
    if (maxBindBlock > 0n) await this.configService.saveSyncedIfAhead('relation', maxBindBlock);
    if (binds > 0) await this.rebuildLayers();
    if (binds > 0) {
      await this.persistVolumesFromJoins();
    } else {
      for (const item of joinDeltas) {
        await this.bumpJoinVolumes(item.address, item.deltaUsd, item.deltaBnb);
      }
    }
    return { processed, joins, binds };
  }

  private sortLogs(logs: Log[]) {
    return [...logs].sort((a, b) => {
      const blockDelta = (a.blockNumber ?? 0n) - (b.blockNumber ?? 0n);
      if (blockDelta !== 0n) return blockDelta > 0n ? 1 : -1;
      const indexDelta = Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
      return indexDelta > 0n ? 1 : indexDelta < 0n ? -1 : 0;
    });
  }

  private logBlockTimestamp(log: Log): Date | null {
    const raw = (log as Log & { blockTimestamp?: bigint | number | string }).blockTimestamp;
    if (raw == null) return null;
    const sec = Number(raw);
    if (!Number.isFinite(sec) || sec <= 0) return null;
    return new Date(sec * 1000);
  }

  private async rememberLogTimes(client: PublicClient, logs: Log[]) {
    const missing: bigint[] = [];
    const seen = new Set<string>();
    for (const log of logs) {
      const fromLog = this.logBlockTimestamp(log);
      const bn = log.blockNumber;
      if (bn == null) continue;
      const key = bn.toString();
      if (fromLog) {
        this.blockTimeMs.set(key, fromLog.getTime());
        continue;
      }
      if (this.blockTimeMs.has(key) || seen.has(key)) continue;
      seen.add(key);
      missing.push(bn);
    }
    for (let i = 0; i < missing.length; i += 10) {
      const chunk = missing.slice(i, i + 10);
      const fetched = await Promise.all(
        chunk.map(async (blockNumber) => {
          try {
            const block = await client.getBlock({ blockNumber });
            return { key: blockNumber.toString(), ms: Number(block.timestamp) * 1000 };
          } catch {
            return null;
          }
        }),
      );
      for (const item of fetched) {
        if (!item || !Number.isFinite(item.ms) || item.ms <= 0) continue;
        this.blockTimeMs.set(item.key, item.ms);
      }
    }
    if (this.blockTimeMs.size > 8000) this.blockTimeMs.clear();
  }

  private async resolveJoinEventAt(log: Log): Promise<Date> {
    const fromLog = this.logBlockTimestamp(log);
    if (fromLog) return fromLog;
    const bn = log.blockNumber?.toString();
    if (bn) {
      const ms = this.blockTimeMs.get(bn);
      if (ms != null) return new Date(ms);
    }
    return new Date();
  }

  private async scanTeamEventsByLogs(params: {
    from: bigint;
    to: bigint;
    tokenAddress: string;
    tokenAbiKey: string;
    businessAddress: string;
    chain: Chain;
    deadlineAt: number;
  }) {
    const rewardsModule = await this.resolveRewardsModule(
      params.chain,
      params.tokenAddress,
      params.tokenAbiKey,
      params.businessAddress,
    );
    const { client } = this.rpcService.getClientForLogs(params.chain);
    const [bound, joins] = await Promise.all([
      fetchLogsAdaptive(
        (fromBlock, toBlock) =>
          client.getLogs({
            address: rewardsModule,
            event: this.referralBoundEvent,
            fromBlock,
            toBlock,
          }),
        params.from,
        params.to,
        { deadlineAt: params.deadlineAt },
      ),
      fetchLogsAdaptive(
        (fromBlock, toBlock) =>
          client.getLogs({
            address: rewardsModule,
            event: this.joinOrderEvent,
            fromBlock,
            toBlock,
          }),
        params.from,
        params.to,
        { deadlineAt: params.deadlineAt },
      ),
    ]);
    const logs = this.sortLogs([...bound.logs, ...joins.logs]);
    await this.rememberLogTimes(client, logs);
    let processed = 0;
    for (const log of logs) {
      processed += (await this.applyTeamLog(log, params.chain, rewardsModule)).processed;
    }
    return { processed, scannedTo: params.to };
  }

  private async scanTeamEventsByReceipts(params: {
    from: bigint;
    to: bigint;
    tokenAddress: string;
    tokenAbiKey: string;
    businessAddress: string;
    chain: Chain;
  }) {
    const client = this.rpcService.getClient(params.chain);
    const token = getAddress(params.tokenAddress);
    const rewardsModule = await this.resolveRewardsModule(
      params.chain,
      params.tokenAddress,
      params.tokenAbiKey,
      params.businessAddress,
    );
    let processed = 0;
    let scannedTo = params.from > 0n ? params.from - 1n : 0n;

    for (let blockNum = params.from; blockNum <= params.to; blockNum++) {
      const block = await client.getBlock({ blockNumber: blockNum, includeTransactions: true });
      this.blockTimeMs.set(blockNum.toString(), Number(block.timestamp) * 1000);
      for (const tx of block.transactions) {
        if (typeof tx !== 'object' || !tx.to) continue;
        if (getAddress(tx.to) !== token) continue;
        const receipt = await client.getTransactionReceipt({ hash: tx.hash });
        for (const log of receipt.logs) {
          if (!log.address || getAddress(log.address) !== rewardsModule) continue;
          processed += (await this.applyTeamLog(log, params.chain, rewardsModule)).processed;
        }
      }
      scannedTo = blockNum;
    }

    return { processed, scannedTo };
  }

  async syncRelations() {
    const { config, chain } = await this.resolveChain();
    const client = this.rpcService.getClient(chain);
    const latest = await client.getBlockNumber();
    const start = BigInt(config.relationStartBlock || '0');
    let from = BigInt(config.relationSyncedBlock || '0');
    const total = await this.teamRepository.count();
    if (total === 0 && from > start) {
      from = start > 0n ? start - 1n : 0n;
    }
    if (from < start) from = start > 0n ? start - 1n : 0n;
    if (from > 0n) from = from + 1n;
    if (from > latest) {
      return { syncedTo: latest.toString(), processed: 0, caughtUp: true };
    }

    const startedAt = Date.now();
    const deadlineAt = startedAt + this.initialSyncMaxMs;
    let cursor = from;
    let processed = 0;
    let scannedTo = from > 0n ? from - 1n : 0n;

    while (cursor <= latest) {
      if (Date.now() >= deadlineAt) break;
      const to = cursor + this.relationChunkSize - 1n > latest ? latest : cursor + this.relationChunkSize - 1n;
      try {
        const part = await this.scanTeamEventsByLogs({
          from: cursor,
          to,
          tokenAddress: config.tokenAddress,
          tokenAbiKey: config.tokenAbiKey,
          businessAddress: config.businessAddress,
          chain,
          deadlineAt,
        });
        processed += part.processed;
        scannedTo = part.scannedTo;
      } catch (err) {
        if (err instanceof LogFetchDeadlineError) break;
        if (to - cursor + 1n > 500n) {
          throw new BusinessException(
            `团队关系 getLogs 失败：${err instanceof Error ? err.message : String(err)}`,
            'CRM_TEAM_SYNC_LOGS_FAILED',
          );
        }
        const part = await this.scanTeamEventsByReceipts({
          from: cursor,
          to,
          tokenAddress: config.tokenAddress,
          tokenAbiKey: config.tokenAbiKey,
          businessAddress: config.businessAddress,
          chain,
        });
        processed += part.processed;
        scannedTo = part.scannedTo;
      }
      await this.configService.saveSynced('relation', scannedTo);
      if (scannedTo >= latest) break;
      cursor = scannedTo + 1n;
    }

    await this.rebuildLayers();
    return { syncedTo: scannedTo.toString(), processed, caughtUp: scannedTo >= latest };
  }

  /**
   * 只扫 ParticipationAdded，写入入金记录表。起始块与团队关系相同。
   */
  async syncJoins() {
    if (this.joinSyncing) {
      throw new BusinessException('同步进行中，请稍候再试', 'CRM_JOIN_SYNC_BUSY', HttpStatus.CONFLICT);
    }
    if (!this.joinOrderEvent) {
      throw new BusinessException('Business ABI 缺少 ParticipationAdded', 'CRM_JOIN_EVENT_MISSING');
    }
    this.joinSyncing = true;
    try {
      return await this.syncJoinsUnlocked();
    } finally {
      this.joinSyncing = false;
    }
  }

  private async syncJoinsUnlocked() {
    const { config, chain } = await this.resolveChain();
    const client = this.rpcService.getClient(chain);
    const latest = await client.getBlockNumber();
    const start = BigInt(config.relationStartBlock || '0');
    let from = BigInt(config.joinSyncedBlock || '0');
    const total = await this.joinRepository.count();
    if (total === 0 && from > start) {
      from = start > 0n ? start - 1n : 0n;
    }
    if (from < start) from = start > 0n ? start - 1n : 0n;
    if (from > 0n) from = from + 1n;
    if (from > latest) {
      return { syncedTo: latest.toString(), processed: 0, caughtUp: true };
    }

    const rewardsModule = await this.resolveRewardsModule(
      chain,
      config.tokenAddress,
      config.tokenAbiKey,
      config.businessAddress,
    );
    const { client: logClient } = this.rpcService.getClientForLogs(chain);
    const startedAt = Date.now();
    const deadlineAt = startedAt + this.initialSyncMaxMs;
    let cursor = from;
    let processed = 0;
    let scannedTo = from > 0n ? from - 1n : 0n;

    while (cursor <= latest) {
      if (Date.now() >= deadlineAt) break;
      const to = cursor + this.relationChunkSize - 1n > latest ? latest : cursor + this.relationChunkSize - 1n;
      try {
        const { logs } = await fetchLogsAdaptive(
          (fromBlock, toBlock) =>
            logClient.getLogs({
              address: rewardsModule,
              event: this.joinOrderEvent,
              fromBlock,
              toBlock,
            }),
          cursor,
          to,
          { deadlineAt },
        );
        const sorted = this.sortLogs(logs);
        await this.rememberLogTimes(client, sorted);
        for (const log of sorted) {
          await this.upsertJoin(log);
          processed += 1;
        }
        scannedTo = to;
      } catch (err) {
        if (err instanceof LogFetchDeadlineError) break;
        throw new BusinessException(
          `入金记录 getLogs 失败：${err instanceof Error ? err.message : String(err)}`,
          'CRM_JOIN_SYNC_LOGS_FAILED',
        );
      }
      await this.configService.saveSynced('join', scannedTo);
      if (scannedTo >= latest) break;
      cursor = scannedTo + 1n;
    }

    return { syncedTo: scannedTo.toString(), processed, caughtUp: scannedTo >= latest };
  }

  async listJoins(query: QueryCrmWlListDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.joinRepository.createQueryBuilder('j').orderBy('j.id', 'DESC').skip(skip).take(pageSize);
    if (query.address?.trim()) {
      qb.andWhere('j.address LIKE :addr', { addr: `%${query.address.trim()}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return toPageResult(
      items.map((r) => ({
        id: r.id,
        address: r.address,
        participationId: r.participationId,
        bnbAmount: r.bnbAmount,
        participationUsd: r.participationUsd,
        quotaUsd: r.quotaUsd,
        blockNumber: r.blockNumber,
        txHash: r.txHash,
        eventAt: r.eventAt,
        updatedAt: r.updatedAt,
      })),
      total,
      page,
      pageSize,
    );
  }

  async listMembers(query: QueryCrmTeamListDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    const addressFilter = this.buildAddressFilter(query.address);
    const inviterFilter = this.buildAddressFilter(query.inviterAddress);
    if (addressFilter) where.address = addressFilter;
    if (inviterFilter) where.inviterAddress = inviterFilter;

    const [items, total] = await this.teamRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });

    let rows = items;
    if (query.refreshMetrics) {
      const { config, chain } = await this.resolveChain();
      const latest = await this.rpcService.getClient(chain).getBlockNumber();
      const rewardsModule = await this.resolveRewardsModule(
        chain,
        config.tokenAddress,
        config.tokenAbiKey,
        config.businessAddress,
      );
      rows = await this.refreshMetricsBatch(items, chain, rewardsModule, latest);
    }

    return toPageResult(
      rows.map((item) => this.toMemberVo(item)),
      total,
      page,
      pageSize,
    );
  }

  private toMemberVo(r: CrmTeamMember) {
    return {
      id: r.id,
      address: r.address,
      inviterAddress: r.inviterAddress,
      ancestorPath: r.ancestorPath,
      depth: r.depth,
      bindBlockNumber: r.bindBlockNumber,
      bindTxHash: r.bindTxHash,
      directValidUsers: r.directValidUsers,
      ownUsd: r.ownUsd,
      directUsd: r.directUsd,
      teamUsd: r.teamUsd,
      ownBnb: r.ownBnb ?? '0',
      directBnb: r.directBnb ?? '0',
      teamBnb: r.teamBnb ?? '0',
      quotaUsd: r.quotaUsd,
      nodeLevel: r.nodeLevel,
      referralCrm: r.referralCrm,
      updatedAt: r.updatedAt,
    };
  }

  private createShadowMember(address: string, updatedAt?: Date) {
    return this.teamRepository.create({
      address,
      inviterAddress: null,
      ancestorPath: '',
      depth: 1,
      bindBlockNumber: '0',
      bindTxHash: null,
      lastMetricBlock: '0',
      directValidUsers: '0',
      ownUsd: '0',
      directUsd: '0',
      teamUsd: '0',
      ownBnb: '0',
      directBnb: '0',
      teamBnb: '0',
      quotaUsd: '0',
      nodeLevel: 0,
      referralCrm: '0',
      updatedAt: updatedAt ?? new Date(0),
    });
  }

  async overview(address: string) {
    const checksum = getAddress(address);
    const row = await this.teamRepository.findOne({ where: { address: checksum } });
    if (!row) {
      throw new BusinessException('该地址尚未索引到团队关系', 'CRM_TEAM_MEMBER_NOT_FOUND');
    }
    const { config, chain } = await this.resolveChain();
    const client = this.rpcService.getClient(chain);
    const latest = await client.getBlockNumber();
    const rewardsModule = await this.resolveRewardsModule(
      chain,
      config.tokenAddress,
      config.tokenAbiKey,
      config.businessAddress,
    );
    const refreshed = await this.refreshMetricForAddress(checksum, chain, rewardsModule, latest);

    // 账户级账本视图：用于补齐“订单数/额度/待领/已领/返佣”等明细字段
    const accountOverview = await client.readContract({
      address: rewardsModule,
      abi: CRAM_BUSINESS_ABI,
      functionName: 'accountOverview',
      args: [checksum],
    });

    const parent = row.inviterAddress ? await this.teamRepository.findOne({ where: { address: row.inviterAddress } }) : null;
    const children = await this.teamRepository.find({
      where: { inviterAddress: checksum },
      order: { id: 'ASC' },
      take: 200,
    });
    const inviterVo = row.inviterAddress
      ? this.toMemberVo(parent ?? this.createShadowMember(row.inviterAddress, row.updatedAt))
      : null;

    // viem 对 tuple 的返回形态在不同 ABI/版本下可能是数组或对象（字段名）。
    // 为避免运行时“非可迭代”解构错误，这里做兼容解析。
    const ov: any = accountOverview as any;
    const isArr = Array.isArray(ov);
    const get = (key: string, idx: number) => (isArr ? ov?.[idx] : ov?.[key]);

    const toBig = (v: unknown): bigint => {
      if (typeof v === 'bigint') return v;
      if (v === null || v === undefined) return 0n;
      try {
        return BigInt(v as any);
      } catch {
        return 0n;
      }
    };

    const toNum = (v: unknown): number => {
      if (typeof v === 'number') return v;
      if (v === null || v === undefined) return 0;
      try {
        return Number(v);
      } catch {
        return 0;
      }
    };

    const referrer: string | undefined = get('referrer', 0) ?? (get('info', 0) as string | undefined);
    const participations = toBig(get('participations', 1));
    const contributedBnb = toBig(get('contributedBnb', 2));
    const participationUsd = toBig(get('participationUsd', 3));
    const quotaUsd = toBig(get('quotaUsd', 4));
    const orderQuotaUsd = toBig(get('orderQuotaUsd', 5));
    const claimedRewardUsd = toBig(get('claimedRewardUsd', 6));
    const directValidUsers = toBig(get('directValidUsers', 7));
    const directParticipationUsd = toBig(get('directParticipationUsd', 8));
    const teamParticipationUsd = toBig(get('teamParticipationUsd', 9));
    const pendingStaticCrm = toBig(get('pendingStaticCrm', 10));
    const pendingNodeCrm = toBig(get('pendingNodeCrm', 11));
    const claimableCrm = toBig(get('claimableCrm', 12));
    const referralCrmEarned = toBig(get('referralCrmEarned', 13));
    const nodeClaimedCrm = toBig(get('nodeClaimedCrm', 14));
    const crmUsdPrice = toBig(get('crmUsdPrice', 15));
    const nodeLevel = toNum(get('nodeLevel', 16));
    const exited = Boolean(get('exited', 17));
    const isValidUser = Boolean(get('isValidUser', 18));
    const priceReady = Boolean(get('priceReady', 19));
    const remainingQuotaUsd = toBig(get('remainingQuotaUsd', 20));
    const openOrders = toBig(get('openOrders', 21));

    const baseMember = this.toMemberVo(refreshed ?? row);
    const memberVo = {
      ...baseMember,
      inviterAddress: referrer ?? baseMember.inviterAddress,
      quotaUsd: quotaUsd.toString(),
      directValidUsers: directValidUsers.toString(),
      referralCrm: referralCrmEarned.toString(),
      nodeLevel: nodeLevel > 0 ? nodeLevel : baseMember.nodeLevel,
      participations: participations.toString(),
      contributedBnb: contributedBnb.toString(),
      participationUsd: participationUsd.toString(),
      orderQuotaUsd: orderQuotaUsd.toString(),
      claimedRewardUsd: claimedRewardUsd.toString(),
      directParticipationUsd: directParticipationUsd.toString(),
      teamParticipationUsd: teamParticipationUsd.toString(),
      pendingStaticCrm: pendingStaticCrm.toString(),
      pendingNodeCrm: pendingNodeCrm.toString(),
      claimableCrm: claimableCrm.toString(),
      referralCrmEarned: referralCrmEarned.toString(),
      nodeClaimedCrm: nodeClaimedCrm.toString(),
      crmUsdPrice: crmUsdPrice.toString(),
      exited,
      isValidUser,
      priceReady,
      remainingQuotaUsd: remainingQuotaUsd.toString(),
      openOrders: openOrders.toString(),
    };

    return {
      member: memberVo,
      inviter: inviterVo,
      children: children.map((x) => this.toMemberVo(x)),
    };
  }

  private parseUsd(v?: string | null) {
    if (!v) return 0n;
    try {
      return BigInt(String(v).split('.')[0] || '0');
    } catch {
      return 0n;
    }
  }

  private buildVolumeStats(people: CrmTeamMember[], ownMap: Map<string, bigint>) {
    const children = new Map<string, string[]>();
    for (const p of people) {
      if (!p.inviterAddress) continue;
      const list = children.get(p.inviterAddress) ?? [];
      list.push(p.address);
      children.set(p.inviterAddress, list);
    }
    const memo = new Map<string, VolumeStats>();
    const visiting = new Set<string>();
    const statsOf = (addr: string): VolumeStats => {
      const cached = memo.get(addr);
      if (cached) return cached;
      if (visiting.has(addr)) {
        return { own: ownMap.get(addr) ?? 0n, direct: 0n, team: 0n, teamCount: 0 };
      }
      visiting.add(addr);
      const kids = children.get(addr) ?? [];
      let direct = 0n;
      let team = 0n;
      let teamCount = kids.length;
      for (const kid of kids) {
        const child = statsOf(kid);
        direct += child.own;
        team += child.own + child.team;
        teamCount += child.teamCount;
      }
      visiting.delete(addr);
      const out = { own: ownMap.get(addr) ?? 0n, direct, team, teamCount };
      memo.set(addr, out);
      return out;
    };
    return { children, statsOf };
  }

  private async persistVolumeStats(
    people: CrmTeamMember[],
    usdOf: (addr: string) => VolumeStats,
    bnbOf: (addr: string) => VolumeStats,
  ) {
    let written = 0;
    for (const p of people) {
      const usd = usdOf(p.address);
      const bnb = bnbOf(p.address);
      const ownUsd = usd.own.toString();
      const directUsd = usd.direct.toString();
      const teamUsd = usd.team.toString();
      const ownBnb = bnb.own.toString();
      const directBnb = bnb.direct.toString();
      const teamBnb = bnb.team.toString();
      if (
        p.ownUsd === ownUsd &&
        p.directUsd === directUsd &&
        p.teamUsd === teamUsd &&
        (p.ownBnb ?? '0') === ownBnb &&
        (p.directBnb ?? '0') === directBnb &&
        (p.teamBnb ?? '0') === teamBnb
      ) {
        continue;
      }
      p.ownUsd = ownUsd;
      p.directUsd = directUsd;
      p.teamUsd = teamUsd;
      p.ownBnb = ownBnb;
      p.directBnb = directBnb;
      p.teamBnb = teamBnb;
      await this.teamRepository.save(p);
      written += 1;
    }
    return written;
  }

  /** 全员按入金+推荐关系汇总个人/直推/团队业绩并落库 */
  private async persistVolumesFromJoins() {
    const people = await this.teamRepository.find();
    if (!people.length) return 0;
    const { usd, bnb } = await this.sumJoinsByAddress(people.map((p) => p.address));
    const usdStats = this.buildVolumeStats(people, usd);
    const bnbStats = this.buildVolumeStats(people, bnb);
    await this.persistVolumeStats(people, usdStats.statsOf, bnbStats.statsOf);
    return people.length;
  }

  /** 全量刷新：层级 + 入金业绩入库 + 链上额度/节点/有效直推入库 */
  async syncMetrics() {
    if (this.metricSyncing) {
      throw new BusinessException('业绩刷新进行中，请稍候再试', 'CRM_TEAM_METRIC_SYNC_BUSY', HttpStatus.CONFLICT);
    }
    this.metricSyncing = true;
    try {
      await this.rebuildLayers();
      const volumeUpdated = await this.persistVolumesFromJoins();
      const { config, chain } = await this.resolveChain();
      const latest = await this.rpcService.getClient(chain).getBlockNumber();
      const rewardsModule = await this.resolveRewardsModule(
        chain,
        config.tokenAddress,
        config.tokenAbiKey,
        config.businessAddress,
      );
      const people = await this.teamRepository.find({ order: { id: 'ASC' } });
      const startedAt = Date.now();
      const deadlineAt = startedAt + this.initialSyncMaxMs;
      let chainUpdated = 0;
      let chainFailed = 0;
      const batchSize = 40;
      for (let i = 0; i < people.length; i += batchSize) {
        if (Date.now() >= deadlineAt) {
          return {
            volumeUpdated,
            chainUpdated,
            chainFailed,
            total: people.length,
            caughtUp: false,
          };
        }
        const batch = people.slice(i, i + batchSize);
        const part = await this.refreshChainExtrasBatch(batch, chain, rewardsModule, latest);
        chainUpdated += part.updated;
        chainFailed += part.failed;
      }
      return {
        volumeUpdated,
        chainUpdated,
        chainFailed,
        total: people.length,
        caughtUp: true,
      };
    } finally {
      this.metricSyncing = false;
    }
  }

  /** 按推荐关系向下展开全部团队成员 */
  private async loadDownline(root: string, maxMembers = 5000) {
    const out: CrmTeamMember[] = [];
    const seen = new Set<string>([root]);
    let frontier = [root];
    while (frontier.length && out.length < maxMembers) {
      const kids = await this.teamRepository
        .createQueryBuilder('m')
        .where('m.inviter_address IN (:...frontier)', { frontier })
        .getMany();
      const next: string[] = [];
      for (const kid of kids) {
        if (seen.has(kid.address)) continue;
        seen.add(kid.address);
        out.push(kid);
        next.push(kid.address);
        if (out.length >= maxMembers) break;
      }
      frontier = next;
    }
    return { members: out, truncated: out.length >= maxMembers };
  }

  private async sumJoinsByAddress(addresses: string[]) {
    const usd = new Map<string, bigint>();
    const bnb = new Map<string, bigint>();
    for (let i = 0; i < addresses.length; i += 500) {
      const part = addresses.slice(i, i + 500);
      if (!part.length) continue;
      const rows = await this.joinRepository
        .createQueryBuilder('j')
        .select('j.address', 'address')
        .addSelect('COALESCE(SUM(j.participation_usd), 0)', 'usdTotal')
        .addSelect('COALESCE(SUM(j.bnb_amount), 0)', 'bnbTotal')
        .where('j.address IN (:...part)', { part })
        .groupBy('j.address')
        .getRawMany<{ address: string; usdTotal: string; bnbTotal: string }>();
      for (const row of rows) {
        const key = (() => {
          try {
            return getAddress(row.address);
          } catch {
            return row.address;
          }
        })();
        usd.set(key, this.parseUsd(row.usdTotal));
        bnb.set(key, this.parseUsd(row.bnbTotal));
      }
    }
    return { usd, bnb };
  }

  /** 仅读库：本人团队数据 + 每个成员的个人/直推/团队业绩（由入金与推荐关系汇总） */
  async metricsFromDb(address: string) {
    const checksum = getAddress(address);
    const self = await this.teamRepository.findOne({ where: { address: checksum } });
    const { members: downline, truncated } = await this.loadDownline(checksum);
    const people = self ? [self, ...downline.filter((m) => m.address !== checksum)] : downline;
    const addresses = [...new Set([checksum, ...people.map((p) => p.address)])];
    const { usd, bnb } = await this.sumJoinsByAddress(addresses);
    const usdStats = this.buildVolumeStats(people, usd);
    const bnbStats = this.buildVolumeStats(people, bnb);
    if (people.length) await this.persistVolumeStats(people, usdStats.statsOf, bnbStats.statsOf);
    const { children, statsOf } = usdStats;
    const bnbOf = bnbStats.statsOf;

    const root = statsOf(checksum);
    const directSet = new Set(children.get(checksum) ?? []);
    const members = downline
      .filter((member) => directSet.has(member.address))
      .map((member) => {
        const stats = statsOf(member.address);
        const bnb = bnbOf(member.address);
        return {
          address: member.address,
          inviterAddress: member.inviterAddress ?? null,
          layer: 1,
          ownUsd: stats.own.toString(),
          directUsd: stats.direct.toString(),
          teamUsd: stats.team.toString(),
          ownBnb: bnb.own.toString(),
          directBnb: bnb.direct.toString(),
          teamBnb: bnb.team.toString(),
          teamCount: stats.teamCount,
        };
      });
    members.sort((a, b) => a.address.localeCompare(b.address));

    return {
      indexed: Boolean(self) || root.own > 0n,
      address: checksum,
      ownUsd: root.own.toString(),
      directUsd: root.direct.toString(),
      teamUsd: root.team.toString(),
      ownBnb: bnbOf(checksum).own.toString(),
      directBnb: bnbOf(checksum).direct.toString(),
      teamBnb: bnbOf(checksum).team.toString(),
      directCount: (children.get(checksum) ?? []).length,
      teamCount: root.teamCount,
      truncated,
      members,
      updatedAt: self?.updatedAt ?? null,
    };
  }

  async tree(address: string) {
    const checksum = getAddress(address);
    const root = await this.teamRepository.findOne({ where: { address: checksum } });
    if (!root) {
      throw new BusinessException('该地址尚未索引到团队关系', 'CRM_TEAM_MEMBER_NOT_FOUND');
    }
    const descendants = await this.teamRepository.find({
      where: [{ inviterAddress: checksum }, { ancestorPath: Like(`%${checksum}%`) }],
      order: { depth: 'DESC', id: 'ASC' },
      take: 1000,
    });
    return {
      root: this.toMemberVo(root),
      nodes: descendants.map((x) => this.toMemberVo(x)),
    };
  }
}
