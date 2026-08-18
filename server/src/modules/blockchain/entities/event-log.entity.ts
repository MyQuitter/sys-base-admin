import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** 合约事件日志（订阅抓取结果） */
@Entity('bc_event_log')
@Index(['chainId', 'txHash', 'logIndex'], { unique: true })
export class EventLog extends BaseEntity {
  @Column({ name: 'subscription_id' })
  subscriptionId: number;

  @Column({ name: 'contract_id' })
  contractId: number;

  @Column({ name: 'chain_id' })
  chainId: number;

  @Column({ name: 'event_name', length: 100 })
  eventName: string;

  @Column({ name: 'tx_hash', length: 66 })
  txHash: string;

  @Column({ name: 'block_number', type: 'bigint' })
  blockNumber: string;

  @Column({ name: 'log_index', type: 'int' })
  logIndex: number;

  @Column({ type: 'json', nullable: true })
  args?: Record<string, unknown>;

  @Column({ name: 'raw_topics', type: 'json', nullable: true })
  rawTopics?: string[];
}
