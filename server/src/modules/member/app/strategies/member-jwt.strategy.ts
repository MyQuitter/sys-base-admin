import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { MemberJwtPayload } from '../member-auth.service';

@Injectable()
export class MemberJwtStrategy extends PassportStrategy(Strategy, 'member-jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  validate(payload: MemberJwtPayload) {
    if (!payload?.sub || payload.type !== 'member') {
      throw new UnauthorizedException('Token 无效');
    }
    return {
      memberId: payload.sub,
      account: payload.account,
    };
  }
}
