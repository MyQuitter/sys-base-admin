import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { IsNull, Like, Repository } from 'typeorm';
import { Menu } from '../menu/entities/menu.entity';
import { Permission } from '../permission/entities/permission.entity';
import { Role } from '../role/entities/role.entity';
import { User } from '../user/entities/user.entity';

const PERMISSION_SEEDS = [
  { code: 'user:list', name: '用户列表', module: 'user' },
  { code: 'user:create', name: '创建用户', module: 'user' },
  { code: 'user:update', name: '更新用户', module: 'user' },
  { code: 'user:delete', name: '删除用户', module: 'user' },
  { code: 'user:reset-password', name: '重置密码', module: 'user' },
  { code: 'user:bind-wallet', name: '绑定钱包', module: 'user' },
  { code: 'role:list', name: '角色列表', module: 'role' },
  { code: 'role:create', name: '创建角色', module: 'role' },
  { code: 'role:update', name: '更新角色', module: 'role' },
  { code: 'role:delete', name: '删除角色', module: 'role' },
  { code: 'role:assign-permission', name: '分配权限', module: 'role' },
  { code: 'permission:list', name: '权限列表', module: 'permission' },
  { code: 'permission:create', name: '创建权限', module: 'permission' },
  { code: 'permission:update', name: '更新权限', module: 'permission' },
  { code: 'permission:delete', name: '删除权限', module: 'permission' },
  { code: 'menu:list', name: '菜单列表', module: 'menu' },
  { code: 'menu:create', name: '创建菜单', module: 'menu' },
  { code: 'menu:update', name: '更新菜单', module: 'menu' },
  { code: 'menu:delete', name: '删除菜单', module: 'menu' },
  { code: 'department:list', name: '部门列表', module: 'department' },
  { code: 'department:create', name: '创建部门', module: 'department' },
  { code: 'department:update', name: '更新部门', module: 'department' },
  { code: 'department:delete', name: '删除部门', module: 'department' },
  { code: 'position:list', name: '岗位列表', module: 'position' },
  { code: 'position:create', name: '创建岗位', module: 'position' },
  { code: 'position:update', name: '更新岗位', module: 'position' },
  { code: 'position:delete', name: '删除岗位', module: 'position' },
  { code: 'dict:list', name: '字典列表', module: 'dict' },
  { code: 'dict:create', name: '创建字典', module: 'dict' },
  { code: 'dict:update', name: '更新字典', module: 'dict' },
  { code: 'dict:delete', name: '删除字典', module: 'dict' },
  { code: 'notice:list', name: '公告列表', module: 'notice' },
  { code: 'notice:create', name: '创建公告', module: 'notice' },
  { code: 'notice:update', name: '更新公告', module: 'notice' },
  { code: 'notice:delete', name: '删除公告', module: 'notice' },
  { code: 'log:operation', name: '操作日志', module: 'log' },
  { code: 'log:login', name: '登录日志', module: 'log' },
  { code: 'log:protection', name: '防护日志', module: 'log' },
  { code: 'monitor:online', name: '在线用户', module: 'monitor' },
  { code: 'monitor:system', name: '系统监控', module: 'monitor' },
  { code: 'file:list', name: '文件列表', module: 'file' },
  { code: 'file:upload', name: '上传文件', module: 'file' },
  { code: 'file:download', name: '下载文件', module: 'file' },
  { code: 'file:delete', name: '删除文件', module: 'file' },
  { code: 'setting:list', name: '查看系统设置', module: 'setting' },
  { code: 'setting:update', name: '更新系统设置', module: 'setting' },
  { code: 'member:list', name: '会员用户列表', module: 'member' },
  { code: 'member:create', name: '创建会员用户', module: 'member' },
  { code: 'member:update', name: '更新会员用户', module: 'member' },
  { code: 'member:delete', name: '删除会员用户', module: 'member' },
  { code: 'member:reset-password', name: '重置会员用户密码', module: 'member' },
  { code: 'chain:list', name: '链配置列表', module: 'blockchain' },
  { code: 'chain:create', name: '创建链配置', module: 'blockchain' },
  { code: 'chain:update', name: '更新链配置', module: 'blockchain' },
  { code: 'chain:delete', name: '删除链配置', module: 'blockchain' },
  { code: 'contract:list', name: '合约列表', module: 'blockchain' },
  { code: 'contract:create', name: '登记合约', module: 'blockchain' },
  { code: 'contract:update', name: '更新合约', module: 'blockchain' },
  { code: 'contract:delete', name: '删除合约', module: 'blockchain' },
  { code: 'tx:list', name: '交易记录列表', module: 'blockchain' },
  { code: 'tx:create', name: '登记/同步交易', module: 'blockchain' },
  { code: 'event-sub:list', name: '事件订阅列表', module: 'blockchain' },
  { code: 'event-sub:create', name: '创建/扫描事件订阅', module: 'blockchain' },
  { code: 'event-sub:update', name: '更新事件订阅', module: 'blockchain' },
  { code: 'event-sub:delete', name: '删除事件订阅', module: 'blockchain' },
  { code: 'crm-wl:config', name: 'CrmToken白名单配置', module: 'crm-whitelist' },
  { code: 'crm-wl:trader-list', name: '交易白名单列表', module: 'crm-whitelist' },
  { code: 'crm-wl:trader-write', name: '交易白名单写入', module: 'crm-whitelist' },
  { code: 'crm-wl:node-list', name: '节点白名单列表', module: 'crm-whitelist' },
  { code: 'crm-wl:node-write', name: '节点白名单写入', module: 'crm-whitelist' },
  { code: 'crm-team:list', name: '链上团队数据列表', module: 'crm-whitelist' },
  { code: 'crm-wl:join-list', name: '入金记录列表', module: 'crm-whitelist' },
];

