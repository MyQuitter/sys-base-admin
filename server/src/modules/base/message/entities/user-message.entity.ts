import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../../entities/base.entity';

@Entity('sys_user_message')
@Index(['noticeId', 'userId'], { unique: true })
export class UserMessage extends BaseEntity {
  @Column({ name: 'user_id' })
  userId: number;

  @Column({ name: 'notice_id', nullable: true })
  noticeId?: number;

  @Column({ length: 100 })
  title: string;

  @Column({ type: 'text' })
  content: string;

  /** notice 公告 / system 系统消息 */
  @Column({ name: 'message_type', length: 20, default: 'notice' })
  messageType: string;

  /** 0 未读 1 已读 */
  @Column({ name: 'is_read', default: 0 })
  isRead: number;

  @Column({ name: 'read_at', type: 'datetime', nullable: true })
  readAt?: Date;

  /** 0 否 1 是，重要消息登录弹窗 */
  @Column({ name: 'is_popup', default: 0 })
  isPopup: number;

  @Column({ length: 20, default: 'normal' })
  priority: string;
}
