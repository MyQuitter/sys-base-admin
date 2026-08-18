import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserMessage } from '../message/entities/user-message.entity';
import { User } from '../user/entities/user.entity';
import { PublishNoticeDto } from './dto/publish-notice.dto';
import { Notice } from './entities/notice.entity';

const BATCH_SIZE = 500;

/**
 * 公告发布投递：解析后台用户范围并写入个人收件箱。
 */
@Injectable()
export class NoticePublishService {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepository: Repository<Notice>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserMessage)
    private readonly userMessageRepository: Repository<UserMessage>,
  ) {}

  async resolveTargetUserIds(targetType: string, targetIds?: number[]): Promise<number[]> {
    const enabledUsers = await this.userRepository.find({
      where: { status: 1 },
      relations: { roles: true },
    });

    if (targetType === 'all') {
      return enabledUsers.map((u) => u.id);
    }

    const ids = targetIds ?? [];
    if (!ids.length) {
      throw new BadRequestException('请指定投递目标');
    }

    if (targetType === 'user') {
      const idSet = new Set(ids);
      return enabledUsers.filter((u) => idSet.has(u.id)).map((u) => u.id);
    }

    if (targetType === 'dept') {
      const idSet = new Set(ids);
      return enabledUsers.filter((u) => u.departmentId && idSet.has(u.departmentId)).map((u) => u.id);
    }

    if (targetType === 'role') {
      const idSet = new Set(ids);
      return enabledUsers
        .filter((u) => u.roles?.some((r) => idSet.has(r.id)))
        .map((u) => u.id);
    }

    throw new BadRequestException('不支持的投递范围');
  }

  async publish(noticeId: number, publisherId: number, dto?: PublishNoticeDto) {
    const notice = await this.noticeRepository.findOne({ where: { id: noticeId } });
    if (!notice) throw new BadRequestException('公告不存在');
    if (notice.status !== 0) throw new BadRequestException('仅草稿状态可发布');

    const targetType = dto?.targetType ?? notice.targetType;
    const targetIds = dto?.targetIds ?? notice.targetIds;
    const userIds = await this.resolveTargetUserIds(targetType, targetIds);
    if (!userIds.length) throw new BadRequestException('投递范围内无可用后台用户');

    notice.status = 1;
    notice.publishTime = new Date();
    notice.publisherId = publisherId;
    notice.targetType = targetType;
    notice.targetIds = targetIds;
    await this.noticeRepository.save(notice);

    const isPopup = notice.priority === 'important' ? 1 : 0;
    const rows = userIds.map((userId) => ({
      userId,
      noticeId: notice.id,
      title: notice.title,
      content: notice.content,
      messageType: 'notice',
      isRead: 0,
      isPopup,
      priority: notice.priority,
    }));

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      await this.userMessageRepository.insert(rows.slice(i, i + BATCH_SIZE));
    }

    return {
      noticeId: notice.id,
      deliveredCount: userIds.length,
      publishTime: notice.publishTime,
    };
  }

  async revoke(noticeId: number) {
    const notice = await this.noticeRepository.findOne({ where: { id: noticeId } });
    if (!notice) throw new BadRequestException('公告不存在');
    if (notice.status !== 1) throw new BadRequestException('仅已发布公告可撤回');

    notice.status = 2;
    await this.noticeRepository.save(notice);
    return { noticeId: notice.id, status: notice.status };
  }
}