interface MenuSeed {
  name: string;
  path?: string;
  icon?: string;
  permissionCode?: string;
  sort: number;
  children?: MenuSeed[];
}

const MENU_SEEDS: MenuSeed[] = [
  { name: '工作台', path: '/dashboard', icon: 'DashboardOutlined', sort: 1 },
  {
    name: '用户管理',
    icon: 'TeamOutlined',
    sort: 2,
    children: [{ name: '会员用户', path: '/member/list', permissionCode: 'member:list', sort: 1 }],
  },
  {
    name: '区块链',
    icon: 'BlockOutlined',
    sort: 3,
    children: [
      { name: '链管理', path: '/blockchain/chain', permissionCode: 'chain:list', sort: 1 },
      { name: '合约管理', path: '/blockchain/contract', permissionCode: 'contract:list', sort: 2 },
      { name: '交易记录', path: '/blockchain/transaction', permissionCode: 'tx:list', sort: 3 },
      { name: '事件订阅', path: '/blockchain/event-subscription', permissionCode: 'event-sub:list', sort: 4 },
      { name: '事件日志', path: '/blockchain/event-log', permissionCode: 'event-sub:list', sort: 5 },
    ],
  },
  {
    name: 'CrmToken',
    icon: 'SafetyCertificateOutlined',
    sort: 4,
    children: [
      { name: '数据面板', path: '/crm-whitelist/panel', permissionCode: 'crm-team:list', sort: 1 },
      { name: '合约配置', path: '/crm-whitelist/config', permissionCode: 'crm-wl:config', sort: 2 },
      { name: '交易白名单', path: '/crm-whitelist/trader', permissionCode: 'crm-wl:trader-list', sort: 3 },
      { name: '节点白名单', path: '/crm-whitelist/node', permissionCode: 'crm-wl:node-list', sort: 4 },
      { name: '入金记录', path: '/crm-whitelist/joins', permissionCode: 'crm-wl:join-list', sort: 5 },
      { name: '团队数据', path: '/crm-whitelist/team', permissionCode: 'crm-team:list', sort: 6 },
    ],
  },
  {
    name: '系统管理',
    icon: 'SettingOutlined',
    sort: 5,
    children: [
      { name: '部门管理', path: '/org/department', permissionCode: 'department:list', sort: 1 },
      { name: '岗位管理', path: '/org/position', permissionCode: 'position:list', sort: 2 },
      { name: '系统用户', path: '/system/user', permissionCode: 'user:list', sort: 3 },
      { name: '角色管理', path: '/system/role', permissionCode: 'role:list', sort: 4 },
      { name: '权限管理', path: '/system/permission', permissionCode: 'permission:list', sort: 5 },
      { name: '菜单管理', path: '/system/menu', permissionCode: 'menu:list', sort: 6 },
      { name: '字典管理', path: '/system/dict', permissionCode: 'dict:list', sort: 7 },
      { name: '系统公告', path: '/system/notice', permissionCode: 'notice:list', sort: 8 },
      { name: '文件管理', path: '/system/file', permissionCode: 'file:list', sort: 9 },
      { name: '系统设置', path: '/system/settings', permissionCode: 'setting:list', sort: 10 },
    ],
  },
  {
    name: '运维监控',
    icon: 'MonitorOutlined',
    sort: 6,
    children: [
      { name: '操作日志', path: '/monitor/operation-log', permissionCode: 'log:operation', sort: 1 },
      { name: '登录日志', path: '/monitor/login-log', permissionCode: 'log:login', sort: 2 },
      { name: '防护日志', path: '/monitor/protection-log', permissionCode: 'log:protection', sort: 3 },
      { name: '在线用户', path: '/monitor/online', permissionCode: 'monitor:online', sort: 4 },
      { name: '系统监控', path: '/monitor/system', permissionCode: 'monitor:system', sort: 5 },
    ],
  },
];

