import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';

/**
 * 权限守卫：在 JWT 通过后校验接口所需的权限码。
 * 标记 @Public() 或未标注 @RequirePermissions 的接口直接放行。
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  /**
   * 比对请求用户 JWT 中的 permissions 是否包含全部所需权限码。
   * @throws ForbiddenException 权限不足时返回 FORBIDDEN 及所需权限列表
   */
  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<{ user?: { permissions?: string[] } }>();
    const userPermissions = request.user?.permissions ?? [];
    const allowed = required.every((p) => userPermissions.includes(p));
    if (!allowed) {
      throw new ForbiddenException({
        message: '权限不足',
        errorCode: 'FORBIDDEN',
        detail: `需要权限: ${required.join(', ')}`,
      });
    }
    return true;
  }
}
