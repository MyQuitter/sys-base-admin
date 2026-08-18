import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { SyncContractTxDto } from '../dto/contract.dto';
import { Chain } from '../entities/chain.entity';
import { Contract } from '../entities/contract.entity';
import { fetchExplorerTxList, resolveExplorerApiUrl } from '../utils/explorer-api';
import { TransactionService } from './transaction.service';

const PAGE_SIZE = 100;
const MAX_PAGES = 100;
type ExplorerAction = 'txlist' | 'txlistinternal' | 'tokentx';

@Injectable()
export class ContractTxSyncService {
  private readonly logger = new Logger(ContractTxSyncService.name);
  private readonly syncingContractIds = new Set<number>();

  constructor(
    @InjectRepository(Contract)
    private readonly contractRepository: Repository<Contract>,
    @InjectRepository(Chain)
    private readonly chainRepository: Repository<Chain>,
    private readonly transactionService: TransactionService,
    private readonly config: ConfigService,
  ) {}

  private getExplorerApiKey(chainId: number): string | undefined {
    const keys = this.config.get<Record<string, string>>('blockchain.explorerApiKeys', {});
    return keys[String(chainId)] ?? this.config.get<string>('blockchain.explorerApiKey');
  }

  async syncTransactions(contractId: number, dto: SyncContractTxDto = {}) {
    if (this.syncingContractIds.has(contractId)) {
      throw new ConflictException('该合约正在同步中');
    }

    const contract = await this.contractRepository.findOne({ where: { id: contractId } });
    if (!contract) throw new NotFoundException('合约不存在');

    const chain = await this.chainRepository.findOne({ where: { chainId: contract.chainId, status: 1 } });
    if (!chain) throw new BusinessException('链未启用或不存在', 'CHAIN_NOT_FOUND');

    const apiUrl = resolveExplorerApiUrl(chain.chainId, chain.explorerUrl);
    if (!apiUrl) {
      throw new BusinessException('该链未配置浏览器 API 地址', 'EXPLORER_API_NOT_CONFIGURED');
    }

    const apiKey = this.getExplorerApiKey(chain.chainId);
    if (!apiKey) {
      throw new BusinessException(
        `未配置浏览器 API Key，请设置环境变量 BC_EXPLORER_API_KEY_${chain.chainId} 或 BC_EXPLORER_API_KEY`,
        'EXPLORER_API_KEY_REQUIRED',
      );
    }

    this.syncingContractIds.add(contractId);
    try {
      if (dto.reset) {
        contract.lastTxSyncBlock = undefined;
      }

      const startBlock =
        dto.startBlock !== undefined
          ? dto.startBlock
          : contract.lastTxSyncBlock
            ? Number(contract.lastTxSyncBlock) + 1
            : 0;

      this.logger.log(
        `开始同步合约交易 contractId=${contract.id} chainId=${contract.chainId} address=${contract.address} apiUrl=${apiUrl} startBlock=${startBlock} reset=${dto.reset === true}`,
      );

      let imported = 0;
      let skipped = 0;
      let maxBlock = contract.lastTxSyncBlock ? Number(contract.lastTxSyncBlock) : startBlock - 1;
      const actions: ExplorerAction[] = ['txlist', 'txlistinternal'];
      if (contract.contractType === 'erc20' || contract.contractType === 'generic') {
        actions.push('tokentx');
      }

      for (const action of actions) {
        let page = 1;
        while (page <= MAX_PAGES) {
          const items = await fetchExplorerTxList({
            apiUrl,
            apiKey,
            chainId: contract.chainId,
            address: contract.address,
            startBlock,
            page,
            offset: PAGE_SIZE,
            action,
          });
          this.logger.log(
            `合约交易同步查询 contractId=${contract.id} action=${action} page=${page} size=${items.length}`,
          );
          if (!items.length) break;

          for (const item of items) {
            const result = await this.transactionService.importExplorerTx({
              chainId: contract.chainId,
              contractId: contract.id,
              txHash: item.hash,
              from: item.from,
              to: item.to,
              blockNumber: item.blockNumber,
              gasUsed: item.gasUsed,
              isError: item.isError,
              txreceiptStatus: item.txreceipt_status,
            });
            if (result === 'imported') imported += 1;
            else skipped += 1;

            const blockNum = Number(item.blockNumber);
            if (blockNum > maxBlock) maxBlock = blockNum;
          }

          if (items.length < PAGE_SIZE) break;
          page += 1;
        }
      }

      if (maxBlock >= startBlock) {
        contract.lastTxSyncBlock = String(maxBlock);
      }
      contract.lastTxSyncedAt = new Date();
      await this.contractRepository.save(contract);

      this.logger.log(
        `合约交易同步完成 contractId=${contractId} imported=${imported} skipped=${skipped} lastBlock=${contract.lastTxSyncBlock ?? '-'}`,
      );

      return {
        imported,
        skipped,
        lastBlock: contract.lastTxSyncBlock,
        lastSyncedAt: contract.lastTxSyncedAt,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`合约交易同步失败 contractId=${contractId}: ${msg}`);
      throw new BusinessException(msg, 'EXPLORER_API_ERROR');
    } finally {
      this.syncingContractIds.delete(contractId);
    }
  }
}
