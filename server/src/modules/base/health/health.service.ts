import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * 健康检查服务：探测 MySQL 与 Redis 连通性，供运维与负载均衡使用。
 */
@Injectable()
export class HealthService {
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
  }

  /**
   * 执行依赖项探活，任一项失败则整体 status 为 degraded。
   * @returns status、mysql/redis 状态及进程 uptime（秒）
   */
  async check() {
    let mysql: 'up' | 'down' = 'down';
    let redis: 'up' | 'down' = 'down';

    try {
      await this.dataSource.query('SELECT 1');
      mysql = 'up';
    } catch {
      mysql = 'down';
    }

    try {
      await this.redis.connect();
      await this.redis.ping();
      redis = 'up';
    } catch {
      redis = 'down';
    }

    return {
      status: mysql === 'up' && redis === 'up' ? 'ok' : 'degraded',
      mysql,
      redis,
      uptime: Math.floor(process.uptime()),
    };
  }
}
