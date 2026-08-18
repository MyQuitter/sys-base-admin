import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

@Entity('sys_dict_type')
export class DictType extends BaseEntity {
  @Column({ length: 50, unique: true })
  code: string;

  @Column({ length: 50 })
  name: string;

  @Column({ default: 1 })
  status: number;
}
