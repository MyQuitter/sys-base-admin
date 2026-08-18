import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

@Entity('sys_notice')
export class Notice extends BaseEntity {
  @Column({ length: 100 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** 0 草稿 1 已发布 2 已撤回 */
  @Column({ default: 0 })
  status: number;

  /** announcement 公告 / notification 通知 */
  @Column({ name: 'notice_type', length: 20, default: 'announcement' })
  noticeType: string;

  /** all 全员 / user 指定用户 / dept 部门 / role 角色 */
  @Column({ name: 'target_type', length: 20, default: 'all' })
  targetType: string;

  @Column({ name: 'target_ids', type: 'json', nullable: true })
  targetIds?: number[];

  /** normal / important */
  @Column({ length: 20, default: 'normal' })
  priority: string;

  @Column({ name: 'publisher_id', nullable: true })
  publisherId?: number;

  @Column({ name: 'publish_time', type: 'datetime', nullable: true })
  publishTime?: Date;
}
