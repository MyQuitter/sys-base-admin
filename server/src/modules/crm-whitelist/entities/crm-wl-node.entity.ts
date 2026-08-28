import { Column, Entity, Unique } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** 节点白名单快照；列表默认只展示 level>0 */
@Entity('crm_wl_node')
@Unique(['address'])
export class CrmWlNode extends BaseEntity {
  @Column({ type: 'varchar', length: 64 })
  address: string;

  @Column({ type: 'tinyint', default: 0 })
  level: number;

  @Column({ name: 'block_number', type: 'bigint', default: 0 })
  blockNumber: string;

  @Column({ name: 'tx_hash', type: 'varchar', length: 88, nullable: true })
  txHash: string | null;

  @Column({ name: 'log_index', type: 'int', default: 0 })
  logIndex: number;

  @Column({ name: 'event_at', type: 'datetime', nullable: true })
  eventAt: Date | null;
}
