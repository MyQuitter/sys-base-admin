import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import { Repository } from 'typeorm';
import { maskWallet } from '../../../common/utils/wallet';
import { getUserPermissionCodes } from '../../../common/utils/rbac';
import {
  LogService,
  LoginType,
  ProtectionLogContext,
  RecordProtectionParams,
} from '../log/log.service';
import { SettingService } from '../setting/setting.service';
import { User } from '../user/entities/user.entity';
import { LoginDto } from './dto/login.dto';
import { WalletCompleteDto } from './dto/wallet-complete.dto';
import { WalletLoginDto } from './dto/wallet-login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { LoginLockoutService } from './login-lockout.service';
import { WalletAuthService } from './wallet-auth.service';
import { LoginCaptchaService } from './login-captcha.service';
import { TokenRevokeService } from './token-revoke.service';
import { getClientIp } from '../../../common/utils/client-ip';
import { requireDeviceId } from '../../../common/utils/device-id';

/**
 * 后台认证编排服务（sys_user）。
 *
 * 登录模式（站点设置 loginMode）：
 * - password：仅密码 → 直接发 Token
 * - wallet：仅钱包 → wallet/nonce + wallet/login
 * - both：密码通过后返回 loginTicket → nonce → wallet/complete 验签后再发 Token
 *
 * Token 双轨：accessToken 放响应体；refresh_token 写 HttpOnly Cookie。
 * 会话按设备绑定：Redis `refresh:{userId}:{deviceId}` / `online:{userId}:{deviceId}`，JWT 含 `did`。
 */
@Injectable()
export class AuthService {
  /** 存 refresh/online 设备会话 */
  private redis: Redis;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly logService: LogService,
    private readonly settingService: SettingService,
    private readonly walletAuthService: WalletAuthService,
    private readonly loginLockoutService: LoginLockoutService,
    private readonly loginCaptchaService: LoginCaptchaService,
    private readonly tokenRevoke: TokenRevokeService,
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

  /** JwtService.signAsync 的 expiresIn 类型收窄辅助 */
  private jwtSignOptions(expiresIn: string): JwtSignOptions {
    return { expiresIn: expiresIn as JwtSignOptions['expiresIn'] };
  }

  /** 从 HTTP 请求提取防护日志上下文（IP、路径），可再合并用户名/钱包等 */
  private buildLogContext(req?: Request, extra?: Partial<ProtectionLogContext>): ProtectionLogContext {
    return {
      ip: getClientIp(req),
      path: req?.url,
      ...extra,
    };
  }

  /** 记一条防护/安全事件（失败登录、钱包不匹配等） */
  private recordProtection(
    req: Request | undefined,
    params: Pick<RecordProtectionParams, 'category' | 'eventType' | 'errorCode' | 'message' | 'severity'> &
      Partial<Pick<RecordProtectionParams, 'username' | 'userId' | 'walletAddress'>>,
  ) {
    const ctx = this.buildLogContext(req, {
      username: params.username,
      userId: params.userId,
      walletAddress: params.walletAddress,
    });
    this.logService.recordProtection({
      ...params,
      ip: ctx.ip,
      path: ctx.path,
      username: ctx.username,
      userId: ctx.userId,
      walletAddress: ctx.walletAddress,
    });
  }

  /** 按用户名查用户，强制选出 password（实体上通常 select:false）及角色权限，供密码校验 */
  private async findUserWithAuth(username: string) {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .leftJoinAndSelect('user.roles', 'role')
      .leftJoinAndSelect('role.permissions', 'permission')
      .where('user.username = :username', { username })
      .getOne();
  }

  /** 按 ID 查用户 + 角色权限（刷新 Token、complete 第二步等不需要密码） */
  private async findUserWithRoles(userId: number) {
    return this.userRepository.findOne({
      where: { id: userId },
      relations: { roles: { permissions: true } },
    });
  }

  /** 按已绑定钱包地址查用户（纯钱包登录） */
  private async findUserByWallet(address: string, ctx?: ProtectionLogContext) {
    const checksum = await this.walletAuthService.normalizeAddress(address, ctx);
    return this.userRepository.findOne({
      where: { walletAddress: checksum },
      relations: { roles: { permissions: true } },
    });
  }

  /** 组装前端 userInfo：id / 用户名 / 昵称 / 权限码列表（写入 JWT 与登录响应） */
  buildUserInfo(user: User) {
    const permissions = getUserPermissionCodes(user);
    return {
      id: user.id,
      username: user.username,
      nickname: user.nickname,
      permissions,
    };
  }

