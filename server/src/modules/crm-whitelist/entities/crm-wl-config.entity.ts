import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** CrmToken 白名单合约配置（单行业务配置，id 通常为 1） */
@Entity('crm_wl_config')
export class CrmWlConfig extends BaseEntity {
  @Column({ name: 'chain_id', type: 'int' })
  chainId: number;

  @Column({ name: 'token_address', type: 'varchar', length: 64, default: '' })
  tokenAddress: string;

  @Column({ name: 'business_address', type: 'varchar', length: 64, default: '' })
  businessAddress: string;

  /** modular | legacy —— 选用 CRAMTokenModular 或 CRMToken 全量 ABI */
  @Column({ name: 'token_abi_key', type: 'varchar', length: 32, default: 'modular' })
  tokenAbiKey: string;

  @Column({ name: 'trader_start_block', type: 'bigint', default: 0 })
  traderStartBlock: string;

  @Column({ name: 'node_start_block', type: 'bigint', default: 0 })
  nodeStartBlock: string;

  @Column({ name: 'relation_start_block', type: 'bigint', default: 0 })
  relationStartBlock: string;

  @Column({ name: 'trader_synced_block', type: 'bigint', default: 0 })
  traderSyncedBlock: string;

  @Column({ name: 'node_synced_block', type: 'bigint', default: 0 })
  nodeSyncedBlock: string;

  @Column({ name: 'relation_synced_block', type: 'bigint', default: 0 })
  relationSyncedBlock: string;
}
