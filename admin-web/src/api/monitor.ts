import request from '@/utils/request';

export interface OnlineUserItem {
  userId: number;
  username: string;
  nickname?: string;
  ip?: string;
  loginTime: string;
}

export interface SystemStatus {
  status: 'ok' | 'degraded';
  uptime: number;
  platform: string;
  nodeVersion: string;
  cpuLoad: number[];
  memory: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    systemTotal: number;
    systemFree: number;
    systemUsed: number;
  };
  mysql: 'up' | 'down';
  redis: 'up' | 'down';
  dbConnections: number;
}

export function getOnlineUsers() {
  return request.get<never, OnlineUserItem[]>('/monitor/online-users');
}

export function kickoutUser(userId: number) {
  return request.post(`/monitor/online-users/${userId}/kickout`);
}

export function getSystemStatus() {
  return request.get<never, SystemStatus>('/monitor/system');
}
