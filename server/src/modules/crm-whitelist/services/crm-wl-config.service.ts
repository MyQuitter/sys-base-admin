import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getAddress } from 'viem';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { UpdateCrmWlConfigDto } from '../dto/crm-wl.dto';
import { CrmTeamMember } from '../entities/crm-team-member.entity';
import { CrmWlConfig } from '../entities/crm-wl-config.entity';
import { CrmWlNode } from '../entities/crm-wl-node.entity';
import { CrmWlTrader } from '../entities/crm-wl-trader.entity';

@Injectable()
export class CrmWlConfigService {
  constructor(
    @InjectRepository(CrmWlConfig)
    private readonly configRepository: Repository<CrmWlConfig>,
    @InjectRepository(CrmWlTrader)
    private readonly traderRepository: Repository<CrmWlTrader>,
    @InjectRepository(CrmWlNode)
    private readonly nodeRepository: Repository<CrmWlNode>,
    @InjectRepository(CrmTeamMember)
    private readonly teamRepository: Repository<CrmTeamMember>,
  ) {}

  private toVo(row: CrmWlConfig) {
    return {
      id: row.id,
      chainId: row.chainId,
      tokenAddress: row.tokenAddress,
      businessAddress: row.businessAddress,
      tokenAbiKey: row.tokenAbiKey,
      traderStartBlock: row.traderStartBlock,
      nodeStartBlock: row.nodeStartBlock,
      relationStartBlock: row.relationStartBlock,
      traderSyncedBlock: row.traderSyncedBlock,
      nodeSyncedBlock: row.nodeSyncedBlock,
      relationSyncedBlock: row.relationSyncedBlock,
      updatedAt: row.updatedAt,
    };
  }

  private async findOneRow() {
    return this.configRepository.find({ order: { id: 'ASC' }, take: 1 }).then((rows) => rows[0] ?? null);
  }

  async getOrEmpty() {
    const row = await this.findOneRow();
    if (!row) {
      return {
        id: null as number | null,
        chainId: null as number | null,
        tokenAddress: '',
        businessAddress: '',
        tokenAbiKey: 'modular',
        traderStartBlock: '0',
        nodeStartBlock: '0',
        relationStartBlock: '0',
        traderSyncedBlock: '0',
        nodeSyncedBlock: '0',
        relationSyncedBlock: '0',
        updatedAt: null as Date | null,
      };
    }
    return this.toVo(row);
  }

  async requireConfig(): Promise<CrmWlConfig> {
    const row = await this.findOneRow();
    if (!row?.tokenAddress || !row?.businessAddress) {
      throw new BusinessException('请先在配置页填写 Token / Business 合约地址', 'CRM_WL_CONFIG_MISSING');
    }
    return row;
  }

  /** 清空白名单与团队索引，游标回到起始块前一块，便于从头重扫 */
  private async resetIndexedData(row: CrmWlConfig) {
    const traderStart = BigInt(row.traderStartBlock || '0');
    const nodeStart = BigInt(row.nodeStartBlock || '0');
    const relationStart = BigInt(row.relationStartBlock || '0');
    row.traderSyncedBlock = traderStart > 0n ? (traderStart - 1n).toString() : '0';
    row.nodeSyncedBlock = nodeStart > 0n ? (nodeStart - 1n).toString() : '0';
    row.relationSyncedBlock = relationStart > 0n ? (relationStart - 1n).toString() : '0';

    await Promise.all([
      this.traderRepository.createQueryBuilder().delete().execute(),
      this.nodeRepository.createQueryBuilder().delete().execute(),
      this.teamRepository.createQueryBuilder().delete().execute(),
    ]);
  }

  async upsert(dto: UpdateCrmWlConfigDto) {
    let row = await this.findOneRow();
    if (!row) {
      row = this.configRepository.create({
        chainId: dto.chainId,
        tokenAddress: '',
        businessAddress: '',
        tokenAbiKey: 'modular',
        traderStartBlock: '0',
        nodeStartBlock: '0',
        relationStartBlock: '0',
        traderSyncedBlock: '0',
        nodeSyncedBlock: '0',
        relationSyncedBlock: '0',
      });
    }

    let nextToken = '';
    let nextBusiness = '';
    try {
      nextToken = getAddress(dto.tokenAddress);
      nextBusiness = getAddress(dto.businessAddress);
    } catch {
      throw new BusinessException('合约地址无效', 'CRM_WL_INVALID_ADDRESS');
    }

    const nextTraderStart = dto.traderStartBlock ?? row.traderStartBlock;
    const nextNodeStart = dto.nodeStartBlock ?? row.nodeStartBlock;
    const nextRelationStart = dto.relationStartBlock ?? row.relationStartBlock;
    const shouldReset =
      !row.tokenAddress ||
      !row.businessAddress ||
      row.chainId !== dto.chainId ||
      row.tokenAddress.toLowerCase() !== nextToken.toLowerCase() ||
      row.businessAddress.toLowerCase() !== nextBusiness.toLowerCase() ||
      String(row.traderStartBlock || '0') !== String(nextTraderStart || '0') ||
      String(row.nodeStartBlock || '0') !== String(nextNodeStart || '0') ||
      String(row.relationStartBlock || '0') !== String(nextRelationStart || '0');

    row.tokenAddress = nextToken;
    row.businessAddress = nextBusiness;
    row.chainId = dto.chainId;
    row.tokenAbiKey = dto.tokenAbiKey ?? 'modular';
    if (dto.traderStartBlock !== undefined) row.traderStartBlock = dto.traderStartBlock;
    if (dto.nodeStartBlock !== undefined) row.nodeStartBlock = dto.nodeStartBlock;
    if (dto.relationStartBlock !== undefined) row.relationStartBlock = dto.relationStartBlock;

    if (shouldReset) {
      await this.resetIndexedData(row);
    }
    const saved = await this.configRepository.save(row);
    return { ...this.toVo(saved), resetIndexed: shouldReset };
  }

  async saveSynced(kind: 'trader' | 'node' | 'relation', block: bigint) {
    const row = await this.findOneRow();
    if (!row) throw new NotFoundException('配置不存在');
    if (kind === 'trader') row.traderSyncedBlock = block.toString();
    else if (kind === 'node') row.nodeSyncedBlock = block.toString();
    else row.relationSyncedBlock = block.toString();
    await this.configRepository.save(row);
  }
}
