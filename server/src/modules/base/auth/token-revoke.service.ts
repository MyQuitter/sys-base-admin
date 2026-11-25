import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Access / Refresh 会话作废。
 * - 全用户：`access:revoked:{userId}` + 清理 `refresh/online:{userId}:*`
 * - 单设备：`access:revoked:{userId}:{deviceId}` + 清理该设备 refresh/online
 */
@Injectable()
export class TokenRevokeService {
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      lazyConnect: true,
    });
    this.redis.connect().catch(() => undefined);
  }

  private accessTtlSeconds() {
    const raw = this.configService.get<string>('jwt.accessTokenExpiresIn') ?? '15m';
    const matched = /^(\d+)\s*([smhd])$/i.exec(raw.trim());
    if (!matched) return 15 * 60;
    const n = Number(matched[1]);
    const unit = matched[2].toLowerCase();
    if (unit === 's') return n;
    if (unit === 'm') return n * 60;
    if (unit === 'h') return n * 3600;
    return n * 86400;
  }

  refreshKey(userId: number, deviceId: string) {
    return `refresh:${userId}:${deviceId}`;
  }

  onlineKey(userId: number, deviceId: string) {
    return `online:${userId}:${deviceId}`;
  }

  private async deleteByPattern(pattern: string) {
    const keys = await this.redis.keys(pattern);
    if (keys.length) await this.redis.del(...keys);
  }

  /**
   * 作废会话。传 deviceId 仅踢当前设备；否则踢该用户全部设备。
   */
  async revoke(userId: number, deviceId?: string) {
    if (deviceId) {
      await this.redis.del(this.refreshKey(userId, deviceId), this.onlineKey(userId, deviceId));
      await this.redis.set(`access:revoked:${userId}:${deviceId}`, '1', 'EX', this.accessTtlSeconds());
      return;
    }
    await this.deleteByPattern(`refresh:${userId}:*`);
    await this.deleteByPattern(`online:${userId}:*`);
    // 兼容旧单会话键
    await this.redis.del(`refresh:${userId}`, `online:${userId}`);
    await this.redis.set(`access:revoked:${userId}`, '1', 'EX', this.accessTtlSeconds());
  }

  /** 重新登录发证前清除作废标记（用户级 + 当前设备） */
  async clear(userId: number, deviceId?: string) {
    await this.redis.del(`access:revoked:${userId}`);
    if (deviceId) {
      await this.redis.del(`access:revoked:${userId}:${deviceId}`);
    }
  }

  /**
   * JWT 校验时调用：用户级或设备级任一作废即失效。
   * Redis 异常时不阻断，避免把全站锁死。
   */
  async isRevoked(userId: number, deviceId?: string): Promise<boolean> {
    try {
      if (await this.redis.get(`access:revoked:${userId}`)) return true;
      if (deviceId && (await this.redis.get(`access:revoked:${userId}:${deviceId}`))) return true;
      return false;
    } catch {
      return false;
    }
  }
}
