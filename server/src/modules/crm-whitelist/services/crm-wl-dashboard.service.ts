import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getAddress, type Address, type PublicClient } from 'viem';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { Chain } from '../../blockchain/entities/chain.entity';
import { BlockchainRpcService } from '../../blockchain/services/blockchain-rpc.service';
import { CRAM_BUSINESS_ABI, resolveTokenAbi } from '../abi/load-abi';
import { PANCAKE_ROUTER_ABI } from '../abi/pancake-router.abi';
import { CrmTeamMember } from '../entities/crm-team-member.entity';
import { CrmWlJoin } from '../entities/crm-wl-join.entity';
import { CrmWlNode } from '../entities/crm-wl-node.entity';
import { CrmWlTrader } from '../entities/crm-wl-trader.entity';
import { CrmWlConfigService } from './crm-wl-config.service';

type CountRow = { key: string; count: string };

const ONE = 10n ** 18n;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const UTC8_OFFSET_MS = 8 * 60 * 60 * 1000;
const GECKO_API = 'https://api.geckoterminal.com/api/v2';
const GECKO_NETWORK: Record<number, string> = {
  1: 'eth',
  56: 'bsc',
  137: 'polygon_pos',
  42161: 'arbitrum',
};
const KLINE_INTERVAL = {
  '15m': { timeframe: 'minute', aggregate: 15, limit: 96 },
  '1h': { timeframe: 'hour', aggregate: 1, limit: 72 },
  '4h': { timeframe: 'hour', aggregate: 4, limit: 42 },
  '1d': { timeframe: 'day', aggregate: 1, limit: 30 },
} as const;

type KlineInterval = keyof typeof KLINE_INTERVAL;

interface GeckoPoolRow {
  attributes?: { address?: string; name?: string };
  relationships?: { base_token?: { data?: { id?: string } } };
}

interface GeckoOhlcvBody {
  data?: { attributes?: { ohlcv_list?: [number, number, number, number, number, number][] } };
  meta?: { base?: { symbol?: string }; quote?: { symbol?: string } };
}

type PriceKlineResult = {
  interval: KlineInterval;
  pairAddress: string;
  pairName: string;
  source: 'geckoterminal' | 'none';
  candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[];
};

/**
 * CrmToken 数据面板：链上全局指标 + 本地索引分布。
 */
@Injectable()
export class CrmWlDashboardService {
  private klineCache: { key: string; at: number; data: PriceKlineResult } | null = null;

  constructor(
    private readonly configService: CrmWlConfigService,
    private readonly rpcService: BlockchainRpcService,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    @InjectRepository(CrmTeamMember)
    private readonly teamRepository: Repository<CrmTeamMember>,
    @InjectRepository(CrmWlTrader)
    private readonly traderRepository: Repository<CrmWlTrader>,
    @InjectRepository(CrmWlNode)
    private readonly nodeRepository: Repository<CrmWlNode>,
    @InjectRepository(CrmWlJoin)
    private readonly joinRepository: Repository<CrmWlJoin>,
  ) {}

