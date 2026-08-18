import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { Permission } from '../permission/entities/permission.entity';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';

/**
 * 角色业务服务：角色 CRUD 及权限分配（RBAC 核心关联）。
 */
@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
  ) {}

  /**
   * 将角色实体转为 VO，附带权限列表摘要。
   */
  private toRoleVo(role: Role) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      permissions: role.permissions?.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        module: p.module,
      })) ?? [],
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  /** 查询全部角色（含 eager 加载的权限） */
  async findAll() {
    const roles = await this.roleRepository.find({ order: { id: 'ASC' } });
    return roles.map((r) => this.toRoleVo(r));
  }

  /**
   * 查询单个角色详情。
   * @throws NotFoundException 角色不存在
   */
  async findOne(id: number) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    return this.toRoleVo(role);
  }

  /**
   * 创建角色，编码全局唯一。
   * @throws BusinessException 角色编码已存在（ROLE_EXISTS）
   */
  async create(dto: CreateRoleDto) {
    const exists = await this.roleRepository.findOne({ where: { code: dto.code } });
    if (exists) throw new BusinessException('角色编码已存在', 'ROLE_EXISTS');

    const role = this.roleRepository.create(dto);
    const saved = await this.roleRepository.save(role);
    return this.findOne(saved.id);
  }

  /**
   * 更新角色名称与描述，编码不可变。
   * @throws NotFoundException 角色不存在
   */
  async update(id: number, dto: UpdateRoleDto) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');

    if (dto.name !== undefined) role.name = dto.name;
    if (dto.description !== undefined) role.description = dto.description;
    await this.roleRepository.save(role);
    return this.findOne(id);
  }

  /**
   * 软删除角色。
   * @throws NotFoundException 角色不存在
   */
  async remove(id: number) {
    const role = await this.roleRepository.findOne({ where: { id } });
    if (!role) throw new NotFoundException('角色不存在');
    await this.roleRepository.softRemove(role);
    return { success: true };
  }

  /**
   * 为角色全量替换权限关联（传空数组则清空权限）。
   * @param id - 角色 ID
   * @param dto - 权限 ID 列表
   * @throws NotFoundException 角色不存在
   */
  async assignPermissions(id: number, dto: AssignPermissionsDto) {
    const role = await this.roleRepository.findOne({ where: { id }, relations: { permissions: true } });
    if (!role) throw new NotFoundException('角色不存在');

    role.permissions = dto.permissionIds.length
      ? await this.permissionRepository.find({ where: { id: In(dto.permissionIds) } })
      : [];
    await this.roleRepository.save(role);
    return this.findOne(id);
  }
}
