/** 从 Access Token 解析权限列表（与后端 JWT payload 一致） */
export function parseJwtPermissions(token: string): string[] {
  try {
    const payload = JSON.parse(atob(token.split('.')[1])) as { permissions?: string[] };
    return payload.permissions ?? [];
  } catch {
    return [];
  }
}
