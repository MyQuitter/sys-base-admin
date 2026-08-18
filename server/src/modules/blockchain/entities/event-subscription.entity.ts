import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** 合约事件订阅配置 */
@Entity('bc_event_subscription')
export class EventSubscription extends BaseEntity {
  @Column({ name: 'contract_id' })
  contractId: number;

  @Column({ name: 'chain_id' })
  chainId: number;

  @Column({ name: 'event_name', length: 100 })
  eventName: string;

  /** 1 启用 0 禁用 */
  @Column({ default: 1 })
  status: number;

  /** 起始扫描区块（可选） */
  @Column({ name: 'from_block', type: 'bigint', nullable: true })
  fromBlock?: string;

  /** 已扫描到的最新区块 */
  @Column({ name: 'last_scanned_block', type: 'bigint', nullable: true })
  lastScannedBlock?: string;

  /** 最近一次扫描完成时间 */
  @Column({ name: 'last_scanned_at', type: 'datetime', nullable: true })
  lastScannedAt?: Date;

  /** 计划下次扫描时间（启用状态下由调度器维护） */
  @Column({ name: 'next_scan_at', type: 'datetime', nullable: true })
  nextScanAt?: Date;

  /** 因 RPC 单区块日志过密等原因跳过的区块号 */
  @Column({ name: 'skipped_blocks', type: 'json', nullable: true })
  skippedBlocks?: string[];

  @Column({ length: 500, nullable: true })
  remark?: string;
}
