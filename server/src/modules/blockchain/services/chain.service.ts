import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { join } from 'path';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { DEFAULT_WALLET_CHAIN_ID, SUPPORTED_EVM_CHAINS } from '../../base/setting/evm-chains';
import { SiteSettingStore } from '../../base/setting/site-setting.store';
import { CreateChainDto, QueryChainDto, UpdateChainDto } from '../dto/chain.dto';
import { Chain } from '../entities/chain.entity';
import { maskRpcUrls } from '../utils/rpc-mask';
import { BlockchainRpcService } from './blockchain-rpc.service';

const DEFAULT_RPC_BY_CHAIN: Record<number, string[]> = {
  1: ['https://eth.llamarpc.com'],
  11155111: ['https://rpc.sepolia.org'],
  56: ['https://bsc-dataseed.binance.org'],
  137: ['https://polygon-rpc.com'],
  42161: ['https://arb1.arbitrum.io/rpc'],
};

const DEFAULT_EXPLORER: Record<number, string> = {
  1: 'https://etherscan.io',
  11155111: 'https://sepolia.etherscan.io',
  56: 'https://bscscan.com',
  137: 'https://polygonscan.com',
  42161: 'https://arbiscan.io',
};

const NATIVE_SYMBOL: Record<number, string> = {
  1: 'ETH',
  11155111: 'ETH',
  56: 'BNB',
  137: 'MATIC',
  42161: 'ETH',
};

@Injectable()
export class ChainService implements OnModuleInit {
  private siteStore: SiteSettingStore;

  constructor(
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    private readonly rpcService: BlockchainRpcService,
    private readonly configService: ConfigService,
  ) {
    const configPath = join(
      process.cwd(),
      this.configService.get<string>('siteSetting.configPath') ?? 'data/site.setting.json',
    );
    const brandingDir = join(
      process.cwd(),
      this.configService.get<string>('siteSetting.brandingDir') ?? 'data/branding',
    );
    this.siteStore = new SiteSettingStore(configPath, brandingDir);
  }

  async onModuleInit() {
    await this.seedChainsIfEmpty();
  }

  private toListVo(chain: Chain) {
    return {
      id: chain.id,
      chainId: chain.chainId,
      name: chain.name,
      nativeSymbol: chain.nativeSymbol,
      rpcUrls: maskRpcUrls(chain.rpcUrls),
      wssUrls: chain.wssUrls?.length ? maskRpcUrls(chain.wssUrls) : undefined,
      explorerUrl: chain.explorerUrl,
      status: chain.status,
      loginEnabled: chain.loginEnabled,
      sort: chain.sort,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
    };
  }

  private toDetailVo(chain: Chain) {
    return {
      id: chain.id,
      chainId: chain.chainId,
      name: chain.name,
      nativeSymbol: chain.nativeSymbol,
      rpcUrls: chain.rpcUrls,
      wssUrls: chain.wssUrls,
      explorerUrl: chain.explorerUrl,
      status: chain.status,
      loginEnabled: chain.loginEnabled,
      sort: chain.sort,
      createdAt: chain.createdAt,
      updatedAt: chain.updatedAt,
    };
  }

  private getCurrentWalletChainId(): number {
    return this.siteStore.read().walletChainId ?? DEFAULT_WALLET_CHAIN_ID;
  }

  private async seedChainsIfEmpty() {
    const count = await this.chainRepository.count();
    if (count > 0) return;

    const seeds = SUPPORTED_EVM_CHAINS.map((c, index) =>
      this.chainRepository.create({
        chainId: c.chainId,
        name: c.name,
        nativeSymbol: NATIVE_SYMBOL[c.chainId] ?? 'ETH',
        rpcUrls: DEFAULT_RPC_BY_CHAIN[c.chainId] ?? ['https://rpc.sepolia.org'],
        explorerUrl: DEFAULT_EXPLORER[c.chainId],
        status: 1,
        loginEnabled: 1,
        sort: index + 1,
      }),
    );
    await this.chainRepository.save(seeds);
  }