  /**
   * 登录成功统一发证：
   * 1. 读取并校验 X-Device-Id
   * 2. 签 access JWT（含 permissions、type:admin、did）
   * 3. 签 refresh JWT（含 did），写入 Redis + HttpOnly Cookie
   * 4. 记登录成功日志、登记 online:{userId}:{deviceId}
   */
  private async issueTokens(user: User, res: Response, req?: Request, loginType: LoginType = 'password') {
    const deviceId = requireDeviceId(req);
    const ip = getClientIp(req) ?? req?.ip ?? req?.socket?.remoteAddress;
    const permissions = getUserPermissionCodes(user);
    // access payload 仍携带 permissions 便于排查；鉴权以 JwtStrategy 查库结果为准
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      permissions,
      type: 'admin',
      did: deviceId,
    };

    const accessExpires = this.configService.getOrThrow<string>('jwt.accessTokenExpiresIn');
    const refreshExpires = this.configService.getOrThrow<string>('jwt.refreshTokenExpiresIn');
    const signOptions = this.jwtSignOptions;

    const accessToken = await this.jwtService.signAsync(payload, signOptions(accessExpires));
    await this.tokenRevoke.clear(user.id, deviceId);
    // refresh 含 sub + type + did；按设备键存 Redis 比对
    const refreshToken = await this.jwtService.signAsync(
      { sub: user.id, type: 'refresh', did: deviceId },
      signOptions(refreshExpires),
    );

    await this.redis.set(this.tokenRevoke.refreshKey(user.id, deviceId), refreshToken, 'EX', 7 * 24 * 3600);

    await this.logService.recordLogin({
      username: user.username,
      userId: user.id,
      ip,
      status: 1,
      loginType,
    });

    await this.redis.set(
      this.tokenRevoke.onlineKey(user.id, deviceId),
      JSON.stringify({
        userId: user.id,
        username: user.username,
        nickname: user.nickname,
        ip,
        deviceId,
        loginTime: new Date().toISOString(),
      }),
      'EX',
      7 * 24 * 3600,
    );

