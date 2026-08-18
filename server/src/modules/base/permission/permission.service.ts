import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { Permission } from './entities/permission.entity';

/**
 * 权限点业务服务：维护 `{模块}:{操作}` 格式的权限码。
 */
@Injectable()
export class PermissionService {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  /**
   * 查询全部权限，按模块与 ID 排序，供角色分配权限树使用。
   */
  async findAll() {
    const permissions = await this.permissionRepository.find({ order: { module: 'ASC', id: 'ASC' } });
    return permissions.map((p) => ({
      id: p.id,
      code: p.code,
      name: p.name,
      module: p.module,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  }

  /**
   * 创建权限点，编码全局唯一。
   * @throws BusinessException 权限编码已存在（PERMISSION_EXISTS）
   */
  async create(dto: CreatePermissionDto) {
    const exists = await this.permissionRepository.findOne({ where: { code: dto.code } });
    if (exists) throw new BusinessException('权限编码已存在', 'PERMISSION_EXISTS');

    const permission = this.permissionRepository.create(dto);
    const saved = await this.permissionRepository.save(permission);
    return {
      id: saved.id,
      code: saved.code,
      name: saved.name,
      module: saved.module,
    };
  }

  /**
   * 更新权限名称与所属模块，编码不可变。
   * @throws NotFoundException 权限不存在
   */
  async update(id: number, dto: UpdatePermissionDto) {
    const permission = await this.permissionRepository.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('权限不存在');

    if (dto.name !== undefined) permission.name = dto.name;
    if (dto.module !== undefined) permission.module = dto.module;
    await this.permissionRepository.save(permission);
    return {
      id: permission.id,
      code: permission.code,
      name: permission.name,
      module: permission.module,
    };
  }

  /**
   * 软删除权限点。
   * @throws NotFoundException 权限不存在
   */
  async remove(id: number) {
    const permission = await this.permissionRepository.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('权限不存在');
    await this.permissionRepository.softRemove(permission);
    return { success: true };
  }
}
