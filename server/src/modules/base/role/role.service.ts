import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { Menu } from '../menu/entities/menu.entity';
import { Permission } from '../permission/entities/permission.entity';
import { AssignMenusDto } from './dto/assign-menus.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { Role } from './entities/role.entity';

/**
 * 角色业务服务：角色 CRUD、权限分配与菜单分配。
 */
@Injectable()
export class RoleService {
  constructor(
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
  ) {}

  /**
   * 将角色实体转为 VO，附带权限与菜单摘要。
   */
  private toRoleVo(role: Role) {
    return {
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      menuRestricted: Boolean(role.menuRestricted),
      permissions: role.permissions?.map((p) => ({
        id: p.id,
        code: p.code,
        name: p.name,
        module: p.module,
      })) ?? [],
      menus: role.menus?.map((m) => ({
        id: m.id,
        name: m.name,
        path: m.path,
        permissionCode: m.permissionCode,
      })) ?? [],
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private loadRole(id: number) {
    return this.roleRepository.findOne({
      where: { id },
      relations: { menus: true },
    });
  }

  /** 查询全部角色（含权限与已分配菜单） */
  async findAll() {
    const roles = await this.roleRepository.find({
      order: { id: 'ASC' },
      relations: { menus: true },
    });
    return roles.map((r) => this.toRoleVo(r));
  }

  /**
   * 查询单个角色详情。
   * @throws NotFoundException 角色不存在
   */
  async findOne(id: number) {
    const role = await this.loadRole(id);
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
   * 为角色全量替换权限关联。须先分配菜单；未勾选时默认授予所选菜单栏目下全部权限。
   * @throws NotFoundException 角色不存在
   * @throws BusinessException 尚未分配菜单（MENU_REQUIRED）
   */
  async assignPermissions(id: number, dto: AssignPermissionsDto) {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: { permissions: true, menus: true },
    });
    if (!role) throw new NotFoundException('角色不存在');
    if (!role.menuRestricted) {
      throw new BusinessException('请先为该角色分配菜单', 'MENU_REQUIRED');
    }

    const allowed = await this.permissionsForMenus(role.menus ?? []);
    const allowedIds = new Set(allowed.map((p) => p.id));
    const picked = dto.permissionIds.filter((pid) => allowedIds.has(pid));
    role.permissions = picked.length ? allowed.filter((p) => picked.includes(p.id)) : allowed;
    await this.roleRepository.save(role);
    return this.findOne(id);
  }

  /**
   * 可分配的导航菜单（扁平列表，供角色管理勾选树）。
   */
  async getAssignableMenus() {
    const menus = await this.menuRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
    return menus
      .filter((m) => m.status === 1 && this.isNavMenu(m))
      .map((m) => ({
        id: m.id,
        parentId: m.parentId,
        name: m.name,
        path: m.path,
        permissionCode: m.permissionCode,
      }));
  }

  private isNavMenu(menu: Menu): boolean {
    if (menu.path === '/profile') return false;
    if (menu.path?.startsWith('/e2e/')) return false;
    if (menu.name.startsWith('E2E测试')) return false;
    return true;
  }

  /**
   * 为角色全量替换可见菜单。保存后侧栏只展示勾选项。
   * 未单独勾选权限时，默认授予所选菜单栏目（权限码前缀）下的全部接口权限；
   * 已有权限会按新菜单裁剪，新勾选的栏目补齐该栏目全部权限。
   * @throws NotFoundException 角色不存在
   */
  async assignMenus(id: number, dto: AssignMenusDto) {
    const role = await this.roleRepository.findOne({
      where: { id },
      relations: { menus: true, permissions: true },
    });
    if (!role) throw new NotFoundException('角色不存在');

    role.menuRestricted = true;
    role.menus = dto.menuIds.length
      ? await this.menuRepository.find({ where: { id: In(dto.menuIds) } })
      : [];
    role.permissions = this.mergeMenuPermissions(role.permissions ?? [], await this.permissionsForMenus(role.menus));
    await this.roleRepository.save(role);
    return this.findOne(id);
  }

  /** 权限码 `{模块}:{操作}` 中的栏目前缀，如 `user:list` → `user` */
  private codePrefix(code?: string): string | undefined {
    if (!code) return undefined;
    const i = code.indexOf(':');
    return i === -1 ? code : code.slice(0, i);
  }

  /** 所选菜单栏目对应的全部接口权限（按权限码前缀匹配） */
  private async permissionsForMenus(menus: Menu[]): Promise<Permission[]> {
    const prefixes = new Set(
      menus.map((m) => this.codePrefix(m.permissionCode)).filter((p): p is string => Boolean(p)),
    );
    if (!prefixes.size) return [];
    const all = await this.permissionRepository.find();
    return all.filter((p) => {
      const prefix = this.codePrefix(p.code);
      return Boolean(prefix && prefixes.has(prefix));
    });
  }

  /**
   * 无已选权限 → 栏目默认全选；
   * 已有权限 → 去掉不在新菜单内的，并为新栏目补齐全部权限。
   */
  private mergeMenuPermissions(current: Permission[], allowed: Permission[]): Permission[] {
    if (!allowed.length) return [];
    if (!current.length) return allowed;

    const allowedIds = new Set(allowed.map((p) => p.id));
    const kept = current.filter((p) => allowedIds.has(p.id));
    const keptPrefixes = new Set(kept.map((p) => this.codePrefix(p.code)).filter(Boolean));
    const added = allowed.filter((p) => !keptPrefixes.has(this.codePrefix(p.code)));
    const byId = new Map<number, Permission>();
    for (const p of [...kept, ...added]) byId.set(p.id, p);
    return [...byId.values()];
  }
}
