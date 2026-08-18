import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Permission } from '../../permission/entities/permission.entity';
import { User } from '../../user/entities/user.entity';

@Entity('sys_role')
export class Role extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 200, nullable: true })
  description?: string;

  @ManyToMany(() => Permission, (permission) => permission.roles, { eager: true })
  @JoinTable({
    name: 'sys_role_permission',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: Permission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
