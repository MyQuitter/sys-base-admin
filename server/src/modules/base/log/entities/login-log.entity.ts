import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** 登录审计日志：记录成功/失败尝试 */
@Entity('sys_login_log')
export class LoginLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 50 })
  username: string;

  @Column({ name: 'user_id', nullable: true })
  userId?: number;

  @Column({ length: 50, nullable: true })
  ip?: string;

  /** 1 成功 0 失败 */
  @Column({ default: 0 })
  status: number;

  @Column({ length: 200, nullable: true })
  message?: string;

  @Column({ name: 'login_type', length: 20, nullable: true })
  loginType?: string;

  /** admin 后台用户 member 会员用户 */
  @Column({ name: 'user_type', length: 20, default: 'admin' })
  userType: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
