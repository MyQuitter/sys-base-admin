import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import {
  CreateEventSubscriptionDto,
  QueryEventSubscriptionDto,
  UpdateEventSubscriptionDto,
} from '../dto/event-subscription.dto';
import { Contract } from '../entities/contract.entity';
import { EventSubscription } from '../entities/event-subscription.entity';
import { parseAbiJson, resolveEventAbiItem, validateEventInAbi } from '../utils/abi';
import { EventSyncService } from './event-sync.service';

@Injectable()
export class EventSubscriptionService {
  constructor(
    @InjectRepository(EventSubscription)
    private readonly subscriptionRepository: Repository<EventSubscription>,
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    private readonly eventSyncService: EventSyncService,
  ) {}

  private toVo(sub: EventSubscription, contractName?: string) {
    return {
      id: sub.id,
      contractId: sub.contractId,
      contractName,
      chainId: sub.chainId,
      eventName: sub.eventName,
      status: sub.status,
      fromBlock: sub.fromBlock,
      lastScannedBlock: sub.lastScannedBlock,
      lastScannedAt: sub.lastScannedAt,
      nextScanAt: sub.nextScanAt,
      skippedBlocks: sub.skippedBlocks,
      remark: sub.remark,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    };
  }

  async findAll(query: QueryEventSubscriptionDto) {
    const { page, pageSize, skip } = getPagination(query);
    const qb = this.subscriptionRepository.createQueryBuilder('sub');

    if (query.contractId !== undefined) {
      qb.andWhere('sub.contractId = :contractId', { contractId: query.contractId });
    }
    if (query.chainId !== undefined) {
      qb.andWhere('sub.chainId = :chainId', { chainId: query.chainId });
    }
    if (query.status !== undefined) {
      qb.andWhere('sub.status = :status', { status: query.status });
    }

    qb.orderBy('sub.id', 'DESC').skip(skip).take(pageSize);
    const [items, total] = await qb.getManyAndCount();

    const contractIds = [...new Set(items.map((i) => i.contractId))];
    const contracts = contractIds.length
      ? await this.contractRepository.find({ where: { id: In(contractIds) } })
      : [];
    const nameMap = new Map(contracts.map((c) => [c.id, c.name]));

    return toPageResult(
      items.map((s) => this.toVo(s, nameMap.get(s.contractId))),
      total,
      page,
      pageSize,
    );
  }

  async findOne(id: number) {
    const sub = await this.subscriptionRepository.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('事件订阅不存在');
    const contract = await this.contractRepository.findOne({ where: { id: sub.contractId } });
    return this.toVo(sub, contract?.name);
  }

  private async getContractForSubscription(contractId: number) {
    const contract = await this.contractRepository.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合约不存在');
    if (contract.status !== 1) {
      throw new BusinessException('合约未启用', 'CONTRACT_DISABLED');
    }
    if (!contract.abi?.trim()) {
      throw new BusinessException('合约未配置 ABI，无法订阅事件', 'CONTRACT_ABI_REQUIRED');
    }
    return contract;
  }

  async create(dto: CreateEventSubscriptionDto) {
    const contract = await this.getContractForSubscription(dto.contractId);
    const abi = parseAbiJson(contract.abi!);
    validateEventInAbi(abi, dto.eventName);

    const exists = await this.subscriptionRepository.findOne({
      where: { contractId: dto.contractId, eventName: dto.eventName },
    });
    if (exists) throw new BusinessException('该合约事件已订阅', 'EVENT_SUB_EXISTS');

    const status = dto.status ?? 1;
    const sub = this.subscriptionRepository.create({
      contractId: contract.id,
      chainId: contract.chainId,
      eventName: dto.eventName,
      status,
      fromBlock: dto.fromBlock,
      remark: dto.remark,
      nextScanAt: status === 1 ? new Date() : undefined,
    });
    const saved = await this.subscriptionRepository.save(sub);
    void this.eventSyncService.refreshWebSocketWatchers();
    return this.findOne(saved.id);
  }

  /** 一键订阅 Transfer 事件（纯 RPC，无需完整 ABI） */
  async createTransferSubscription(input: {
    contractId: number;
    fromBlock?: string;
    remark?: string;
  }) {
    const contract = await this.contractRepository.findOne({ where: { id: input.contractId } });
    if (!contract) throw new NotFoundException('合约不存在');
    if (contract.status !== 1) {
      throw new BusinessException('合约未启用', 'CONTRACT_DISABLED');
    }

    const exists = await this.subscriptionRepository.findOne({
      where: { contractId: contract.id, eventName: 'Transfer' },
    });
    if (exists) throw new BusinessException('该合约 Transfer 事件已订阅', 'EVENT_SUB_EXISTS');

    const sub = this.subscriptionRepository.create({
      contractId: contract.id,
      chainId: contract.chainId,
      eventName: 'Transfer',
      status: 1,
      fromBlock: input.fromBlock,
      remark: input.remark,
      nextScanAt: new Date(),
    });
    const saved = await this.subscriptionRepository.save(sub);
    void this.eventSyncService.refreshWebSocketWatchers();
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateEventSubscriptionDto) {
    const sub = await this.subscriptionRepository.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('事件订阅不存在');

    if (dto.status !== undefined) {
      sub.status = dto.status;
      if (dto.status === 1) {
        sub.nextScanAt = new Date();
      } else {
        sub.nextScanAt = undefined;
      }
    }
    if (dto.fromBlock !== undefined) {
      sub.fromBlock = dto.fromBlock;
      sub.lastScannedBlock = undefined;
      sub.lastScannedAt = undefined;
      sub.skippedBlocks = undefined;
      if (sub.status === 1) sub.nextScanAt = new Date();
    }
    if (dto.remark !== undefined) sub.remark = dto.remark;

    await this.subscriptionRepository.save(sub);
    void this.eventSyncService.refreshWebSocketWatchers();
    return this.findOne(id);
  }

  async remove(id: number) {
    const sub = await this.subscriptionRepository.findOne({ where: { id } });
    if (!sub) throw new NotFoundException('事件订阅不存在');
    await this.subscriptionRepository.softRemove(sub);
    void this.eventSyncService.refreshWebSocketWatchers();
    return { success: true };
  }

  async findEnabled(): Promise<EventSubscription[]> {
    return this.subscriptionRepository.find({ where: { status: 1 }, order: { id: 'ASC' } });
  }
}