    const cookieName = this.configService.get<string>('jwt.refreshCookieName') ?? 'refresh_token';
    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      // 生产环境仅 HTTPS 传 Cookie
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return {
      accessToken,
      userInfo: this.buildUserInfo(user),
    };
  }

  /**
   * 密码登录失败：累加锁定计数 → 写登录失败日志 → 达阈值则锁定异常，否则 AUTH_FAILED。
   * 故意对外统一「用户名或密码错误」，避免枚举用户名（detail 可带剩余次数）。
   */
  private async handlePasswordLoginFailure(
    req: Request | undefined,
    ip: string | undefined,
    username: string,
    userId?: number,
    logMessage = '用户名或密码错误',
  ) {
    const lockStatus = await this.loginLockoutService.recordFailure(ip, username);

    await this.logService.recordLogin({
      username,
      userId,
      ip,
      status: 0,
      message: logMessage,
      loginType: 'password',
    });

    if (lockStatus.locked) {
      const ipLocked = lockStatus.scope === 'ip';
      this.recordProtection(req, {
        category: 'auth',
        eventType: ipLocked ? 'LOGIN_IP_LOCKED' : 'LOGIN_LOCKED',
        errorCode: 'LOGIN_LOCKED',
        message: ipLocked ? '该网络登录失败次数过多，已临时封禁' : '登录失败次数过多，账号已临时锁定',
        severity: 'warn',
        username,
        userId,
      });
      throw this.loginLockoutService.buildLockedException(
        lockStatus.retryAfterSeconds ?? 0,
        lockStatus.scope ?? 'account',
      );
    }

    this.recordProtection(req, {
      category: 'auth',
      eventType: 'AUTH_FAILED',
      errorCode: 'AUTH_FAILED',
      message: logMessage,
      severity: 'warn',
      username,
      userId,
    });

    const remaining = lockStatus.remainingAttempts;
    throw new UnauthorizedException({
      message: '用户名或密码错误',
      errorCode: 'AUTH_FAILED',
      detail: remaining !== undefined ? { remainingAttempts: remaining } : undefined,
    });
  }

  /**
   * POST /api/auth/login — 密码登录入口。
   * both 模式：密码正确后不发 Token，返回 needWalletVerify + loginTicket，要求前端继续钱包签名。
   */
  async login(dto: LoginDto, res: Response, req?: Request) {
    const ctx = this.buildLogContext(req);
    // 站点仅 wallet 时拒绝密码登录（除非配置了 passwordLoginFallback）
    this.walletAuthService.assertPasswordLoginAllowed(ctx);
    const ip = ctx.ip;
    const loginMode = this.settingService.getLoginMode();

    await this.loginCaptchaService.assertValid(dto.captchaId, dto.captchaCode);

    // 已锁定则直接拒绝，不再验密（防爆破继续打 bcrypt）
    await this.loginLockoutService.assertNotLocked(ip, dto.username);

    const user = await this.findUserWithAuth(dto.username);
    // 用户不存在或禁用：走同一失败路径，对外信息不区分
    if (!user || user.status !== 1) {
      await this.handlePasswordLoginFailure(req, ip, dto.username);
      return;
    }

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) {
      await this.handlePasswordLoginFailure(req, ip, dto.username, user.id, '密码错误');
      return;
    }

    // 密码正确：清失败计数
    await this.loginLockoutService.clear(ip, dto.username);

    // both：必须已绑定钱包，否则无法完成第二步
    if (loginMode === 'both') {
      if (!user.walletAddress) {
        this.recordProtection(req, {
          category: 'wallet',
          eventType: 'WALLET_NOT_BOUND_FOR_USER',
          errorCode: 'WALLET_NOT_BOUND_FOR_USER',
          message: '该账号未绑定钱包，无法完成登录',
          severity: 'warn',
          username: user.username,
          userId: user.id,
        });
        throw new UnauthorizedException({
          message: '该账号未绑定钱包，无法完成登录',
          errorCode: 'WALLET_NOT_BOUND_FOR_USER',
        });
      }
      // 签发短时 ticket；前端展示脱敏钱包引导用户切换账号
      const ticket = await this.walletAuthService.createLoginTicket(user.id);
      return {
        needWalletVerify: true,
        loginTicket: ticket.loginTicket,
        expiresAt: ticket.expiresAt,
        boundWalletMasked: maskWallet(user.walletAddress),
      };
    }

    // password 模式：直接发证
    return this.issueTokens(user, res, req, 'password');
  }

  /**
   * GET /api/auth/wallet/nonce — 获取待签消息。
   * both：必须带 loginTicket + address，nonce 会绑定 userId。
   * wallet：仅需 address。
   */
  async getWalletNonce(params: { address?: string; loginTicket?: string; chainId: number }, req?: Request) {
    const ctx = this.buildLogContext(req);
    await this.loginLockoutService.assertIpNotLocked(ctx.ip);
    this.walletAuthService.assertWalletLoginAllowed(ctx);
    const loginMode = this.settingService.getLoginMode();

    if (loginMode === 'both') {
      if (!params.loginTicket || !params.address) {
        this.recordProtection(req, {
          category: 'auth',
          eventType: 'LOGIN_TICKET_INVALID',
          errorCode: 'LOGIN_TICKET_INVALID',
          message: '缺少登录凭证或钱包地址',
          severity: 'warn',
          walletAddress: params.address,
        });
        throw new UnauthorizedException({ message: '缺少登录凭证或钱包地址', errorCode: 'LOGIN_TICKET_INVALID' });
      }
      // peek ticket → 写带 userId 的 nonce，ticket 本身留给 complete 再消费/释放
      return this.walletAuthService.createNonceForTicket(params.loginTicket, params.address, params.chainId, ctx);
    }

    if (!params.address) {
      this.recordProtection(req, {
        category: 'wallet',
        eventType: 'WALLET_ADDRESS_INVALID',
        errorCode: 'WALLET_ADDRESS_INVALID',
        message: '缺少钱包地址',
        severity: 'info',
      });
      await this.walletAuthService.recordAuthFailure(ctx.ip, 'missing', ctx);
      throw new UnauthorizedException({ message: '缺少钱包地址', errorCode: 'WALLET_ADDRESS_INVALID' });
    }
    return this.walletAuthService.createNonceForAddress(params.address, params.chainId, undefined, ctx);
  }

  /**
   * POST /api/auth/wallet/login — 纯钱包单因子登录（仅 loginMode=wallet）。
   * 验签通过后按 walletAddress 查用户并发证。
   */
  async walletLogin(dto: WalletLoginDto, res: Response, req?: Request) {
    const ctx = this.buildLogContext(req, { walletAddress: dto.address });
    this.walletAuthService.assertWalletLoginAllowed(ctx);
    // both / password 下不应走此接口，引导走 complete 或密码登录
    if (this.settingService.getLoginMode() !== 'wallet') {
      this.recordProtection(req, {
        category: 'auth',
        eventType: 'LOGIN_MODE_WALLET_DISABLED',
        errorCode: 'LOGIN_MODE_WALLET_DISABLED',
        message: '请使用完整登录流程',
        severity: 'info',
        walletAddress: dto.address,
      });
      throw new UnauthorizedException({
        message: '请使用完整登录流程',
        errorCode: 'LOGIN_MODE_WALLET_DISABLED',
      });
    }

    const ip = ctx.ip;
    await this.loginLockoutService.assertIpNotLocked(ip);
    await this.walletAuthService.verifySignature(dto.address, dto.signature, dto.chainId, undefined, ctx);
    const user = await this.findUserByWallet(dto.address, ctx);

    if (!user) {
      await this.logService.recordLogin({
        username: dto.address,
        ip,
        status: 0,
        message: '该钱包未绑定任何用户',
        loginType: 'wallet',
      });
      this.recordProtection(req, {
        category: 'wallet',
        eventType: 'WALLET_NOT_BOUND',
        errorCode: 'WALLET_NOT_BOUND',
        message: '该钱包未绑定任何用户',
        severity: 'warn',
        username: dto.address,
        walletAddress: dto.address,
      });
      await this.walletAuthService.recordAuthFailure(ip, dto.address, ctx);
      throw new UnauthorizedException({ message: '该钱包未绑定任何用户', errorCode: 'WALLET_NOT_BOUND' });
    }
    if (user.status !== 1) {
      this.recordProtection(req, {
        category: 'wallet',
        eventType: 'WALLET_USER_DISABLED',
        errorCode: 'WALLET_USER_DISABLED',
        message: '用户已禁用',
        severity: 'warn',
        username: user.username,
        userId: user.id,
        walletAddress: dto.address,
      });
      throw new UnauthorizedException({ message: '用户已禁用', errorCode: 'WALLET_USER_DISABLED' });
    }

    await this.loginLockoutService.clear(ip, user.username);
    return this.issueTokens(user, res, req, 'wallet');
  }

  /**
   * POST /api/auth/wallet/complete — both 模式第二步。
   * 校验 ticket → 验签（绑定 userId）→ 签名地址必须等于账号已绑定钱包 → 发证。
   */
  async walletComplete(dto: WalletCompleteDto, res: Response, req?: Request) {
    const ctx = this.buildLogContext(req, { walletAddress: dto.address });
    this.walletAuthService.assertWalletLoginAllowed(ctx);
    if (this.settingService.getLoginMode() !== 'both') {
      this.recordProtection(req, {
        category: 'auth',
        eventType: 'LOGIN_MODE_WALLET_DISABLED',
        errorCode: 'LOGIN_MODE_WALLET_DISABLED',
        message: '当前系统未启用双重验证登录',
        severity: 'info',
        walletAddress: dto.address,
      });
      throw new UnauthorizedException({
        message: '当前系统未启用双重验证登录',
        errorCode: 'LOGIN_MODE_WALLET_DISABLED',
      });
    }

    // 1. ticket 仍有效（密码第一步未过期）
    const userId = await this.walletAuthService.validateLoginTicket(dto.loginTicket, ctx);
    const user = await this.findUserWithRoles(userId);
    if (!user || user.status !== 1) {
      this.recordProtection(req, {
        category: 'wallet',
        eventType: 'WALLET_USER_DISABLED',
        errorCode: 'WALLET_USER_DISABLED',
        message: '用户不存在或已禁用',
        severity: 'warn',
        userId,
        walletAddress: dto.address,
      });
      throw new UnauthorizedException({ message: '用户不存在或已禁用', errorCode: 'WALLET_USER_DISABLED' });
    }
    if (!user.walletAddress) {
      this.recordProtection(req, {
        category: 'wallet',
        eventType: 'WALLET_NOT_BOUND_FOR_USER',
        errorCode: 'WALLET_NOT_BOUND_FOR_USER',
        message: '该账号未绑定钱包',
        severity: 'warn',
        username: user.username,
        userId: user.id,
        walletAddress: dto.address,
      });
      throw new UnauthorizedException({
        message: '该账号未绑定钱包',
        errorCode: 'WALLET_NOT_BOUND_FOR_USER',
      });
    }

    // 2. 验签，并要求 nonce 载荷中的 userId === 本 ticket 用户
    const { checksum } = await this.walletAuthService.verifySignature(
      dto.address,
      dto.signature,
      dto.chainId,
      userId,
      { ...ctx, username: user.username, userId: user.id },
    );

    // 3. 签名地址必须与库中绑定地址一致（防「用别人钱包签完别人的 ticket」）
    if (checksum !== user.walletAddress) {
      this.recordProtection(req, {
        category: 'wallet',
        eventType: 'WALLET_ADDRESS_MISMATCH',
        errorCode: 'WALLET_ADDRESS_MISMATCH',
        message: `当前钱包 ${maskWallet(checksum)} 与账号「${user.username}」绑定的钱包 ${maskWallet(user.walletAddress)} 不一致`,
        severity: 'high',
        username: user.username,
        userId: user.id,
        walletAddress: checksum,
      });
      await this.walletAuthService.recordAuthFailure(ctx.ip, user.username, ctx);
      throw new UnauthorizedException({
        message: `当前钱包 ${maskWallet(checksum)} 与账号「${user.username}」绑定的钱包 ${maskWallet(user.walletAddress)} 不一致，请切换至绑定钱包后重试`,
        errorCode: 'WALLET_ADDRESS_MISMATCH',
      });
    }

    // 4. 作废 ticket（verifySignature 已删 nonce）；发证 loginType=both
    await this.walletAuthService.releaseLoginTicket(dto.loginTicket);
    return this.issueTokens(user, res, req, 'both');
  }

  /**
   * POST /api/auth/refresh — 用 Cookie 中的 refresh 换新 accessToken。
   * 必须与 Redis refresh:{userId}:{deviceId} 一致，且 X-Device-Id 与 refresh.did 匹配。
   */
  async refresh(userId: number, refreshToken: string | undefined, res: Response, req?: Request) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh Token 缺失');
    }
    const deviceId = requireDeviceId(req);

    const stored = await this.redis.get(this.tokenRevoke.refreshKey(userId, deviceId));
    if (!stored || stored !== refreshToken) {
      throw new UnauthorizedException('Refresh Token 无效');
    }

    let payload: { sub: number; type?: string; did?: string };
    const jwtSecret = this.configService.getOrThrow<string>('jwt.secret');
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: jwtSecret,
      });
    } catch {
      throw new UnauthorizedException('Refresh Token 已过期');
    }

    // 防止误把 accessToken 当 refresh 用；并校验设备绑定
    if (payload.type !== 'refresh' || payload.did !== deviceId) {
      throw new UnauthorizedException({
        message: 'Refresh Token 无效',
        errorCode: payload.did && payload.did !== deviceId ? 'DEVICE_MISMATCH' : undefined,
      });
    }

    if (await this.tokenRevoke.isRevoked(userId, deviceId)) {
      throw new UnauthorizedException({
        message: '登录已失效，请重新登录',
        errorCode: 'AUTH_SESSION_REVOKED',
      });
    }

    const user = await this.findUserWithRoles(userId);
    if (!user || user.status !== 1) {
      throw new UnauthorizedException('用户不存在');
    }

    // 刷新时重新拉取权限，角色变更可在下次 refresh 生效
    const permissions = getUserPermissionCodes(user);
    const accessExpires = this.configService.getOrThrow<string>('jwt.accessTokenExpiresIn');

    const accessToken = await this.jwtService.signAsync(
      { sub: user.id, username: user.username, permissions, type: 'admin', did: deviceId } satisfies JwtPayload,
      this.jwtSignOptions(accessExpires),
    );

    // 续写 Cookie，保持与现有 refresh 一致（本实现不旋转 refresh 本体）
    const cookieName = this.configService.get<string>('jwt.refreshCookieName') ?? 'refresh_token';
    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 7 * 24 * 3600 * 1000,
    });

    return { accessToken };
  }

  /** POST /api/auth/logout — 仅作废当前设备会话并清 Cookie */
  async logout(userId: number | undefined, res: Response, req?: Request) {
    if (userId) {
      try {
        const deviceId = requireDeviceId(req);
        await this.tokenRevoke.revoke(userId, deviceId);
      } catch {
        // 无设备头时退化为全用户作废，避免残留会话
        await this.tokenRevoke.revoke(userId);
      }
    }
    const cookieName = this.configService.get<string>('jwt.refreshCookieName') ?? 'refresh_token';
    res.clearCookie(cookieName);
    return { success: true };
  }

  /**
   * 从 Cookie 解码 refresh（不校验签名），取出 userId 供 refresh/logout 路由使用。
   * 真正校验在 refresh() 内 verifyAsync + Redis 比对。
   */
  parseRefreshCookie(cookies: Record<string, string | undefined>): { userId?: number; token?: string } {
    const cookieName = this.configService.get<string>('jwt.refreshCookieName') ?? 'refresh_token';
    const token = cookies[cookieName];
    if (!token) return {};
    try {
      const payload = this.jwtService.decode(token) as { sub?: number };
      return { userId: payload?.sub, token };
    } catch {
      return { token };
    }
  }
}
