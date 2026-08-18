import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

@Entity('sys_department')
export class Department extends BaseEntity {
  @Column({ name: 'parent_id', nullable: true })
  parentId?: number;

  @Column({ length: 50 })
  name!: string;

  @Column({ length: 50, unique: true })
  code!: string;

  @Column({ length: 50, nullable: true })
  leader?: string;

  @Column({ length: 20, nullable: true })
  phone?: string;

  @Column({ default: 0 })
  sort!: number;

  @Column({ default: 1 })
  status!: number;
}
