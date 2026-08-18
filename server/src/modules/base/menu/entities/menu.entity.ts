import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

@Entity('sys_menu')
export class Menu extends BaseEntity {
  @Column({ name: 'parent_id', nullable: true })
  parentId?: number;

  @Column({ length: 50 })
  name: string;

  @Column({ length: 100, nullable: true })
  path?: string;

  @Column({ length: 50, nullable: true })
  icon?: string;

  @Column({ name: 'permission_code', length: 50, nullable: true })
  permissionCode?: string;

  @Column({ default: 0 })
  sort: number;

  @Column({ default: 1 })
  status: number;
}
