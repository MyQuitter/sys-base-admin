import { Column, Entity, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Role } from '../../role/entities/role.entity';

@Entity('sys_permission')
export class Permission extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 50, nullable: true })
  module?: string;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles: Role[];
}
