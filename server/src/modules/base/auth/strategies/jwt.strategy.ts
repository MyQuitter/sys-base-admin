import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/** Access Token 载荷结构 */
export interface JwtPayload {
  sub: number;
  username: string;
  permissions?: string[];
  type?: 'admin' | 'member';
}

/**
 * Passport JWT 策略：从 Authorization 头解析 Token 并注入 request.user。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  /**
   * 校验载荷合法性，将 sub 映射为 userId 供 Controller 使用。
   * @throws UnauthorizedException sub 缺失
   */
  validate(payload: JwtPayload) {
    if (!payload?.sub) {
      throw new UnauthorizedException('Token 无效');
    }
    if (payload.type === 'member') {
      throw new UnauthorizedException('Token 无效');
    }
    return {
      userId: payload.sub,
      username: payload.username,
      permissions: payload.permissions ?? [],
    };
  }
}
