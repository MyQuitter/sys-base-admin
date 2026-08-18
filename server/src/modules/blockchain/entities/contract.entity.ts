import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

export type ContractType = 'erc20' | 'erc721' | 'generic';

/** 链上合约登记 */
@Entity('bc_contract')
export class Contract extends BaseEntity {
  @Column({ name: 'chain_id' })
  chainId: number;

  @Column({ length: 42 })
  address: string;

  @Column({ length: 100 })
  name: string;

  @Column({ name: 'contract_type', length: 20, default: 'generic' })
  contractType: ContractType;

  @Column({ type: 'text', nullable: true })
  abi?: string;

  @Column({ default: 1 })
  status: number;

  @Column({ length: 500, nullable: true })
  remark?: string;

  /** 交易同步已处理到的最新区块 */
  @Column({ name: 'last_tx_sync_block', type: 'bigint', nullable: true })
  lastTxSyncBlock?: string;

  /** 最近一次交易同步时间 */
  @Column({ name: 'last_tx_synced_at', type: 'datetime', nullable: true })
  lastTxSyncedAt?: Date;
}
