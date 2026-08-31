import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BusinessException } from '../../../common/exceptions/business.exception';
import { User } from '../user/entities/user.entity';
import { CreateMenuDto } from './dto/create-menu.dto';
import { UpdateMenuDto } from './dto/update-menu.dto';
import { Menu } from './entities/menu.entity';

/** 菜单树节点，供前端侧边栏与路由使用 */
export interface MenuTreeNode {
  id: number;
  name: string;
  path?: string;
  icon?: string;
  children?: MenuTreeNode[];
}

/**
 * 菜单业务服务：维护菜单 CRUD，并按用户权限生成可见菜单树。
 */
@Injectable()
export class MenuService {
  constructor(
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * 将扁平菜单列表递归组装为树形结构。
   * @param menus - 已过滤或全量的菜单记录
   * @param parentId - 当前层父节点 ID，顶级传 undefined
   * @returns 按 sort 排序的树节点数组
   */
  private buildTree(menus: Menu[], parentId?: number): MenuTreeNode[] {
    return menus
      .filter((m) => (m.parentId ?? null) === (parentId ?? null))
      .sort((a, b) => a.sort - b.sort)
      .map((m) => {
        const children = this.buildTree(menus, m.id);
        const node: MenuTreeNode = {
          id: m.id,
          name: m.name,
          path: m.path,
          icon: m.icon,
        };
        if (children.length) node.children = children;
        return node;
      });
  }

  /**
   * 根据当前用户权限码过滤可见菜单，并保留父级目录节点。
   * 无 permissionCode 的菜单对所有登录用户可见；有权限码则需命中集合。
   * @param menus - 全量菜单记录
   * @param permissionCodes - JWT 中聚合的角色权限码列表
   * @returns 用户可见的扁平菜单集合
   */
  private filterByPermissions(menus: Menu[], permissionCodes: string[]): Menu[] {
    const codeSet = new Set(permissionCodes);
    const visibleIds = new Set<number>();

    const isVisible = (menu: Menu): boolean => {
      if (menu.status !== 1) return false;
      if (!menu.permissionCode) return true;
      return codeSet.has(menu.permissionCode);
    };

    menus.forEach((menu) => {
      if (isVisible(menu)) visibleIds.add(menu.id);
    });

    // 子菜单可见时，向上补齐祖先节点，避免侧边栏出现「孤儿」叶子
    const addAncestors = (menu: Menu) => {
      if (menu.parentId && !visibleIds.has(menu.parentId)) {
        const parent = menus.find((m) => m.id === menu.parentId);
        if (parent) {
          visibleIds.add(parent.id);
          addAncestors(parent);
        }
      }
    };
    menus.filter((m) => visibleIds.has(m.id)).forEach(addAncestors);

    return menus.filter((m) => visibleIds.has(m.id));
  }

  /**
   * 按明确勾选的菜单 ID 过滤；子项可见时向上补齐目录。
   */
  private filterByMenuIds(menus: Menu[], menuIds: number[]): Menu[] {
    const assigned = new Set(menuIds);
    const visibleIds = new Set<number>();

    menus.forEach((menu) => {
      if (menu.status === 1 && assigned.has(menu.id)) visibleIds.add(menu.id);
    });

    const addAncestors = (menu: Menu) => {
      if (menu.parentId && !visibleIds.has(menu.parentId)) {
        const parent = menus.find((m) => m.id === menu.parentId);
        if (parent) {
          visibleIds.add(parent.id);
          addAncestors(parent);
        }
      }
    };
    menus.filter((m) => visibleIds.has(m.id)).forEach(addAncestors);

    return menus.filter((m) => visibleIds.has(m.id));
  }

  /**
   * 获取当前用户可见的菜单树（侧边栏数据源）。
   * 若任一角色已「分配菜单」，则只展示勾选菜单的并集；否则回退为按权限码过滤。
   */
  async getTreeForUser(permissionCodes: string[], userId?: number) {
    const menus = await this.menuRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
    const navMenus = menus.filter((m) => this.isNavMenu(m));

    if (userId) {
      const user = await this.userRepository.findOne({
        where: { id: userId },
        relations: { roles: { menus: true, permissions: true } },
      });
      const roles = user?.roles ?? [];
      if (roles.some((role) => role.menuRestricted)) {
        const menuIds = new Set<number>();
        for (const role of roles) {
          if (role.menuRestricted) {
            role.menus?.forEach((menu) => menuIds.add(menu.id));
          } else {
            const codes = role.permissions?.map((p) => p.code) ?? [];
            this.filterByPermissions(navMenus, codes).forEach((menu) => menuIds.add(menu.id));
          }
        }
        return this.buildTree(this.filterByMenuIds(navMenus, [...menuIds]));
      }
    }

    const filtered = this.filterByPermissions(navMenus, permissionCodes);
    return this.buildTree(filtered);
  }

  /** 是否作为侧栏/顶栏导航菜单展示 */
  private isNavMenu(menu: Menu): boolean {
    if (menu.path === '/profile') return false;
    if (menu.path?.startsWith('/e2e/')) return false;
    if (menu.name.startsWith('E2E测试')) return false;
    return true;
  }

  /**
   * 查询菜单扁平列表，供管理页表格展示与编辑。
   * @returns 不含 children 的菜单字段集合
   */
  async findAll() {
    const menus = await this.menuRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
    return menus.map((m) => ({
      id: m.id,
      parentId: m.parentId,
      name: m.name,
      path: m.path,
      icon: m.icon,
      permissionCode: m.permissionCode,
      sort: m.sort,
      status: m.status,
    }));
  }

  /**
   * 获取全量菜单树（不做权限过滤），可用于内部管理场景。
   * @returns 完整菜单树
   */
  async getFullTree() {
    const menus = await this.menuRepository.find({ order: { sort: 'ASC', id: 'ASC' } });
    return this.buildTree(menus);
  }

  /**
   * 创建菜单节点。
   * @param dto - 菜单表单数据，未传 sort/status 时使用默认值
   * @returns 新建菜单的 VO
   */
  async create(dto: CreateMenuDto) {
    const menu = this.menuRepository.create({
      parentId: dto.parentId,
      name: dto.name,
      path: dto.path,
      icon: dto.icon,
      permissionCode: dto.permissionCode,
      sort: dto.sort ?? 0,
      status: dto.status ?? 1,
    });
    const saved = await this.menuRepository.save(menu);
    return {
      id: saved.id,
      parentId: saved.parentId,
      name: saved.name,
      path: saved.path,
      icon: saved.icon,
      permissionCode: saved.permissionCode,
      sort: saved.sort,
      status: saved.status,
    };
  }

  /**
   * 按 ID 更新菜单，仅覆盖 DTO 中显式传入的字段。
   * @throws NotFoundException 菜单不存在
   */
  async update(id: number, dto: UpdateMenuDto) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) throw new NotFoundException('菜单不存在');

