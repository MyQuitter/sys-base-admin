import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface LoginLockStatus {
  locked: boolean;
  retryAfterSeconds?: number;
  lockedUntil?: string;
  remainingAttempts?: number;
}

/**
 * 密码登录失败锁定：按 IP + 用户名计数，超限后禁止重试一段时间。
 */
@Injectable()
export class LoginLockoutService {
  private redis: Redis;
  private readonly maxAttempts: number;
  private readonly lockoutSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      lazyConnect: true,
    });
    this.redis.connect().catch(() => undefined);
    this.maxAttempts = configService.get<number>('auth.loginMaxAttempts') ?? 5;
    this.lockoutSeconds = (configService.get<number>('auth.loginLockoutMinutes') ?? 15) * 60;
  }

  private normalizeIp(ip?: string) {
    return ip?.trim() || 'unknown';
  }

  private lockKey(scope: string, ip: string, account: string) {
    return `${scope}-login-lock:${ip}:${account}`;
  }

  private attemptKey(scope: string, ip: string, account: string) {
    return `${scope}-login-attempts:${ip}:${account}`;
  }

  buildLockedException(retryAfterSeconds: number) {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    const lockedUntil = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
    return new UnauthorizedException({
      message: `登录失败次数过多，请 ${minutes} 分钟后再试`,
      errorCode: 'LOGIN_LOCKED',
      detail: { retryAfterSeconds, lockedUntil },
    });
  }

  async getLockStatus(ip: string | undefined, account: string, scope = 'login'): Promise<LoginLockStatus> {
    const normalizedIp = this.normalizeIp(ip);
    const ttl = await this.redis.ttl(this.lockKey(scope, normalizedIp, account));
    if (ttl <= 0) {
      const raw = await this.redis.get(this.attemptKey(scope, normalizedIp, account));
      const count = raw ? Number(raw) : 0;
      return {
        locked: false,
        remainingAttempts: Math.max(0, this.maxAttempts - count),
      };
    }
    return {
      locked: true,
      retryAfterSeconds: ttl,
      lockedUntil: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async assertNotLocked(ip: string | undefined, account: string, scope = 'login') {
    const status = await this.getLockStatus(ip, account, scope);
    if (status.locked) {
      throw this.buildLockedException(status.retryAfterSeconds ?? this.lockoutSeconds);
    }
  }

  /** 记录一次密码登录失败；达上限时写入锁定并返回 locked */
  async recordFailure(ip: string | undefined, account: string, scope = 'login'): Promise<LoginLockStatus> {
    const normalizedIp = this.normalizeIp(ip);
    const attemptKey = this.attemptKey(scope, normalizedIp, account);
    const count = await this.redis.incr(attemptKey);
    if (count === 1) {
      await this.redis.expire(attemptKey, this.lockoutSeconds);
    }

    if (count >= this.maxAttempts) {
      await this.redis.set(this.lockKey(scope, normalizedIp, account), '1', 'EX', this.lockoutSeconds);
      await this.redis.del(attemptKey);
      return { locked: true, retryAfterSeconds: this.lockoutSeconds };
    }

    return {
      locked: false,
      remainingAttempts: this.maxAttempts - count,
    };
  }

  async clear(ip: string | undefined, account: string, scope = 'login') {
    const normalizedIp = this.normalizeIp(ip);
    await this.redis.del(this.lockKey(scope, normalizedIp, account), this.attemptKey(scope, normalizedIp, account));
  }
}
