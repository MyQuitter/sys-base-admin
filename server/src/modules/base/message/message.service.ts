import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { QueryMyMessageDto } from './dto/query-my-message.dto';
import { UserMessage } from './entities/user-message.entity';

/**
 * 后台用户个人消息收件箱。
 */
@Injectable()
export class MessageService {
  constructor(
    @InjectRepository(UserMessage)
    private readonly userMessageRepository: Repository<UserMessage>,
  ) {}

  private toVo(m: UserMessage) {
    return {
      id: m.id,
      noticeId: m.noticeId,
      title: m.title,
      content: m.content,
      messageType: m.messageType,
      isRead: m.isRead,
      isPopup: m.isPopup,
      priority: m.priority,
      readAt: m.readAt,
      createdAt: m.createdAt,
    };
  }

  async getUnreadCount(userId: number) {
    const count = await this.userMessageRepository.count({
      where: { userId, isRead: 0 },
    });
    return { count };
  }

  async findMine(userId: number, query: QueryMyMessageDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = { userId };
    if (query.isRead !== undefined) where.isRead = query.isRead;

    const [items, total] = await this.userMessageRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });
    return toPageResult(items.map((m) => this.toVo(m)), total, page, pageSize);
  }

  async findOne(userId: number, id: number) {
    const message = await this.userMessageRepository.findOne({ where: { id, userId } });
    if (!message) throw new NotFoundException('消息不存在');

    if (message.isRead === 0) {
      message.isRead = 1;
      message.readAt = new Date();
      await this.userMessageRepository.save(message);
    }

    return this.toVo(message);
  }

  async markRead(userId: number, id: number) {
    const message = await this.userMessageRepository.findOne({ where: { id, userId } });
    if (!message) throw new NotFoundException('消息不存在');
    if (message.isRead === 0) {
      message.isRead = 1;
      message.readAt = new Date();
      await this.userMessageRepository.save(message);
    }
    return this.toVo(message);
  }

  async markAllRead(userId: number) {
    const result = await this.userMessageRepository.update(
      { userId, isRead: 0 },
      { isRead: 1, readAt: new Date() },
    );
    return { updated: result.affected ?? 0 };
  }
}
