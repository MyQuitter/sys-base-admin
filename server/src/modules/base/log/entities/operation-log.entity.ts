import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

/** 操作审计日志：记录已认证用户的写操作与关键读操作 */
@Entity('sys_operation_log')
export class OperationLog extends BaseEntity {
  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column({ length: 50, nullable: true })
  username?: string;

  @Column({ length: 50 })
  module: string;

  @Column({ length: 50 })
  action: string;

  @Column({ length: 10 })
  method: string;

  @Column({ length: 255 })
  url: string;

  @Column({ length: 50, nullable: true })
  ip?: string;

  @Column({ default: 200 })
  status: number;

  @Column({ name: 'duration_ms', default: 0 })
  durationMs: number;
}
