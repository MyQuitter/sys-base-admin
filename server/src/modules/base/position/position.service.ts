import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { getPagination, toPageResult } from '../../../common/utils/pagination';
import { CreatePositionDto } from './dto/create-position.dto';
import { QueryPositionDto } from './dto/query-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';
import { Position } from './entities/position.entity';

/**
 * 岗位业务服务。
 */
@Injectable()
export class PositionService {
  constructor(
    @InjectRepository(Position)
    private readonly positionRepository: Repository<Position>,
  ) {}

  private toVo(p: Position) {
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      sort: p.sort,
      status: p.status,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async findAll(query: QueryPositionDto) {
    const { page, pageSize, skip } = getPagination(query);
    const where: Record<string, unknown> = {};
    if (query.status !== undefined) where.status = query.status;
    const [items, total] = await this.positionRepository.findAndCount({
      where,
      skip,
      take: pageSize,
      order: { sort: 'ASC', id: 'ASC' },
    });
    return toPageResult(items.map((p) => this.toVo(p)), total, page, pageSize);
  }

  async findOne(id: number) {
    const p = await this.positionRepository.findOne({ where: { id } });
    if (!p) throw new NotFoundException('岗位不存在');
    return this.toVo(p);
  }

  async create(dto: CreatePositionDto) {
    const exists = await this.positionRepository.findOne({ where: { code: dto.code } });
    if (exists) throw new BusinessException('岗位编码已存在', 'POSITION_EXISTS');
    const p = this.positionRepository.create(dto);
    const saved = await this.positionRepository.save(p);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdatePositionDto) {
    const p = await this.positionRepository.findOne({ where: { id } });
    if (!p) throw new NotFoundException('岗位不存在');
    if (dto.name !== undefined) p.name = dto.name;
    if (dto.sort !== undefined) p.sort = dto.sort;
    if (dto.status !== undefined) p.status = dto.status;
    await this.positionRepository.save(p);
    return this.findOne(id);
  }

  async remove(id: number) {
    const p = await this.positionRepository.findOne({ where: { id } });
    if (!p) throw new NotFoundException('岗位不存在');
    await this.positionRepository.softRemove(p);
    return { success: true };
  }
}
