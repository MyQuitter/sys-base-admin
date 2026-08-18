import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../entities/base.entity';

/** C 端会员用户 */
@Entity('app_member')
export class Member extends BaseEntity {
  @Column({ length: 20, nullable: true, unique: true })
  phone?: string;

  @Column({ length: 100, nullable: true, unique: true })
  email?: string;

  @Column({ length: 100, select: false })
  password: string;

  @Column({ length: 50, nullable: true })
  nickname?: string;

  @Column({ length: 500, nullable: true })
  avatar?: string;

  @Column({ default: 1 })
  status: number;

  @Column({ name: 'register_source', length: 20, default: 'app' })
  registerSource: string;

  @Column({ name: 'last_login_at', type: 'datetime', nullable: true })
  lastLoginAt?: Date;

  @Column({ name: 'last_login_ip', length: 50, nullable: true })
  lastLoginIp?: string;
}
