import { SetMetadata } from '@nestjs/common';

/** PermissionsGuard 读取的元数据键 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * 声明接口所需权限码，用户 JWT 中须全部包含方可访问。
 * @param permissions - 权限码列表，格式 `{模块}:{操作}`
 */
export const RequirePermissions = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
