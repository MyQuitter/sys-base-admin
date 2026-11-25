import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface LoginLockStatus {
  locked: boolean;
  retryAfterSeconds?: number;
  lockedUntil?: string;
  remainingAttempts?: number;
  /** ip = 该 IP 对所有账号失败过多；account = 同一 IP+用户名失败过多 */
  scope?: 'ip' | 'account';
}

/**
 * 密码登录失败锁定：
 * - 账号维度：IP + 用户名
 * - IP 维度：同一客户端对任意用户名失败累计（防换号喷洒）
 */
@Injectable()
export class LoginLockoutService {
  private redis: Redis;
  private readonly maxAttempts: number;
  private readonly lockoutSeconds: number;
  private readonly ipMaxAttempts: number;
  private readonly ipLockoutSeconds: number;

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
    this.ipMaxAttempts = configService.get<number>('auth.loginIpMaxAttempts') ?? 8;
    this.ipLockoutSeconds = (configService.get<number>('auth.loginIpLockoutMinutes') ?? 60) * 60;
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

  private ipLockKey(scope: string, ip: string) {
    return `${scope}-login-ip-lock:${ip}`;
  }

  private ipAttemptKey(scope: string, ip: string) {
    return `${scope}-login-ip-attempts:${ip}`;
  }

  buildLockedException(retryAfterSeconds: number, kind: 'ip' | 'account' = 'account') {
    const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    const lockedUntil = new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
    const message =
      kind === 'ip'
        ? `该网络登录失败次数过多，请 ${minutes} 分钟后再试`
        : `登录失败次数过多，请 ${minutes} 分钟后再试`;
    return new UnauthorizedException({
      message,
      errorCode: 'LOGIN_LOCKED',
      detail: { retryAfterSeconds, lockedUntil, lockScope: kind },
    });
  }

  async getIpLockStatus(ip: string | undefined, scope = 'login'): Promise<LoginLockStatus> {
    const normalizedIp = this.normalizeIp(ip);
    const ttl = await this.redis.ttl(this.ipLockKey(scope, normalizedIp));
    if (ttl > 0) {
      return {
        locked: true,
        scope: 'ip',
        retryAfterSeconds: ttl,
        lockedUntil: new Date(Date.now() + ttl * 1000).toISOString(),
      };
    }
    const raw = await this.redis.get(this.ipAttemptKey(scope, normalizedIp));
    const count = raw ? Number(raw) : 0;
    return {
      locked: false,
      scope: 'ip',
      remainingAttempts: Math.max(0, this.ipMaxAttempts - count),
    };
  }

  async getLockStatus(ip: string | undefined, account: string, scope = 'login'): Promise<LoginLockStatus> {
    const ipStatus = await this.getIpLockStatus(ip, scope);
    if (ipStatus.locked) return ipStatus;

    const normalizedIp = this.normalizeIp(ip);
    const ttl = await this.redis.ttl(this.lockKey(scope, normalizedIp, account));
    if (ttl <= 0) {
      const raw = await this.redis.get(this.attemptKey(scope, normalizedIp, account));
      const count = raw ? Number(raw) : 0;
      return {
        locked: false,
        scope: 'account',
        remainingAttempts: Math.max(0, this.maxAttempts - count),
      };
    }
    return {
      locked: true,
      scope: 'account',
      retryAfterSeconds: ttl,
      lockedUntil: new Date(Date.now() + ttl * 1000).toISOString(),
    };
  }

  async assertNotLocked(ip: string | undefined, account: string, scope = 'login') {
    const status = await this.getLockStatus(ip, account, scope);
    if (status.locked) {
      throw this.buildLockedException(
        status.retryAfterSeconds ?? (status.scope === 'ip' ? this.ipLockoutSeconds : this.lockoutSeconds),
        status.scope ?? 'account',
      );
    }
  }

  /** 钱包 nonce/登录等无用户名场景：只拦 IP 封禁 */
  async assertIpNotLocked(ip: string | undefined, scope = 'login') {
    const status = await this.getIpLockStatus(ip, scope);
    if (status.locked) {
      throw this.buildLockedException(status.retryAfterSeconds ?? this.ipLockoutSeconds, 'ip');
    }
  }

  /** 记录一次密码登录失败；IP 或账号达上限时锁定 */
  async recordFailure(ip: string | undefined, account: string, scope = 'login'): Promise<LoginLockStatus> {
    const normalizedIp = this.normalizeIp(ip);

    const ipAttemptKey = this.ipAttemptKey(scope, normalizedIp);
    const ipCount = await this.redis.incr(ipAttemptKey);
    if (ipCount === 1) {
      await this.redis.expire(ipAttemptKey, this.ipLockoutSeconds);
    }
    if (ipCount >= this.ipMaxAttempts) {
      await this.redis.set(this.ipLockKey(scope, normalizedIp), '1', 'EX', this.ipLockoutSeconds);
      await this.redis.del(ipAttemptKey);
      return { locked: true, scope: 'ip', retryAfterSeconds: this.ipLockoutSeconds };
    }

    const attemptKey = this.attemptKey(scope, normalizedIp, account);
    const count = await this.redis.incr(attemptKey);
    if (count === 1) {
      await this.redis.expire(attemptKey, this.lockoutSeconds);
    }

    if (count >= this.maxAttempts) {
      await this.redis.set(this.lockKey(scope, normalizedIp, account), '1', 'EX', this.lockoutSeconds);
      await this.redis.del(attemptKey);
      return { locked: true, scope: 'account', retryAfterSeconds: this.lockoutSeconds };
    }

    return {
      locked: false,
      remainingAttempts: Math.min(
        Math.max(0, this.maxAttempts - count),
        Math.max(0, this.ipMaxAttempts - ipCount),
      ),
    };
  }

  async clear(ip: string | undefined, account: string, scope = 'login') {
    const normalizedIp = this.normalizeIp(ip);
    await this.redis.del(
      this.lockKey(scope, normalizedIp, account),
      this.attemptKey(scope, normalizedIp, account),
      this.ipLockKey(scope, normalizedIp),
      this.ipAttemptKey(scope, normalizedIp),
    );
  }
}
