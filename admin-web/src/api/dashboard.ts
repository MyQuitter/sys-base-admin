import request from '@/utils/request';

export interface DashboardStats {
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
}

export interface DashboardNoticeItem {
  id: number;
  title: string;
  publishTime?: string;
  createdAt: string;
}

export interface DashboardOverview {
  stats: DashboardStats;
  system: {
    status: 'ok' | 'degraded';
    uptime: number;
  };
  recentNotices: DashboardNoticeItem[];
  lastLogin?: {
    ip?: string;
    createdAt: string;
  };
}

/** 获取工作台聚合数据 */
export function getDashboardOverview() {
  return request.get<never, DashboardOverview>('/dashboard/overview');
}
