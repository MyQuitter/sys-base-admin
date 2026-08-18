import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { Department } from '../department/entities/department.entity';
import { LoginLog } from '../log/entities/login-log.entity';
import { OperationLog } from '../log/entities/operation-log.entity';
import { Menu } from '../menu/entities/menu.entity';
import { MonitorService } from '../monitor/monitor.service';
import { Notice } from '../notice/entities/notice.entity';
import { Permission } from '../permission/entities/permission.entity';
import { Position } from '../position/entities/position.entity';
import { Role } from '../role/entities/role.entity';
import { User } from '../user/entities/user.entity';
import { Member } from '../../member/entities/member.entity';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { TransactionService } from '../../blockchain/services/transaction.service';

export interface DashboardOverview {
  stats: {
    users: number;
    members: number;
    roles: number;
    permissions: number;
    menus: number;
    departments: number;
    positions: number;
    publishedNotices: number;
    onlineUsers: number;
    todayLoginFailures: number;
    todayOperations: number;
    enabledChains: number;
    pendingTransactions: number;
  };
  system: {
    status: 'ok' | 'degraded';
    uptime: number;
  };
  recentNotices: Array<{
    id: number;
    title: string;
    publishTime?: Date;
    createdAt: Date;
  }>;
  lastLogin?: {
    ip?: string;
    createdAt: Date;
  };
}

/**
 * 工作台聚合服务：统计各模块数量、系统状态与公告/登录摘要。
 */
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(User) private readonly userRepository: Repository<User>,
    @InjectRepository(Member) private readonly memberRepository: Repository<Member>,
    @InjectRepository(Role) private readonly roleRepository: Repository<Role>,
    @InjectRepository(Permission) private readonly permissionRepository: Repository<Permission>,
    @InjectRepository(Menu) private readonly menuRepository: Repository<Menu>,
    @InjectRepository(Department) private readonly departmentRepository: Repository<Department>,
    @InjectRepository(Position) private readonly positionRepository: Repository<Position>,
    @InjectRepository(Notice) private readonly noticeRepository: Repository<Notice>,
    @InjectRepository(LoginLog) private readonly loginLogRepository: Repository<LoginLog>,
    @InjectRepository(OperationLog) private readonly operationLogRepository: Repository<OperationLog>,
    private readonly monitorService: MonitorService,
    private readonly transactionService: TransactionService,
  ) {}

  /** 今日 0 点（本地时区） */
  private startOfToday(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  async getOverview(userId: number): Promise<DashboardOverview> {
    const today = this.startOfToday();

    const [
      users,
      members,
      roles,
      permissions,
      menus,
      departments,
      positions,
      publishedNotices,
      todayLoginFailures,
      todayOperations,
      enabledChains,
      pendingTransactions,
      recentNotices,
      onlineUsers,
      system,
    ] = await Promise.all([
      this.userRepository.count(),
      this.memberRepository.count(),
      this.roleRepository.count(),
      this.permissionRepository.count(),
      this.menuRepository.count(),
      this.departmentRepository.count(),
      this.positionRepository.count(),
      this.noticeRepository.count({ where: { status: 1 } }),
      this.loginLogRepository.count({ where: { status: 0, createdAt: MoreThanOrEqual(today) } }),
      this.operationLogRepository.count({ where: { createdAt: MoreThanOrEqual(today) } }),
      this.transactionService.countEnabledChains(),
      this.transactionService.countPending(),
      this.noticeRepository.find({
        where: { status: 1 },
        order: { publishTime: 'DESC', id: 'DESC' },
        take: 5,
      }),
      this.monitorService.getOnlineUsers(),
      this.monitorService.getSystemStatus(),
    ]);

    const loginLogs = await this.loginLogRepository.find({
      where: { userId, status: 1 },
      order: { id: 'DESC' },
      take: 2,
    });
    const previousLogin = loginLogs[1];

    return {
      stats: {
        users,
        members,
        roles,
        permissions,
        menus,
        departments,
        positions,
        publishedNotices,
        onlineUsers: onlineUsers.length,
        todayLoginFailures,
        todayOperations,
        enabledChains,
        pendingTransactions,
      },
      system: {
        status: system.status as 'ok' | 'degraded',
        uptime: system.uptime,
      },
      recentNotices: recentNotices.map((n) => ({
        id: n.id,
        title: n.title,
        publishTime: n.publishTime,
        createdAt: n.createdAt,
      })),
      lastLogin: previousLogin
        ? { ip: previousLogin.ip, createdAt: previousLogin.createdAt }
        : undefined,
    };
  }
}
