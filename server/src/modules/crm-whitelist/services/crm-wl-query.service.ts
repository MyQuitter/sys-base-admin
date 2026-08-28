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
}
