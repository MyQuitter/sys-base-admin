import { Column, Entity, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { User } from '../../user/entities/user.entity';

@Entity('sys_position')
export class Position extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 50 })
  name: string;

  @Column({ default: 0 })
  sort: number;

  @Column({ default: 1 })
  status: number;

  @ManyToMany(() => User, (user) => user.positions)
  users: User[];
}
