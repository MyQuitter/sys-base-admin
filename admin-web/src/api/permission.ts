import request from '@/utils/request';

export interface PermissionItem {
  id: number;
  code: string;
  name: string;
  module?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePermissionParams {
  code: string;
  name: string;
  module?: string;
}

export interface UpdatePermissionParams {
  name?: string;
  module?: string;
}

/** 查询全部权限点，按模块排序 */
export function getPermissions() {
  return request.get<never, PermissionItem[]>('/permissions');
}

/** 创建权限点 */
export function createPermission(data: CreatePermissionParams) {
  return request.post<never, PermissionItem>('/permissions', data);
}

/** 更新权限名称与模块 */
export function updatePermission(id: number, data: UpdatePermissionParams) {
  return request.put<never, PermissionItem>(`/permissions/${id}`, data);
}

/** 软删除权限点 */
export function deletePermission(id: number) {
  return request.delete(`/permissions/${id}`);
}
