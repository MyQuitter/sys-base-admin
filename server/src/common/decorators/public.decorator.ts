import { SetMetadata } from '@nestjs/common';

/** JwtAuthGuard / PermissionsGuard 识别此元数据以跳过校验 */
export const IS_PUBLIC_KEY = 'isPublic';

/** 标记接口无需 JWT 与权限校验（如登录、健康检查） */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
