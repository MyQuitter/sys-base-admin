import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';
import { Menu } from '../../menu/entities/menu.entity';
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

  /** 为 true 时侧栏只展示本角色勾选的菜单，不再按权限码推断 */
  @Column({ name: 'menu_restricted', default: false })
  menuRestricted: boolean;

  @ManyToMany(() => Permission, (permission) => permission.roles, { eager: true })
  @JoinTable({
    name: 'sys_role_permission',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'permission_id' },
  })
  permissions: Permission[];

  @ManyToMany(() => Menu, (menu) => menu.roles)
  @JoinTable({
    name: 'sys_role_menu',
    joinColumn: { name: 'role_id' },
    inverseJoinColumn: { name: 'menu_id' },
  })
  menus: Menu[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];
}
