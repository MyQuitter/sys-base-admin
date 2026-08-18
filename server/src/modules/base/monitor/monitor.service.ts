import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import * as os from 'os';
import { DataSource } from 'typeorm';

export interface OnlineUserItem {
  userId: number;
  username: string;
  nickname?: string;
  ip?: string;
  loginTime: string;
}

/**
 * 系统监控服务：在线用户（Redis）、系统资源与依赖连通性。
 */
@Injectable()
export class MonitorService {
  private redis: Redis;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    configService: ConfigService,
  ) {
    this.redis = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      lazyConnect: true,
    });
    this.redis.connect().catch(() => undefined);
  }

  /** 扫描 Redis online:* 键获取在线用户列表 */
  async getOnlineUsers(): Promise<OnlineUserItem[]> {
    const keys = await this.redis.keys('online:*');
    if (!keys.length) return [];

    const values = await this.redis.mget(...keys);
    const users: OnlineUserItem[] = [];
    for (const raw of values) {
      if (!raw) continue;
      try {
        users.push(JSON.parse(raw) as OnlineUserItem);
      } catch {
        // 忽略损坏数据
      }
    }
    return users.sort((a, b) => b.loginTime.localeCompare(a.loginTime));
  }

  /** 强制下线：清除 Refresh Token 与在线状态 */
  async kickout(userId: number) {
    await this.redis.del(`refresh:${userId}`, `online:${userId}`);
    return { success: true };
  }

  /** 返回 CPU、内存、运行时长及 MySQL/Redis 连通状态 */
  async getSystemStatus() {
    let mysql: 'up' | 'down' = 'down';
    let redis: 'up' | 'down' = 'down';
    let dbConnections = 0;

    try {
      await this.dataSource.query('SELECT 1');
      mysql = 'up';
      const rows = await this.dataSource.query('SHOW STATUS LIKE "Threads_connected"');
      dbConnections = Number(rows?.[0]?.Value ?? 0);
    } catch {
      mysql = 'down';
    }

    try {
      await this.redis.ping();
      redis = 'up';
    } catch {
      redis = 'down';
    }

    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      status: mysql === 'up' && redis === 'up' ? 'ok' : 'degraded',
      uptime: Math.floor(process.uptime()),
      platform: os.platform(),
      nodeVersion: process.version,
      cpuLoad: os.loadavg(),
      memory: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        systemTotal: totalMem,
        systemFree: freeMem,
        systemUsed: totalMem - freeMem,
      },
      mysql,
      redis,
      dbConnections,
    };
  }
}
