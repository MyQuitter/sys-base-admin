/** 从 Access Token 解析 JWT payload（与后端签发字段一致） */
export function parseJwtPayload(token: string): {
  sub?: number;
  username?: string;
  permissions?: string[];
} | null {
  try {
    return JSON.parse(atob(token.split('.')[1])) as {
      sub?: number;
      username?: string;
      permissions?: string[];
    };
  } catch {
    return null;
  }
}

/** 从 Access Token 解析权限列表 */
export function parseJwtPermissions(token: string): string[] {
  return parseJwtPayload(token)?.permissions ?? [];
}