  async findAll(query: QueryChainDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.chainRepository.createQueryBuilder('chain');

    if (query.name?.trim()) {
      qb.andWhere('chain.name LIKE :name', { name: `%${query.name.trim()}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('chain.status = :status', { status: query.status });
    }

    qb.orderBy('chain.sort', 'ASC').addOrderBy('chain.chainId', 'ASC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return toPageResult(items.map((c) => this.toListVo(c)), total, page, pageSize);
  }

  async findEnabled() {
    const items = await this.chainRepository.find({
      where: { status: 1 },
      order: { sort: 'ASC', chainId: 'ASC' },
    });
    return items.map((c) => ({ chainId: c.chainId, name: c.name }));
  }

  async findLoginEnabled() {
    const items = await this.chainRepository.find({
      where: { status: 1, loginEnabled: 1 },
      order: { sort: 'ASC', chainId: 'ASC' },
    });
    return items.map((c) => ({ chainId: c.chainId, name: c.name }));
  }

  async isSupportedChainId(chainId: number): Promise<boolean> {
    const count = await this.chainRepository.count({ where: { chainId, status: 1 } });
    return count > 0;
  }

  async isLoginEnabledChainId(chainId: number): Promise<boolean> {
    const count = await this.chainRepository.count({
      where: { chainId, status: 1, loginEnabled: 1 },
    });
    return count > 0;
  }

  async getChainName(chainId: number): Promise<string | undefined> {
    const chain = await this.chainRepository.findOne({ where: { chainId } });
    return chain?.name;
  }

  async findByChainId(chainId: number): Promise<Chain | null> {
    return this.chainRepository.findOne({ where: { chainId, status: 1 } });
  }

  async findOne(id: number) {
    const chain = await this.chainRepository.findOne({ where: { id } });
    if (!chain) throw new NotFoundException('链配置不存在');
    return this.toDetailVo(chain);
  }

  async create(dto: CreateChainDto) {
    const exists = await this.chainRepository.findOne({ where: { chainId: dto.chainId } });
    if (exists) throw new BusinessException('链 ID 已存在', 'CHAIN_ID_EXISTS');

    const chain = this.chainRepository.create({
      chainId: dto.chainId,
      name: dto.name,
      nativeSymbol: dto.nativeSymbol ?? 'ETH',
      rpcUrls: dto.rpcUrls,
      wssUrls: dto.wssUrls,
      explorerUrl: dto.explorerUrl,
      status: dto.status ?? 1,
      loginEnabled: dto.loginEnabled ?? 1,
      sort: dto.sort ?? 0,
    });
    const saved = await this.chainRepository.save(chain);
    return this.findOne(saved.id);
  }

  private assertCanDisableLogin(chain: Chain, nextLoginEnabled?: number, nextStatus?: number) {
    const disabling =
      (nextLoginEnabled !== undefined && nextLoginEnabled !== 1) ||
      (nextStatus !== undefined && nextStatus !== 1);
    if (!disabling) return;

    const currentWalletChainId = this.getCurrentWalletChainId();
    if (chain.chainId === currentWalletChainId && chain.loginEnabled === 1) {
      throw new BadRequestException({
        message: '当前链为钱包登录链，无法禁用',
        errorCode: 'CHAIN_LOGIN_IN_USE',
      });
    }
  }

  async update(id: number, dto: UpdateChainDto) {
    const chain = await this.chainRepository.findOne({ where: { id } });
    if (!chain) throw new NotFoundException('链配置不存在');

    this.assertCanDisableLogin(chain, dto.loginEnabled, dto.status);

    if (dto.name !== undefined) chain.name = dto.name;
    if (dto.nativeSymbol !== undefined) chain.nativeSymbol = dto.nativeSymbol;
    if (dto.rpcUrls !== undefined) {
      chain.rpcUrls = dto.rpcUrls;
      this.rpcService.invalidateClient(chain.chainId);
    }
    if (dto.wssUrls !== undefined) {
      chain.wssUrls = dto.wssUrls;
      this.rpcService.invalidateWsClient(chain.chainId);
    }
    if (dto.explorerUrl !== undefined) chain.explorerUrl = dto.explorerUrl;
    if (dto.status !== undefined) chain.status = dto.status;
    if (dto.loginEnabled !== undefined) chain.loginEnabled = dto.loginEnabled;
    if (dto.sort !== undefined) chain.sort = dto.sort;

    await this.chainRepository.save(chain);
    return this.findOne(id);
  }

  async remove(id: number) {
    const chain = await this.chainRepository.findOne({ where: { id } });
    if (!chain) throw new NotFoundException('链配置不存在');

    if (chain.chainId === this.getCurrentWalletChainId()) {
      throw new BadRequestException({
        message: '当前链为钱包登录链，无法删除',
        errorCode: 'CHAIN_LOGIN_IN_USE',
      });
    }

    await this.chainRepository.softRemove(chain);
    this.rpcService.invalidateClient(chain.chainId);
    return { success: true };
  }

  async checkHealth(id: number) {
    const chain = await this.chainRepository.findOne({ where: { id } });
    if (!chain) throw new NotFoundException('链配置不存在');
    return this.rpcService.checkHealth(chain);
  }
}
