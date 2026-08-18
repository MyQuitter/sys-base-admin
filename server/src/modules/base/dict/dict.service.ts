import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { CreateDictDataDto } from './dto/create-dict-data.dto';
import { CreateDictTypeDto } from './dto/create-dict-type.dto';
import { QueryDictDataDto } from './dto/query-dict-data.dto';
import { UpdateDictDataDto } from './dto/update-dict-data.dto';
import { UpdateDictTypeDto } from './dto/update-dict-type.dto';
import { DictData } from './entities/dict-data.entity';
import { DictType } from './entities/dict-type.entity';

/**
 * 字典业务服务：字典类型与字典数据主从维护。
 */
@Injectable()
export class DictService {
  constructor(
    @InjectRepository(DictType)
    private readonly dictTypeRepository: Repository<DictType>,
    @InjectRepository(DictData)
    private readonly dictDataRepository: Repository<DictData>,
  ) {}

  async findAllTypes() {
    const types = await this.dictTypeRepository.find({ order: { id: 'ASC' } });
    return types.map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    }));
  }

  async createType(dto: CreateDictTypeDto) {
    const exists = await this.dictTypeRepository.findOne({ where: { code: dto.code } });
    if (exists) throw new BusinessException('字典类型编码已存在', 'DICT_TYPE_EXISTS');
    const saved = await this.dictTypeRepository.save(this.dictTypeRepository.create(dto));
    return { id: saved.id, code: saved.code, name: saved.name, status: saved.status };
  }

  async updateType(id: number, dto: UpdateDictTypeDto) {
    const type = await this.dictTypeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException('字典类型不存在');
    if (dto.name !== undefined) type.name = dto.name;
    if (dto.status !== undefined) type.status = dto.status;
    await this.dictTypeRepository.save(type);
    return { id: type.id, code: type.code, name: type.name, status: type.status };
  }

  async removeType(id: number) {
    const type = await this.dictTypeRepository.findOne({ where: { id } });
    if (!type) throw new NotFoundException('字典类型不存在');
    const dataCount = await this.dictDataRepository.count({ where: { typeId: id } });
    if (dataCount > 0) throw new BusinessException('请先删除该类型下的字典数据', 'DICT_TYPE_HAS_DATA');
    await this.dictTypeRepository.softRemove(type);
    return { success: true };
  }

  async findAllData(query: QueryDictDataDto) {
    const where: Record<string, unknown> = {};
    if (query.typeId !== undefined) where.typeId = query.typeId;
    const list = await this.dictDataRepository.find({
      where,
      order: { sort: 'ASC', id: 'ASC' },
    });
    return list.map((d) => ({
      id: d.id,
      typeId: d.typeId,
      label: d.label,
      value: d.value,
      sort: d.sort,
      status: d.status,
    }));
  }

  async createData(dto: CreateDictDataDto) {
    const type = await this.dictTypeRepository.findOne({ where: { id: dto.typeId } });
    if (!type) throw new NotFoundException('字典类型不存在');
    const saved = await this.dictDataRepository.save(this.dictDataRepository.create(dto));
    return {
      id: saved.id,
      typeId: saved.typeId,
      label: saved.label,
      value: saved.value,
      sort: saved.sort,
      status: saved.status,
    };
  }

  async updateData(id: number, dto: UpdateDictDataDto) {
    const data = await this.dictDataRepository.findOne({ where: { id } });
    if (!data) throw new NotFoundException('字典数据不存在');
    if (dto.typeId !== undefined) data.typeId = dto.typeId;
    if (dto.label !== undefined) data.label = dto.label;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.sort !== undefined) data.sort = dto.sort;
    if (dto.status !== undefined) data.status = dto.status;
    await this.dictDataRepository.save(data);
    return {
      id: data.id,
      typeId: data.typeId,
      label: data.label,
      value: data.value,
      sort: data.sort,
      status: data.status,
    };
  }

  async removeData(id: number) {
    const data = await this.dictDataRepository.findOne({ where: { id } });
    if (!data) throw new NotFoundException('字典数据不存在');
    await this.dictDataRepository.softRemove(data);
    return { success: true };
  }
}
