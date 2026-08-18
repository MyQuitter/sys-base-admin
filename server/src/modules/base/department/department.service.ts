import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { Department } from './entities/department.entity';

export interface DepartmentTreeNode {
  id: number;
  name: string;
  code: string;
  parentId?: number;
  leader?: string;
  phone?: string;
  sort: number;
  status: number;
  children?: DepartmentTreeNode[];
}

/**
 * 部门业务服务：树形组织架构 CRUD。
 */
@Injectable()
export class DepartmentService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepository: Repository<Department>,
  ) {}

  private toVo(dept: Department): Omit<DepartmentTreeNode, 'children'> {
    return {
      id: dept.id,
      name: dept.name,
      code: dept.code,
      parentId: dept.parentId,
      leader: dept.leader,
      phone: dept.phone,
      sort: dept.sort,
      status: dept.status,
    };
  }

  private buildTree(list: Department[], parentId?: number): DepartmentTreeNode[] {
    return list
      .filter((d) => (d.parentId ?? null) === (parentId ?? null))
      .sort((a, b) => a.sort - b.sort)
      .map((d) => {
        const children = this.buildTree(list, d.id);
        const node: DepartmentTreeNode = this.toVo(d);
        if (children.length) node.children = children;
        return node;
      });
  }

  /** 获取部门树 */
  async getTree() {
    const list = await this.departmentRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
    return this.buildTree(list);
  }

  /** 扁平列表 */
  async findAll() {
    const list = await this.departmentRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
    return list.map((d) => this.toVo(d));
  }

  async findOne(id: number) {
    const dept = await this.departmentRepository.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    return this.toVo(dept);
  }

  async create(dto: CreateDepartmentDto) {
    const exists = await this.departmentRepository.findOne({ where: { code: dto.code } });
    if (exists) throw new BusinessException('部门编码已存在', 'DEPT_EXISTS');
    const dept = this.departmentRepository.create({
      parentId: dto.parentId,
      name: dto.name,
      code: dto.code,
      leader: dto.leader,
      phone: dto.phone,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
    });
    const saved = await this.departmentRepository.save(dept);
    return this.findOne(saved.id);
  }

  async update(id: number, dto: UpdateDepartmentDto) {
    const dept = await this.departmentRepository.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    if (dto.parentId !== undefined) dept.parentId = dto.parentId;
    if (dto.name !== undefined) dept.name = dto.name;
    if (dto.code !== undefined) dept.code = dto.code;
    if (dto.leader !== undefined) dept.leader = dto.leader;
    if (dto.phone !== undefined) dept.phone = dto.phone;
    if (dto.sort !== undefined) dept.sort = dto.sort;
    if (dto.status !== undefined) dept.status = dto.status;
    await this.departmentRepository.save(dept);
    return this.findOne(id);
  }

  async remove(id: number) {
    const dept = await this.departmentRepository.findOne({ where: { id } });
    if (!dept) throw new NotFoundException('部门不存在');
    const childCount = await this.departmentRepository.count({ where: { parentId: id } });
    if (childCount > 0) throw new BusinessException('请先删除子部门', 'DEPT_HAS_CHILDREN');
    await this.departmentRepository.softRemove(dept);
    return { success: true };
  }
}
