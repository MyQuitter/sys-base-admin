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
import { CrmWlNode } from '../entities/crm-wl-node.entity';
import { CrmWlTrader } from '../entities/crm-wl-trader.entity';
import { CrmWlConfigService } from './crm-wl-config.service';

type CountRow = { key: string; count: string };

const ONE = 10n ** 18n;
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/**
 * CrmToken 数据面板：链上全局指标 + 本地索引分布。
 */
@Injectable()
export class CrmWlDashboardService {
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

    const [onChain, memberCount, traderCount, nodeCount, depthRows, levelRows, metricAgg] = await Promise.all([
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
        ],
        allowFailure: true,
      }),
      this.teamRepository.count(),
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
    ]);

    const totalQuotaUsd = onChain[0].status === 'success' ? (onChain[0].result as bigint).toString() : '0';
    const totalQuota = onChain[1].status === 'success' ? (onChain[1].result as bigint).toString() : '0';
    const totalParticipations = onChain[2].status === 'success' ? (onChain[2].result as bigint).toString() : '0';

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

    return {
      totalQuotaUsd,
      totalQuota,
      totalParticipations,
      memberCount,
      traderCount,
      nodeCount,
      indexedOwnUsdSum: metricAgg?.ownUsdSum ?? '0',
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
}
