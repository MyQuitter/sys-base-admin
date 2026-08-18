import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { Request, Response } from 'express';
import Redis from 'ioredis';
import * as bcrypt from 'bcrypt';
import { LoginLockoutService } from '../../base/auth/login-lockout.service';
import { LogService } from '../../base/log/log.service';
import { MemberChangePasswordDto, MemberLoginDto, MemberRegisterDto, MemberUpdateProfileDto } from './dto/member-auth.dto';
import { MemberService } from '../member.service';

export interface MemberJwtPayload {
  sub: number;
  type: 'member';
  account: string;
}

@Injectable()
export class MemberAuthService {
  private redis: Redis;
  private readonly lockScope = 'member';

  constructor(
    private readonly memberService: MemberService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly loginLockoutService: LoginLockoutService,
    private readonly logService: LogService,
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

  private jwtSignOptions(expiresIn: string): JwtSignOptions {
    return { expiresIn: expiresIn as JwtSignOptions['expiresIn'] };
  }

  private getIp(req?: Request) {
    return req?.ip ?? req?.socket?.remoteAddress;
  }

  private recordMemberLogin(params: {
    username: string;
    userId?: number;
    ip?: string;
    status: number;
    message?: string;
  }) {
    this.logService.recordLogin({
      ...params,
      loginType: 'password',
      userType: 'member',
    });
  }

  private async handleLoginFailure(req: Request | undefined, account: string) {
    const ip = this.getIp(req);
    this.recordMemberLogin({
      username: account,
      ip,
      status: 0,
      message: '账号或密码错误',
    });
    const lockStatus = await this.loginLockoutService.recordFailure(ip, account, this.lockScope);

    if (lockStatus.locked) {
      throw this.loginLockoutService.buildLockedException(lockStatus.retryAfterSeconds ?? 0);
    }

    throw new UnauthorizedException({
      message: '账号或密码错误',
      errorCode: 'AUTH_FAILED',
      detail: lockStatus.remainingAttempts !== undefined ? { remainingAttempts: lockStatus.remainingAttempts } : undefined,
    });
  }

  private async issueTokens(member: { id: number; phone?: string; email?: string }, res: Response, req?: Request) {
    const ip = this.getIp(req);
    const account = member.phone ?? member.email ?? String(member.id);
    const accessExpires = this.configService.getOrThrow<string>('member.jwtAccessExpiresIn');
    const refreshExpires = this.configService.getOrThrow<string>('member.jwtRefreshExpiresIn');

    const payload: MemberJwtPayload = { sub: member.id, type: 'member', account };
    const accessToken = await this.jwtService.signAsync(payload, this.jwtSignOptions(accessExpires));
    const refreshToken = await this.jwtService.signAsync(
      { sub: member.id, type: 'member_refresh' },
      this.jwtSignOptions(refreshExpires),
    );

    await this.redis.set(`member-refresh:${member.id}`, refreshToken, 'EX', 30 * 24 * 3600);
    await this.memberService.recordLogin(member.id, ip);
    this.recordMemberLogin({
      username: account,
      userId: member.id,
      ip,
      status: 1,
    });
    await this.loginLockoutService.clear(ip, account, this.lockScope);

    const cookieName = this.configService.get<string>('member.refreshCookieName') ?? 'member_refresh_token';
    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 3600 * 1000,
    });

    const full = await this.memberService.findOne(member.id);
    return { accessToken, memberInfo: full };
  }

  async register(dto: MemberRegisterDto, res: Response, req?: Request) {
    this.memberService.assertPhoneOrEmail(dto.phone, dto.email);
    const member = await this.memberService.create(
      {
        phone: dto.phone,
        email: dto.email,
        password: dto.password,
        nickname: dto.nickname,
        status: 1,
      },
      'app',
    );
    return this.issueTokens({ id: member.id, phone: member.phone, email: member.email }, res, req);
  }

  async login(dto: MemberLoginDto, res: Response, req?: Request) {
    const account = dto.account.trim();
    const ip = this.getIp(req);
    await this.loginLockoutService.assertNotLocked(ip, account, this.lockScope);

    const member = await this.memberService.findByAccount(account);
    if (!member) {
      await this.handleLoginFailure(req, account);
      return;
    }
    if (member.status !== 1) {
      this.recordMemberLogin({
        username: account,
        userId: member.id,
        ip,
        status: 0,
        message: '账号已禁用',
      });
      throw new UnauthorizedException({ message: '账号已禁用', errorCode: 'MEMBER_DISABLED' });
    }

    const valid = await bcrypt.compare(dto.password, member.password);
    if (!valid) {
      await this.handleLoginFailure(req, account);
      return;
    }

    return this.issueTokens(member, res, req);
  }

  async refresh(memberId: number, refreshToken: string | undefined, res: Response) {
    if (!refreshToken) {
      throw new UnauthorizedException('Refresh Token 缺失');
    }

    const stored = await this.redis.get(`member-refresh:${memberId}`);
    if (!stored || stored !== refreshToken) {
      throw new UnauthorizedException('Refresh Token 无效');
    }

    let payload: { sub: number; type?: string };
    try {
      payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.getOrThrow<string>('jwt.secret'),
      });
    } catch {
      throw new UnauthorizedException('Refresh Token 已过期');
    }

    if (payload.type !== 'member_refresh') {
      throw new UnauthorizedException('Refresh Token 无效');
    }

    const member = await this.memberService.findOne(memberId);
    if (member.status !== 1) {
      throw new UnauthorizedException({ message: '账号已禁用', errorCode: 'MEMBER_DISABLED' });
    }

    const accessExpires = this.configService.getOrThrow<string>('member.jwtAccessExpiresIn');
    const account = member.phone ?? member.email ?? String(member.id);
    const accessToken = await this.jwtService.signAsync(
      { sub: member.id, type: 'member', account } satisfies MemberJwtPayload,
      this.jwtSignOptions(accessExpires),
    );

    const cookieName = this.configService.get<string>('member.refreshCookieName') ?? 'member_refresh_token';
    res.cookie(cookieName, refreshToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 30 * 24 * 3600 * 1000,
    });

    return { accessToken };
  }

  async logout(memberId: number | undefined, res: Response) {
    if (memberId) {
      await this.redis.del(`member-refresh:${memberId}`);
    }
    const cookieName = this.configService.get<string>('member.refreshCookieName') ?? 'member_refresh_token';
    res.clearCookie(cookieName);
    return { success: true };
  }

  parseRefreshCookie(cookies: Record<string, string | undefined>): { memberId?: number; token?: string } {
    const cookieName = this.configService.get<string>('member.refreshCookieName') ?? 'member_refresh_token';
    const token = cookies[cookieName];
    if (!token) return {};
    try {
      const payload = this.jwtService.decode(token) as { sub?: number };
      return { memberId: payload?.sub, token };
    } catch {
      return { token };
    }
  }

  async getProfile(memberId: number) {
    return this.memberService.findOne(memberId);
  }

  async updateProfile(memberId: number, dto: MemberUpdateProfileDto) {
    return this.memberService.updateProfile(memberId, dto);
  }

  async changePassword(memberId: number, dto: MemberChangePasswordDto) {
    return this.memberService.changePassword(memberId, dto.oldPassword, dto.newPassword);
  }
}
