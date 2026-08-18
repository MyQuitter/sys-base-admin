import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Position } from '../../position/entities/position.entity';
import { Role } from '../../role/entities/role.entity';

@Entity('sys_user')
export class User extends BaseEntity {
  @Column({ name: 'user_name', length: 50, unique: true })
  username: string;

  @Column({ length: 100, select: false })
  password: string;

  @Column({ length: 50, nullable: true })
  nickname?: string;

  @Column({ default: 1 })
  status: number;

  @Column({ name: 'department_id', nullable: true })
  departmentId?: number;

  @Column({ name: 'wallet_address', length: 42, nullable: true, unique: true })
  walletAddress?: string;

  @Column({ name: 'wallet_bound_at', type: 'datetime', nullable: true })
  walletBoundAt?: Date;

  @Column({ name: 'wallet_bound_by', nullable: true })
  walletBoundBy?: number;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'sys_user_role',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'role_id' },
  })
  roles: Role[];

  @ManyToMany(() => Position, (position) => position.users, { eager: true })
  @JoinTable({
    name: 'sys_user_position',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'position_id' },
  })
  positions: Position[];
}
