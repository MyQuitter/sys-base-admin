import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getAddress, isAddress } from 'viem';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { CreateContractDto, QueryContractDto, SyncContractTxDto, UpdateContractDto } from '../dto/contract.dto';
import { Contract, type ContractType } from '../entities/contract.entity';
import {
  getListenOptionsForContract,
  LISTEN_GUIDE_SUMMARY,
} from '../constants/listen-strategy';
import { ChainService } from './chain.service';
import { EventSubscriptionService } from './event-subscription.service';

@Injectable()
export class ContractService {
  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    private readonly chainService: ChainService,
    private readonly eventSubscriptionService: EventSubscriptionService,
  ) {}
  private toVo(contract: Contract) {
    return {
      id: contract.id,
      chainId: contract.chainId,
      address: contract.address,
      name: contract.name,
      contractType: contract.contractType,
      abi: contract.abi,
      status: contract.status,
      remark: contract.remark,
      lastTxSyncBlock: contract.lastTxSyncBlock,
      lastTxSyncedAt: contract.lastTxSyncedAt,
      createdAt: contract.createdAt,
      updatedAt: contract.updatedAt,
    };
  }

  private normalizeAddress(address: string) {
    if (!isAddress(address)) {
      throw new BusinessException('合约地址格式无效', 'CONTRACT_ADDRESS_INVALID');
    }
    return getAddress(address);
  }

  async findAll(query: QueryContractDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.contractRepository.createQueryBuilder('contract');

    if (query.chainId !== undefined) {
      qb.andWhere('contract.chainId = :chainId', { chainId: query.chainId });
    }
    if (query.name?.trim()) {
      qb.andWhere('contract.name LIKE :name', { name: `%${query.name.trim()}%` });
    }
    if (query.status !== undefined) {
      qb.andWhere('contract.status = :status', { status: query.status });
    }

    qb.orderBy('contract.id', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();
    return toPageResult(items.map((c) => this.toVo(c)), total, page, pageSize);
  }

  async findOne(id: number) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) throw new NotFoundException('合约不存在');
    return this.toVo(contract);
  }

  async create(dto: CreateContractDto) {
    const chain = await this.chainService.findByChainId(dto.chainId);
    if (!chain) throw new BusinessException('链未启用或不存在', 'CHAIN_NOT_FOUND');

    const address = this.normalizeAddress(dto.address);
    const exists = await this.contractRepository.findOne({
      where: { chainId: dto.chainId, address },
    });
    if (exists) throw new BusinessException('该链上合约地址已登记', 'CONTRACT_EXISTS');

    const contract = this.contractRepository.create({
      chainId: dto.chainId,
      address,
      name: dto.name,
      contractType: dto.contractType ?? 'generic',
      abi: dto.abi,
      status: dto.status ?? 1,
      remark: dto.remark,
    });
    const saved = await this.contractRepository.save(contract);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateContractDto) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) throw new NotFoundException('合约不存在');

    if (dto.name !== undefined) contract.name = dto.name;
    if (dto.contractType !== undefined) contract.contractType = dto.contractType;
    if (dto.abi !== undefined) contract.abi = dto.abi;
    if (dto.status !== undefined) contract.status = dto.status;
    if (dto.remark !== undefined) contract.remark = dto.remark;

    await this.contractRepository.save(contract);
    return this.findOne(id);
  }

  async remove(id: number) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) throw new NotFoundException('合约不存在');
    await this.contractRepository.softRemove(contract);
    return { success: true };
  }

  async getListenOptions(id: number) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) throw new NotFoundException('合约不存在');
    const chain = await this.chainService.findByChainId(contract.chainId);
    return {
      contractId: contract.id,
      contractType: contract.contractType as ContractType,
      hasWebSocket: Boolean(chain?.wssUrls?.length),
      summary: LISTEN_GUIDE_SUMMARY,
      options: getListenOptionsForContract(contract.contractType as ContractType),
    };
  }

  async subscribeTransfer(id: number, fromBlock?: string) {
    const contract = await this.contractRepository.findOne({ where: { id } });
    if (!contract) throw new NotFoundException('合约不存在');
    if (contract.status !== 1) {
      throw new BusinessException('合约未启用', 'CONTRACT_DISABLED');
    }
    return this.eventSubscriptionService.createTransferSubscription({
      contractId: contract.id,
      fromBlock,
      remark: '一键 RPC Transfer 监听',
    });
  }
}
