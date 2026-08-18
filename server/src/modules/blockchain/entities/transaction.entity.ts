import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

export type TxRecordStatus = 'pending' | 'success' | 'failed';
export type TxRecordType = 'manual' | 'sync';

/** 链上交易记录（监控用，非全量索引） */
@Entity('bc_transaction')
export class TransactionRecord extends BaseEntity {
  @Column({ name: 'tx_hash', length: 66 })
  txHash: string;

  @Column({ name: 'chain_id' })
  chainId: number;

  @Column({ length: 42, nullable: true })
  from?: string;

  @Column({ length: 42, nullable: true })
  to?: string;

  @Column({ name: 'contract_id', nullable: true })
  contractId?: number;

  @Column({ name: 'tx_type', length: 20, default: 'manual' })
  txType: TxRecordType;

  @Column({ length: 20, default: 'pending' })
  status: TxRecordStatus;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber?: string;

  @Column({ name: 'gas_used', type: 'bigint', nullable: true })
  gasUsed?: string;

  @Column({ name: 'biz_ref', length: 100, nullable: true })
  bizRef?: string;

  @Column({ name: 'error_message', length: 500, nullable: true })
  errorMessage?: string;

  /** 最近一次同步尝试时间 */
  @Column({ name: 'last_synced_at', type: 'datetime', nullable: true })
  lastSyncedAt?: Date;

  /** 计划下次同步时间（pending 状态下由调度器维护） */
  @Column({ name: 'next_sync_at', type: 'datetime', nullable: true })
  nextSyncAt?: Date;
}
