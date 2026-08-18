import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** C 端会员 JWT 守卫 */
@Injectable()
export class MemberJwtGuard extends AuthGuard('member-jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
