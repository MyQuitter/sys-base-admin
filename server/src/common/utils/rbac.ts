import { User } from '../../modules/base/user/entities/user.entity';

/**
 * 从用户关联的角色中聚合去重权限码，供 JWT 与菜单过滤使用。
 * @param user - 已加载 roles.permissions 的用户实体
 * @returns 权限码数组，如 `['user:list', 'role:create']`
 */
export function getUserPermissionCodes(user: User): string[] {
  const codes = new Set<string>();
  user.roles?.forEach((role) => {
    role.permissions?.forEach((permission) => codes.add(permission.code));
  });
  return Array.from(codes);
}
