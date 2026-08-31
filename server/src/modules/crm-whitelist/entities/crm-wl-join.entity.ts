import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/**
 * 链上入金记录：每条对应一次 ParticipationAdded（participationId 全网递增）。
 */
@Entity('crm_wl_join')
@Unique(['participationId'])
export class CrmWlJoin extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  address: string;

  /** 合约 participationId */
  @Column({ name: 'participation_id', type: 'varchar', length: 32 })
  participationId: string;

  @Column({ name: 'bnb_amount', type: 'decimal', precision: 36, scale: 0, default: 0 })
  bnbAmount: string;

  @Column({ name: 'participation_usd', type: 'decimal', precision: 36, scale: 0, default: 0 })
  participationUsd: string;

  @Column({ name: 'quota_usd', type: 'decimal', precision: 36, scale: 0, default: 0 })
  quotaUsd: string;

  @Column({ name: 'block_number', type: 'bigint', default: 0 })
  blockNumber: string;

  @Column({ name: 'tx_hash', type: 'varchar', length: 88, nullable: true })
  txHash: string | null;

  @Column({ name: 'log_index', type: 'int', default: 0 })
  logIndex: number;

  @Column({ name: 'event_at', type: 'datetime', nullable: true })
  eventAt: Date | null;
}
