import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { Request } from 'express';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';
import { requireDeviceId } from '../../../../common/utils/device-id';
import { getUserPermissionCodes } from '../../../../common/utils/rbac';
import { User } from '../../user/entities/user.entity';
import { TokenRevokeService } from '../token-revoke.service';

/** Access Token 载荷结构（权限以数据库为准；did 绑定浏览器设备标识） */
export interface JwtPayload {
  sub: number;
  username: string;
  permissions?: string[];
  type?: 'admin' | 'member' | 'refresh' | 'member_refresh';
  /** 登录时绑定的设备 ID */
  did?: string;
}

/**
 * Passport JWT 策略：校验后台 Access Token，绑定设备，并从数据库加载最新权限。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly tokenRevoke: TokenRevokeService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
      passReqToCallback: true,
    });
  }

  /**
   * 强制 type=admin，比对 X-Device-Id 与 Token.did，确认用户仍启用。
   * @throws UnauthorizedException Token / 设备不匹配或用户失效
   */
  async validate(req: Request, payload: JwtPayload) {
    if (!payload?.sub || payload.type !== 'admin' || !payload.did) {
      throw new UnauthorizedException('Token 无效');
    }

    const deviceId = requireDeviceId(req);
    if (deviceId !== payload.did) {
      throw new UnauthorizedException({
        message: '登录设备不匹配，请重新登录',
        errorCode: 'DEVICE_MISMATCH',
      });
    }

    if (await this.tokenRevoke.isRevoked(payload.sub, deviceId)) {
      throw new UnauthorizedException({
        message: '登录已失效，请重新登录',
        errorCode: 'AUTH_SESSION_REVOKED',
      });
    }

    const user = await this.userRepository.findOne({
      where: { id: payload.sub },
      relations: { roles: { permissions: true } },
    });
    if (!user || user.status !== 1) {
      throw new UnauthorizedException({
        message: '登录已失效，请重新登录',
        errorCode: 'AUTH_SESSION_REVOKED',
      });
    }

    return {
      userId: user.id,
      username: user.username,
      permissions: getUserPermissionCodes(user),
      deviceId,
    };
  }
}