/**
 * RBAC 初始化种子：增量补齐权限/菜单，并同步 admin 角色权限。
 */
@Injectable()
export class RbacSeedService implements OnModuleInit {
  constructor(
    @InjectRepository(Permission)
    private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(Menu)
    private readonly menuRepository: Repository<Menu>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.ensurePermissions();
    const adminRole = await this.seedAdminRole();
    await this.cleanupObsoleteMenus();
    await this.syncParentMenuRenames();
    await this.ensureMenus();
    await this.removeObsoleteOrgMenu();
    await this.syncMenuNames();
    await this.seedAdminUser(adminRole);
  }

  /** 一级目录重命名（需在 ensureMenus 之前执行，避免重复创建） */
  private async syncParentMenuRenames() {
    const renames = [{ oldName: '用户运营', newName: '用户管理' }];
    for (const item of renames) {
      await this.menuRepository.update(
        { name: item.oldName, parentId: IsNull() },
        { name: item.newName },
      );
    }
  }

  /** 按 path 同步菜单显示名称（重命名场景） */
  private async syncMenuNames() {
    // 旧 path 含 dashboard，易与工作台冲突；合并为 panel + crm-team:list
    const legacy = await this.menuRepository.find({ where: { path: '/crm-whitelist/dashboard' } });
    const panel = await this.menuRepository.findOne({ where: { path: '/crm-whitelist/panel' } });
    if (legacy.length) {
      if (panel) {
        await this.menuRepository.softRemove(legacy);
      } else {
        await this.menuRepository.update(
          { path: '/crm-whitelist/dashboard' },
          { path: '/crm-whitelist/panel', permissionCode: 'crm-team:list', name: '数据面板', sort: 1 },
        );
      }
    }
    // 去重：同 path 多条时保留最小 id
    const panels = await this.menuRepository.find({
      where: { path: '/crm-whitelist/panel' },
      order: { id: 'ASC' },
    });
    if (panels.length > 1) {
      await this.menuRepository.softRemove(panels.slice(1));
    }

    const renames = [
      { path: '/system/user', name: '系统用户' },
      { path: '/system/notice', name: '系统公告' },
      { path: '/member/list', name: '会员用户' },
      { path: '/crm-whitelist/panel', name: '数据面板' },
    ];
    for (const item of renames) {
      await this.menuRepository.update({ path: item.path }, { name: item.name });
    }

    const permissionRenames = [
      { code: 'member:list', name: '会员用户列表' },
      { code: 'member:create', name: '创建会员用户' },
      { code: 'member:update', name: '更新会员用户' },
      { code: 'member:delete', name: '删除会员用户' },
      { code: 'member:reset-password', name: '重置会员用户密码' },
    ];
    for (const item of permissionRenames) {
      await this.permissionRepository.update({ code: item.code }, { name: item.name });
    }
  }