    if (dto.parentId !== undefined) menu.parentId = dto.parentId;
    if (dto.name !== undefined) menu.name = dto.name;
    if (dto.path !== undefined) menu.path = dto.path;
    if (dto.icon !== undefined) menu.icon = dto.icon;
    if (dto.permissionCode !== undefined) menu.permissionCode = dto.permissionCode;
    if (dto.sort !== undefined) menu.sort = dto.sort;
    if (dto.status !== undefined) menu.status = dto.status;

    await this.menuRepository.save(menu);
    return {
      id: menu.id,
      parentId: menu.parentId,
      name: menu.name,
      path: menu.path,
      icon: menu.icon,
      permissionCode: menu.permissionCode,
      sort: menu.sort,
      status: menu.status,
    };
  }

  /**
   * 软删除菜单；存在子菜单时拒绝删除。
   * @throws NotFoundException 菜单不存在
   * @throws BusinessException 仍有子菜单（MENU_HAS_CHILDREN）
   */
  async remove(id: number) {
    const menu = await this.menuRepository.findOne({ where: { id } });
    if (!menu) throw new NotFoundException('菜单不存在');

    const childCount = await this.menuRepository.count({ where: { parentId: id } });
    if (childCount > 0) {
      throw new BusinessException('请先删除子菜单', 'MENU_HAS_CHILDREN');
    }

    await this.menuRepository.softRemove(menu);
    return { success: true };
  }
}
