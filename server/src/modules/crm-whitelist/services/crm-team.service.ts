import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { decodeEventLog, getAddress, keccak256, toBytes, type AbiEvent, type Log } from 'viem';
import { Like, Repository, type FindOperator } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { Chain } from '../../blockchain/entities/chain.entity';
import { BlockchainRpcService } from '../../blockchain/services/blockchain-rpc.service';
import { fetchLogsAdaptive, LogFetchDeadlineError } from '../../blockchain/utils/log-fetch';
import { CRAM_BUSINESS_ABI, resolveTokenAbi } from '../abi/load-abi';
import { QueryCrmTeamListDto } from '../dto/crm-wl.dto';
import { CrmTeamMember } from '../entities/crm-team-member.entity';
import { CrmWlConfigService } from './crm-wl-config.service';

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

  constructor(
    private readonly configService: CrmWlConfigService,
    private readonly rpcService: BlockchainRpcService,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    @InjectRepository(CrmTeamMember)
    private readonly teamRepository: Repository<CrmTeamMember>,
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

  private async applyJoinLog(log: Log, chain: Chain, rewardsModule: `0x${string}`) {
    const decoded = decodeEventLog({
      abi: CRAM_BUSINESS_ABI,
      data: log.data,
      topics: log.topics,
    });
    if (decoded.eventName !== 'ParticipationAdded') return;
    const args = decoded.args as unknown as { user: `0x${string}` };
    const address = getAddress(args.user);
    const row = await this.ensureMember(address);
    if (row.inviterAddress) return;

    const client = this.rpcService.getClient(chain);
    const referrer = getAddress(
      (await client.readContract({
        address: rewardsModule,
        abi: CRAM_BUSINESS_ABI,
        functionName: 'referrer',
        args: [address],
      })) as `0x${string}`,
    );
    if (referrer === this.zeroAddress) return;
    await this.applyBind(address, referrer, log);
  }

  private async applyTeamLog(log: Log, chain: Chain, rewardsModule: `0x${string}`) {
    const topic = (log.topics?.[0] || '').toLowerCase();
    if (topic === this.referralBoundTopic.toLowerCase()) {
      await this.applyRelationLog(log);
      return 1;
    }
    if (topic === this.joinOrderTopic.toLowerCase()) {
      await this.applyJoinLog(log, chain, rewardsModule);
      return 1;
    }
    return 0;
  }

  private sortLogs(logs: Log[]) {
    return [...logs].sort((a, b) => {
      const blockDelta = (a.blockNumber ?? 0n) - (b.blockNumber ?? 0n);
      if (blockDelta !== 0n) return blockDelta > 0n ? 1 : -1;
      const indexDelta = Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0);
      return indexDelta > 0n ? 1 : indexDelta < 0n ? -1 : 0;
    });
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
    let processed = 0;
    for (const log of logs) {
      processed += await this.applyTeamLog(log, params.chain, rewardsModule);
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
      for (const tx of block.transactions) {
        if (typeof tx !== 'object' || !tx.to) continue;
        if (getAddress(tx.to) !== token) continue;
        const receipt = await client.getTransactionReceipt({ hash: tx.hash });
        for (const log of receipt.logs) {
          if (!log.address || getAddress(log.address) !== rewardsModule) continue;
          processed += await this.applyTeamLog(log, params.chain, rewardsModule);
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
