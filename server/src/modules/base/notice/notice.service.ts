import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Like, Repository } from 'typeorm';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { QueryNoticeDto } from './dto/query-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { Notice } from './entities/notice.entity';

/**
 * 系统公告业务服务。
 */
@Injectable()
export class NoticeService {
  constructor(
    @InjectRepository(Notice)
    private readonly noticeRepository: Repository<Notice>,
  ) {}

  private toVo(n: Notice) {
    return {
      id: n.id,
      title: n.title,
      content: n.content,
      status: n.status,
      noticeType: n.noticeType,
      targetType: n.targetType,
      targetIds: n.targetIds,
      priority: n.priority,
      publisherId: n.publisherId,
      publishTime: n.publishTime,
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
    };
  }

  async findAll(query: QueryNoticeDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.title) where.title = Like(`%${query.title}%`);
    if (query.status !== undefined) where.status = query.status;
    const [items, total] = await this.noticeRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { id: 'DESC' },
    });
    return toPageResult(items.map((n) => this.toVo(n)), total, page, pageSize);
  }

  async findOne(id: number) {
    const n = await this.noticeRepository.findOne({ where: { id } });
    if (!n) throw new NotFoundException('公告不存在');
    return this.toVo(n);
  }

  async create(dto: CreateNoticeDto) {
    const notice = this.noticeRepository.create({
      title: dto.title,
      content: dto.content,
      status: 0,
      noticeType: dto.noticeType ?? 'announcement',
      targetType: dto.targetType ?? 'all',
      targetIds: dto.targetIds,
      priority: dto.priority ?? 'normal',
    });
    const saved = await this.noticeRepository.save(notice);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateNoticeDto) {
    const notice = await this.noticeRepository.findOne({ where: { id } });
    if (!notice) throw new NotFoundException('公告不存在');
    if (notice.status !== 0) {
      throw new BadRequestException('仅草稿状态可编辑');
    }
    if (dto.title !== undefined) notice.title = dto.title;
    if (dto.content !== undefined) notice.content = dto.content;
    if (dto.noticeType !== undefined) notice.noticeType = dto.noticeType;
    if (dto.targetType !== undefined) notice.targetType = dto.targetType;
    if (dto.targetIds !== undefined) notice.targetIds = dto.targetIds;
    if (dto.priority !== undefined) notice.priority = dto.priority;
    await this.noticeRepository.save(notice);
    return this.findOne(id);
  }

  async remove(id: number) {
    const notice = await this.noticeRepository.findOne({ where: { id } });
    if (!notice) throw new NotFoundException('公告不存在');
    await this.noticeRepository.softRemove(notice);
    return { success: true };
  }
}