  /** 按 code 增量补齐权限点 */
  private async ensurePermissions() {
    for (const p of PERMISSION_SEEDS) {
      const exists = await this.permissionRepository.findOne({ where: { code: p.code } });
      if (!exists) {
        await this.permissionRepository.save(this.permissionRepository.create(p));
      }
    }
  }

  private async seedAdminRole(): Promise<Role> {
    let role = await this.roleRepository.findOne({ where: { code: 'admin' }, relations: { permissions: true } });
    const permissions = await this.permissionRepository.find();
    if (!role) {
      role = await this.roleRepository.save(
        this.roleRepository.create({
          code: 'admin',
          name: '超级管理员',
          description: '拥有全部权限',
          permissions,
        }),
      );
    } else {
      role.permissions = permissions;
      role = await this.roleRepository.save(role);
    }
    return role;
  }

  /** 按 path 增量补齐菜单树 */
  private async ensureMenus() {
    await this.saveMenuTreeIfMissing(MENU_SEEDS);
  }

  /**
   * 清理不应出现在导航中的菜单：个人中心（改由顶栏下拉进入）、E2E 测试残留。
   */
  private async cleanupObsoleteMenus() {
    const obsolete = await this.menuRepository.find({
      where: [{ path: '/profile' }, { path: Like('/e2e/%') }, { name: Like('E2E测试%') }],
    });
    if (obsolete.length) {
      await this.menuRepository.softRemove(obsolete);
    }
  }

  /** 组织管理已并入系统管理，移除旧的一级目录 */
  private async removeObsoleteOrgMenu() {
    const obsolete = await this.menuRepository.find({ where: { name: '组织管理' } });
    if (obsolete.length) {
      await this.menuRepository.softRemove(obsolete);
    }
  }

  private async saveMenuTreeIfMissing(seeds: MenuSeed[], parentId?: number) {
    for (const seed of seeds) {
      let menu: Menu | null = null;
      if (seed.path) {
        menu = await this.menuRepository.findOne({ where: { path: seed.path } });
      } else {
        menu = await this.menuRepository.findOne({
          where: { name: seed.name, parentId: parentId ?? IsNull() },
        });
        if (!menu && seed.children?.length) {
          const childPath = seed.children.find((child) => child.path)?.path;
          if (childPath) {
            const child = await this.menuRepository.findOne({ where: { path: childPath } });
            if (child?.parentId) {
              menu = await this.menuRepository.findOne({ where: { id: child.parentId } });
            }
          }
        }
      }
      if (!menu) {
        menu = await this.menuRepository.save(
          this.menuRepository.create({
            parentId,
            name: seed.name,
            path: seed.path,
            icon: seed.icon,
            permissionCode: seed.permissionCode,
            sort: seed.sort,
            status: 1,
          }),
        );
      } else {
        const nextParentId = parentId ?? null;
        const currentParentId = menu.parentId ?? null;
        let changed = false;
        if (menu.name !== seed.name) {
          menu.name = seed.name;
          changed = true;
        }
        if (currentParentId !== nextParentId) {
          menu.parentId = parentId;
          changed = true;
        }
        if (menu.sort !== seed.sort) {
          menu.sort = seed.sort;
          changed = true;
        }
        if (changed) {
          await this.menuRepository.save(menu);
        }
      }
      if (seed.children?.length) {
        await this.saveMenuTreeIfMissing(seed.children, menu.id);
      }
    }
  }

  private async seedAdminUser(adminRole: Role) {
    let user = await this.userRepository.findOne({
      where: { username: 'admin' },
      relations: { roles: true },
    });

    const rounds = this.configService.get<number>('bcryptRounds') ?? 10;
    const password = await bcrypt.hash('Admin@123', rounds);

    if (!user) {
      user = this.userRepository.create({
        username: 'admin',
        password,
        nickname: '管理员',
        status: 1,
        roles: [adminRole],
      });
      await this.userRepository.save(user);
      return;
    }

    const hasAdminRole = user.roles?.some((r) => r.code === 'admin');
    if (!hasAdminRole) {
      user.roles = [...(user.roles ?? []), adminRole];
      await this.userRepository.save(user);
    }
  }
}
