import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getAddress } from 'viem';
import { Like, Repository } from 'typeorm';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { Chain } from '../../blockchain/entities/chain.entity';
import { BlockchainRpcService } from '../../blockchain/services/blockchain-rpc.service';
import { CRAM_BUSINESS_ABI, resolveTokenAbi } from '../abi/load-abi';
import { QueryCrmWlListDto } from '../dto/crm-wl.dto';
import { CrmWlNode } from '../entities/crm-wl-node.entity';
import { CrmWlTrader } from '../entities/crm-wl-trader.entity';
import { CrmWlConfigService } from './crm-wl-config.service';

@Injectable()
export class CrmWlQueryService {
  constructor(
    private readonly configService: CrmWlConfigService,
    private readonly rpcService: BlockchainRpcService,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    @InjectRepository(CrmWlTrader)
    private readonly traderRepository: Repository<CrmWlTrader>,
    @InjectRepository(CrmWlNode)
    private readonly nodeRepository: Repository<CrmWlNode>,
  ) {}

  async listTraders(query: QueryCrmWlListDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = { allowed: 1 };
    if (query.address?.trim()) {
      where.address = Like(`%${query.address.trim()}%`);
    }
    const [items, total] = await this.traderRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });
    return toPageResult(
      items.map((r) => ({
        id: r.id,
        address: r.address,
        allowed: r.allowed,
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

  async listNodes(query: QueryCrmWlListDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.nodeRepository
      .createQueryBuilder('n')
      .where('n.level > 0')
      .orderBy('n.id', 'DESC')
      .skip(skip)
      .take(pageSize);
    if (query.address?.trim()) {
      qb.andWhere('n.address LIKE :addr', { addr: `%${query.address.trim()}%` });
    }
    const [items, total] = await qb.getManyAndCount();
    return toPageResult(
      items.map((r) => ({
        id: r.id,
        address: r.address,
        level: r.level,
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

  async lookupTrader(address: string) {
    const checksum = getAddress(address);
    const row = await this.traderRepository.findOne({ where: { address: checksum } });
    let onChain: boolean | null = null;
    try {
      const config = await this.configService.requireConfig();
      const chain = await this.chainRepository.findOne({ where: { chainId: config.chainId, status: 1 } });
      if (chain) {
        const client = this.rpcService.getClient(chain);
        onChain = (await client.readContract({
          address: getAddress(config.tokenAddress),
          abi: resolveTokenAbi(config.tokenAbiKey),
          functionName: 'isTraderWhitelisted',
          args: [checksum],
        })) as boolean;
      }
    } catch {
      onChain = null;
    }
    return {
      address: checksum,
      indexedAllowed: row?.allowed === 1,
      onChainAllowed: onChain,
      blockNumber: row?.blockNumber ?? null,
      txHash: row?.txHash ?? null,
    };
  }

  async lookupNode(address: string) {
    const checksum = getAddress(address);
    const row = await this.nodeRepository.findOne({ where: { address: checksum } });
    let onChain: number | null = null;
    try {
      const config = await this.configService.requireConfig();
      const chain = await this.chainRepository.findOne({ where: { chainId: config.chainId, status: 1 } });
      if (chain) {
        const client = this.rpcService.getClient(chain);
        onChain = Number(
          await client.readContract({
            address: getAddress(config.businessAddress),
            abi: CRAM_BUSINESS_ABI,
            functionName: 'nodeWhitelistLevel',
            args: [checksum],
          }),
        );
      }
    } catch {
      onChain = null;
    }
    return {
      address: checksum,
      indexedLevel: row?.level ?? 0,
      onChainLevel: onChain,
      blockNumber: row?.blockNumber ?? null,
      txHash: row?.txHash ?? null,
    };
  }

  /** 公开只读 JSON-RPC 代理：浏览器只访问本域，由服务器转发到 Alchemy / 已配置节点 */
  async proxyRpc(body: unknown) {
    const allowed = new Set([
      'eth_call',
      'eth_getBalance',
      'eth_blockNumber',
      'eth_chainId',
      'eth_estimateGas',
      'eth_gasPrice',
      'eth_getTransactionCount',
      'eth_getTransactionReceipt',
      'net_version',
      'web3_clientVersion',
    ]);
    const items = Array.isArray(body) ? body : [body];
    const rpcError = (id: unknown, message: string) => ({
      jsonrpc: '2.0',
      id: id ?? null,
      error: { code: -32601, message },
    });
    for (const item of items) {
      const method = item && typeof item === 'object' ? (item as { method?: unknown }).method : undefined;
      const id = item && typeof item === 'object' ? (item as { id?: unknown }).id : null;
      if (typeof method !== 'string' || !allowed.has(method)) {
        const err = rpcError(id, `不允许的 RPC 方法: ${String(method || '')}`);
        return Array.isArray(body)
          ? items.map((x) => rpcError((x as { id?: unknown })?.id, '不允许的 RPC 方法'))
          : err;
      }
    }
    const alchemy = 'https://bnb-mainnet.g.alchemy.com/v2/IECXKI3eN4Y4dbzajOkEZfGuluPhZEwF';
    const urls = [alchemy];
    const config = await this.configService.getOrEmpty();
    const chainId = config.chainId ?? 56;
    const chain = await this.chainRepository.findOne({ where: { chainId, status: 1 } });
    if (chain?.rpcUrls?.length) {
      for (const url of this.rpcService.rankRpcUrlsForLogs(chain.rpcUrls)) {
        if (!urls.includes(url)) urls.push(url);
      }
    }
    const id = (items[0] as { id?: unknown })?.id;
    let lastMessage = 'RPC 转发失败';
    for (const rpcUrl of urls) {
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(20_000),
        });
        const text = await res.text();
        try {
          return JSON.parse(text) as unknown;
        } catch {
          lastMessage = text.slice(0, 200) || `RPC HTTP ${res.status}`;
        }
      } catch (err) {
        lastMessage = err instanceof Error ? err.message : String(err);
      }
    }
    const err = rpcError(id, lastMessage);
    return Array.isArray(body) ? [err] : err;
  }
}
