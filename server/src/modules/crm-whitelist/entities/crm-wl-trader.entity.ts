import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** 交易白名单快照（事件索引）；列表默认只展示 allowed=1 */
@Entity('crm_wl_trader')
@Unique(['address'])
export class CrmWlTrader extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  address: string;

  @Column({ type: 'tinyint', default: 0 })
  allowed: number;

  @Column({ name: 'block_number', type: 'bigint', default: 0 })
  blockNumber: string;

  @Column({ name: 'tx_hash', type: 'varchar', length: 88, nullable: true })
  txHash: string | null;

  @Column({ name: 'log_index', type: 'int', default: 0 })
  logIndex: number;

  @Column({ name: 'event_at', type: 'datetime', nullable: true })
  eventAt: Date | null;
}
