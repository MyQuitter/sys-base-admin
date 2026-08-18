import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 系统防护日志：认证/钱包相关安全事件 */
@Entity('sys_protection_log')
export class ProtectionLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 20 })
  category: string;

  @Column({ name: 'event_type', length: 50 })
  eventType: string;

  @Column({ name: 'error_code', length: 50 })
  errorCode: string;

  @Column({ length: 50, nullable: true })
  username?: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column({ name: 'wallet_address', length: 42, nullable: true })
  walletAddress?: string;

  @Column({ length: 50, nullable: true })
  ip?: string;

  @Column({ length: 200, nullable: true })
  path?: string;

  @Column({ length: 500 })
  message: string;

  @Column({ length: 10 })
  severity: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
