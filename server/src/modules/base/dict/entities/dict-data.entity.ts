import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

@Entity('sys_dict_data')
export class DictData extends BaseEntity {
  @Column({ name: 'type_id' })
  typeId: number;

  @Column({ length: 50 })
  label: string;

  @Column({ length: 50 })
  value: string;

  @Column({ default: 0 })
  sort: number;

  @Column({ default: 1 })
  status: number;
}