  async getStats() {
    const config = await this.configService.requireConfig();
    const chain = await this.chainRepository.findOne({ where: { chainId: config.chainId, status: 1 } });
    if (!chain?.rpcUrls?.length) {
      throw new BusinessException('未找到启用链配置', 'CRM_WL_CHAIN_MISSING');
    }

    const client = this.rpcService.getClient(chain);
    const business = getAddress(config.businessAddress);
    const token = getAddress(config.tokenAddress);
    const tokenAbi = resolveTokenAbi(config.tokenAbiKey || 'modular');

    const [onChain, members, traderCount, nodeCount, depthRows, levelRows, metricAgg, joinAgg, dailyJoins] =
      await Promise.all([
      client.multicall({
        contracts: [
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'totalQuotaUsd' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'totalQuota' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'totalParticipations' },
          { address: token, abi: tokenAbi, functionName: 'protectedPrices' },
          { address: token, abi: tokenAbi, functionName: 'tradingEnabled' },
          { address: token, abi: tokenAbi, functionName: 'publicBuysEnabled' },
          { address: token, abi: tokenAbi, functionName: 'totalSupply' },
          { address: token, abi: tokenAbi, functionName: 'availableExcessCrm' },
          { address: token, abi: tokenAbi, functionName: 'balanceOf', args: [business] as const },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'staticRewardReserve' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'nodeRewardReserve' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'dynamicReserve' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'lastRebaseTime' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'pendingExitCount' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'rebaseDue' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'dailyJoinCapUsd' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'dailyJoinedUsdToday' },
          { address: business, abi: CRAM_BUSINESS_ABI, functionName: 'dailyJoinRemainingUsd' },
        ],
        allowFailure: true,
      }),
      this.teamRepository.find({ select: { address: true } }),
      this.traderRepository.count({ where: { allowed: 1 } }),
      this.nodeRepository
        .createQueryBuilder('n')
        .where('n.level > 0')
        .getCount(),
      this.teamRepository
        .createQueryBuilder('m')
        .select('m.depth', 'key')
        .addSelect('COUNT(*)', 'count')
        .groupBy('m.depth')
        .orderBy('m.depth', 'ASC')
        .getRawMany<CountRow>(),
      this.teamRepository
        .createQueryBuilder('m')
        .select('m.nodeLevel', 'key')
        .addSelect('COUNT(*)', 'count')
        .groupBy('m.nodeLevel')
        .orderBy('m.nodeLevel', 'ASC')
        .getRawMany<CountRow>(),
      this.teamRepository
        .createQueryBuilder('m')
        .select('COALESCE(SUM(m.own_usd), 0)', 'ownUsdSum')
        .addSelect('COALESCE(SUM(m.power_usd), 0)', 'quotaUsdSum')
        .getRawOne<{ ownUsdSum: string; quotaUsdSum: string }>(),
      this.joinRepository
        .createQueryBuilder('j')
        .select('COUNT(*)', 'cnt')
        .addSelect('COALESCE(SUM(j.participation_usd), 0)', 'usdSum')
        .getRawOne<{ cnt: string; usdSum: string }>(),
      this.loadDailyJoins(30, client),
    ]);

    const totalQuotaUsd = onChain[0].status === 'success' ? (onChain[0].result as bigint).toString() : '0';
    const totalQuota = onChain[1].status === 'success' ? (onChain[1].result as bigint).toString() : '0';
    const totalParticipations = onChain[2].status === 'success' ? (onChain[2].result as bigint).toString() : '0';
    const memberCount = members.length;
    const indexedOwnUsdSum = metricAgg?.ownUsdSum ?? '0';
    const joinCount = Number(joinAgg?.cnt ?? 0);
    const joinUsdSum = String(joinAgg?.usdSum ?? '0').split('.')[0];
    const totalParticipationUsd =
      joinCount > 0 && joinCount === Number(totalParticipations)
        ? joinUsdSum
        : await this.sumOnChainParticipationUsd(
            client,
            business,
            await this.collectParticipationAddresses(members.map((m) => m.address)),
            indexedOwnUsdSum,
          );

    // TWAP 保护价：开盘/领取门禁；面板展示优先用薄饼现货
    let priceReady = false;
    if (onChain[3].status === 'success') {
      const prices = onChain[3].result as readonly [bigint, bigint, boolean];
      priceReady = prices[2];
    }

    const spot = await this.readPancakeSpotPrices(client, token, tokenAbi);
    const crmBnbPrice = spot.crmBnbPrice;
    const bnbUsdPrice = spot.bnbUsdPrice;
    const crmUsdPrice = spot.crmUsdPrice;
    const priceSource = spot.priceSource;

    const tradingEnabled = onChain[4].status === 'success' ? Boolean(onChain[4].result) : false;
    const publicBuysEnabled = onChain[5].status === 'success' ? Boolean(onChain[5].result) : false;
    const totalSupply = onChain[6].status === 'success' ? (onChain[6].result as bigint).toString() : '0';
    const availableExcessCrm =
      onChain[7].status === 'success' ? (onChain[7].result as bigint).toString() : '0';
    const businessCrm = onChain[8].status === 'success' ? (onChain[8].result as bigint).toString() : '0';
    const staticRewardReserve =
      onChain[9].status === 'success' ? (onChain[9].result as bigint).toString() : '0';
    const nodeRewardReserve =
      onChain[10].status === 'success' ? (onChain[10].result as bigint).toString() : '0';
    const dynamicReserve =
      onChain[11].status === 'success' ? (onChain[11].result as bigint).toString() : '0';
    const lastRebaseTime =
      onChain[12].status === 'success' ? (onChain[12].result as bigint).toString() : '0';
    const pendingExitCount =
      onChain[13].status === 'success' ? (onChain[13].result as bigint).toString() : '0';
    const rebaseDue = onChain[14].status === 'success' ? Boolean(onChain[14].result) : false;

    const dailyJoinCapUsd =
      onChain[15].status === 'success' ? (onChain[15].result as bigint).toString() : '0';
    const dailyJoinedUsdToday =
      onChain[16].status === 'success' ? (onChain[16].result as bigint).toString() : '0';
    const dailyJoinUnlimited =
      (onChain[15].status === 'success' && (onChain[15].result as bigint) === 0n) ||
      (onChain[17].status === 'success' && (onChain[17].result as bigint) === UINT256_MAX);
    const dailyJoinRemainingUsd =
      dailyJoinUnlimited || onChain[17].status !== 'success'
        ? '0'
        : (onChain[17].result as bigint).toString();

    return {
      utc8Date: this.utc8CalendarDate(),
      dailyJoinCapUsd,
      dailyJoinedUsdToday,
      dailyJoinRemainingUsd,
      dailyJoinUnlimited,
      totalParticipationUsd,
      totalQuotaUsd,
      totalQuota,
      totalParticipations,
      memberCount,
      traderCount,
      nodeCount,
      indexedOwnUsdSum,
      indexedQuotaUsdSum: metricAgg?.quotaUsdSum ?? '0',
      crmBnbPrice,
      bnbUsdPrice,
      crmUsdPrice,
      priceReady,
      priceSource,
      tradingEnabled,
      publicBuysEnabled,
      totalSupply,
      availableExcessCrm,
      businessCrm,
      staticRewardReserve,
      nodeRewardReserve,
      dynamicReserve,
      lastRebaseTime,
      pendingExitCount,
      rebaseDue,
      dailyJoins,
      depthDistribution: depthRows.map((r) => ({
        depth: Number(r.key),
        count: Number(r.count),
      })),
      nodeLevelDistribution: levelRows.map((r) => ({
        level: Number(r.key),
        count: Number(r.count),
      })),
    };
  }

  /** 与合约 DAY_OFFSET=8 hours 一致：UTC+8 自然日 YYYY-MM-DD。 */
  private utc8CalendarDate(nowMs = Date.now()): string {
    const shifted = new Date(nowMs + UTC8_OFFSET_MS);
    const y = shifted.getUTCFullYear();
    const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    const d = String(shifted.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /** 最近 N 个 UTC+8 自然日（含今天），无入金的日期补 0，口径与合约日切一致。 */
  private async loadDailyJoins(
    days: number,
    client: PublicClient,
  ): Promise<{ date: string; usd: string; bnb: string; count: number }[]> {
    const dates = Array.from({ length: days }, (_, i) =>
      this.utc8CalendarDate(Date.now() - (days - 1 - i) * 24 * 60 * 60 * 1000),
    );
    const rows = await this.joinRepository
      .createQueryBuilder('j')
      .select('j.block_number', 'blockNumber')
      .addSelect('j.participation_usd', 'usd')
      .addSelect('j.bnb_amount', 'bnb')
      .getRawMany<{ blockNumber: string; usd: string; bnb: string }>();

    const blockNums: bigint[] = [];
    for (const row of rows) {
      try {
        const bn = BigInt(String(row.blockNumber || '0').split('.')[0]);
        if (bn > 0n) blockNums.push(bn);
      } catch {
        /* skip */
      }
    }
    const timeByBlock = await this.resolveBlockTimesMs(client, blockNums);

    const buckets = new Map(dates.map((date) => [date, { usd: 0n, bnb: 0n, count: 0 }]));
    for (const row of rows) {
      let bn = 0n;
      try {
        bn = BigInt(String(row.blockNumber || '0').split('.')[0]);
      } catch {
        continue;
      }
      const ms = timeByBlock.get(bn.toString());
      if (ms == null) continue;
      const bucket = buckets.get(this.utc8CalendarDate(ms));
      if (!bucket) continue;
      try {
        bucket.usd += BigInt(String(row.usd ?? '0').split('.')[0] || '0');
        bucket.bnb += BigInt(String(row.bnb ?? '0').split('.')[0] || '0');
      } catch {
        /* skip malformed */
      }
      bucket.count += 1;
    }
    return dates.map((date) => {
      const bucket = buckets.get(date)!;
      return { date, usd: bucket.usd.toString(), bnb: bucket.bnb.toString(), count: bucket.count };
    });
  }

  /**
   * 按区块号还原出块时间。全量 getBlock 太慢，均匀抽样后线性插值（日切误差远小于 1 小时）。
   */
  private async resolveBlockTimesMs(client: PublicClient, blocks: bigint[]): Promise<Map<string, number>> {
    const unique = [...new Set(blocks.map((b) => b.toString()))]
      .map((s) => BigInt(s))
      .filter((n) => n > 0n)
      .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    const out = new Map<string, number>();
    if (!unique.length) return out;

    const sampleCount = Math.min(unique.length, 24);
    const sampleIdx = new Set<number>([0, unique.length - 1]);
    for (let i = 1; i < sampleCount - 1; i++) {
      sampleIdx.add(Math.round((i * (unique.length - 1)) / (sampleCount - 1)));
    }
    const samples: { block: bigint; ms: number }[] = [];
    const sampleBlocks = [...sampleIdx].sort((a, b) => a - b).map((i) => unique[i]);
    for (let i = 0; i < sampleBlocks.length; i += 8) {
      const chunk = sampleBlocks.slice(i, i + 8);
      const fetched = await Promise.all(
        chunk.map(async (blockNumber) => {
          try {
            const block = await client.getBlock({ blockNumber });
            return { block: blockNumber, ms: Number(block.timestamp) * 1000 };
          } catch {
            return null;
          }
        }),
      );
      for (const item of fetched) {
        if (!item || !Number.isFinite(item.ms) || item.ms <= 0) continue;
        samples.push(item);
        out.set(item.block.toString(), item.ms);
      }
    }
    samples.sort((a, b) => (a.block < b.block ? -1 : a.block > b.block ? 1 : 0));
    if (!samples.length) return out;

    for (const block of unique) {
      const key = block.toString();
      if (out.has(key)) continue;
      out.set(key, this.interpolateBlockTimeMs(samples, block));
    }
    return out;
  }

  private interpolateBlockTimeMs(samples: { block: bigint; ms: number }[], block: bigint): number {
    if (block <= samples[0].block) return samples[0].ms;
    const last = samples[samples.length - 1];
    if (block >= last.block) return last.ms;
    for (let i = 0; i < samples.length - 1; i++) {
      const left = samples[i];
      const right = samples[i + 1];
      if (block > right.block) continue;
      const span = Number(right.block - left.block);
      if (span <= 0) return left.ms;
      const ratio = Number(block - left.block) / span;
      return Math.round(left.ms + ratio * (right.ms - left.ms));
    }
    return last.ms;
  }

  /**
   * 入金地址 ∪ 团队索引，避免只扫团队表时漏掉已入金但未建成员的地址。
   */
  private async collectParticipationAddresses(teamAddresses: string[]): Promise<string[]> {
    const joinRows = await this.joinRepository
      .createQueryBuilder('j')
      .select('DISTINCT j.address', 'address')
      .getRawMany<{ address: string }>();
    const set = new Set<string>();
    for (const address of teamAddresses) {
      try {
        set.add(getAddress(address));
      } catch {
        /* skip */
      }
    }
    for (const row of joinRows) {
      try {
        set.add(getAddress(row.address));
      } catch {
        /* skip */
      }
    }
    return [...set];
  }

  /**
   * 汇总已索引地址的链上 participationUsd（入金折 U，不含档位系数）。
   * 合约没有全局 totalParticipationUsd，只能按账户加总；RPC 失败时回退库内 own_usd 合计。
   */
  private async sumOnChainParticipationUsd(
    client: PublicClient,
    business: Address,
    addresses: string[],
    fallback: string,
  ): Promise<string> {
    if (!addresses.length) return '0';
    const chunkSize = 200;
    let sum = 0n;
    let ok = 0;
    for (let i = 0; i < addresses.length; i += chunkSize) {
      const chunk = addresses.slice(i, i + chunkSize);
      const results = await client.multicall({
        contracts: chunk.map((address) => ({
          address: business,
          abi: CRAM_BUSINESS_ABI,
          functionName: 'participationUsd' as const,
          args: [getAddress(address)] as const,
        })),
        allowFailure: true,
      });
      for (const result of results) {
        if (result.status !== 'success') continue;
        sum += result.result as bigint;
        ok += 1;
      }
    }
    return ok > 0 ? sum.toString() : fallback;
  }

  /**
   * 经 Pancake V2 Router.getAmountsOut 换算现货价（CRM→WBNB→USD）。
   * 不依赖 TWAP 冷启动，有底池且 Router/价源已配置即可读出。
   */
  private async readPancakeSpotPrices(
    client: PublicClient,
    token: Address,
    tokenAbi: ReturnType<typeof resolveTokenAbi>,
  ): Promise<{
    crmBnbPrice: string;
    bnbUsdPrice: string;
    crmUsdPrice: string;
    priceSource: 'pancake' | 'none';
  }> {
    const empty = {
      crmBnbPrice: '0',
      bnbUsdPrice: '0',
      crmUsdPrice: '0',
      priceSource: 'none' as const,
    };

    try {
      const [routerRes, wbnbRes, usdRes] = await client.multicall({
        contracts: [
          { address: token, abi: tokenAbi, functionName: 'router' },
          { address: token, abi: tokenAbi, functionName: 'wbnb' },
          { address: token, abi: tokenAbi, functionName: 'usdToken' },
        ],
        allowFailure: true,
      });

      if (routerRes.status !== 'success' || wbnbRes.status !== 'success' || usdRes.status !== 'success') {
        return empty;
      }

      const router = getAddress(routerRes.result as string);
      const wbnb = getAddress(wbnbRes.result as string);
      const usd = getAddress(usdRes.result as string);
      if (
        router.toLowerCase() === ZERO_ADDRESS ||
        wbnb.toLowerCase() === ZERO_ADDRESS ||
        usd.toLowerCase() === ZERO_ADDRESS
      ) {
        return empty;
      }

      const [crmPathRes, bnbPathRes] = await client.multicall({
        contracts: [
          {
            address: router,
            abi: PANCAKE_ROUTER_ABI,
            functionName: 'getAmountsOut',
            args: [ONE, [token, wbnb, usd]] as const,
          },
          {
            address: router,
            abi: PANCAKE_ROUTER_ABI,
            functionName: 'getAmountsOut',
            args: [ONE, [wbnb, usd]] as const,
          },
        ],
        allowFailure: true,
      });

      if (crmPathRes.status !== 'success' || bnbPathRes.status !== 'success') {
        return empty;
      }

      const crmAmounts = crmPathRes.result as readonly bigint[];
      const bnbAmounts = bnbPathRes.result as readonly bigint[];
      const crmBnb = crmAmounts[1] ?? 0n;
      const crmUsd = crmAmounts[2] ?? 0n;
      const bnbUsd = bnbAmounts[1] ?? 0n;
      if (crmBnb <= 0n || crmUsd <= 0n || bnbUsd <= 0n) {
        return empty;
      }

      return {
        crmBnbPrice: crmBnb.toString(),
        bnbUsdPrice: bnbUsd.toString(),
        crmUsdPrice: crmUsd.toString(),
        priceSource: 'pancake',
      };
    } catch {
      return empty;
    }
  }

  async getPriceKline(interval: KlineInterval = '1h'): Promise<PriceKlineResult> {
    const empty: PriceKlineResult = {
      interval,
      pairAddress: '',
      pairName: '',
      source: 'none',
      candles: [],
    };
    try {
      const config = await this.configService.requireConfig();
      const network = GECKO_NETWORK[config.chainId];
      if (!network || !config.tokenAddress) return empty;
      const cacheKey = `${config.chainId}:${config.tokenAddress.toLowerCase()}:${interval}`;
      if (this.klineCache && this.klineCache.key === cacheKey && Date.now() - this.klineCache.at < 45_000) {
        return this.klineCache.data;
      }

      const token = getAddress(config.tokenAddress).toLowerCase();
      const pools = await this.fetchJson<{ data?: GeckoPoolRow[] }>(
        `${GECKO_API}/networks/${network}/tokens/${token}/pools`,
      );
      const rows = pools?.data ?? [];
      const pool =
        rows.find((row) => (row.relationships?.base_token?.data?.id || '').toLowerCase().endsWith(token)) ?? rows[0];
      const pairAddress = pool?.attributes?.address || '';
      if (!pairAddress) return empty;

      const spec = KLINE_INTERVAL[interval];
      const ohlcv = await this.fetchJson<GeckoOhlcvBody>(
        `${GECKO_API}/networks/${network}/pools/${pairAddress}/ohlcv/${spec.timeframe}?aggregate=${spec.aggregate}&limit=${spec.limit}&currency=usd&include_empty_intervals=true`,
      );
      const list = ohlcv?.data?.attributes?.ohlcv_list ?? [];
      const base = ohlcv?.meta?.base?.symbol || 'CRAM';
      const quote = ohlcv?.meta?.quote?.symbol || 'USD';
      const candles = [...list]
        .reverse()
        .map(([time, open, high, low, close, volume]) => ({
          time: Number(time) || 0,
          open: Number(open) || 0,
          high: Number(high) || 0,
          low: Number(low) || 0,
          close: Number(close) || 0,
          volume: Number(volume) || 0,
        }))
        .filter((c) => c.time > 0 && c.high > 0);
      const data: PriceKlineResult = {
        interval,
        pairAddress,
        pairName: pool?.attributes?.name || `${base} / ${quote}`,
        source: candles.length ? 'geckoterminal' : 'none',
        candles,
      };
      this.klineCache = { key: cacheKey, at: Date.now(), data };
      return data;
    } catch {
      return empty;
    }
  }

  private async fetchJson<T>(url: string): Promise<T | null> {
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'base-admin-crm-kline' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  }
}
