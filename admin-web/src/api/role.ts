import request from '@/utils/request';

export interface RoleItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  menuRestricted?: boolean;
  permissions: { id: number; code: string; name: string; module?: string }[];
  menus?: { id: number; name: string; path?: string; permissionCode?: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateRoleParams {
  code: string;
  name: string;
  description?: string;
}

export interface UpdateRoleParams {
  name?: string;
  description?: string;
}

export interface RoleMenuOption {
  id: number;
  parentId?: number;
  name: string;
  path?: string;
  permissionCode?: string;
}

/** 查询全部角色（含权限列表） */
export function getRoles() {
  return request.get<never, RoleItem[]>('/roles');
}

/** 查询单个角色详情 */
export function getRole(id: number) {
  return request.get<never, RoleItem>(`/roles/${id}`);
}

/** 创建角色 */
export function createRole(data: CreateRoleParams) {
  return request.post<never, RoleItem>('/roles', data);
}

/** 更新角色名称与描述 */
export function updateRole(id: number, data: UpdateRoleParams) {
  return request.put<never, RoleItem>(`/roles/${id}`, data);
}

/** 软删除角色 */
export function deleteRole(id: number) {
  return request.delete(`/roles/${id}`);
}

/** 为角色全量替换权限关联 */
export function assignRolePermissions(id: number, permissionIds: number[]) {
  return request.post<never, RoleItem>(`/roles/${id}/permissions`, { permissionIds });
}

/** 角色可勾选的导航菜单 */
export function getRoleMenuOptions() {
  return request.get<never, RoleMenuOption[]>('/roles/menu-options');
}

/** 为角色全量替换可见菜单 */
export function assignRoleMenus(id: number, menuIds: number[]) {
  return request.post<never, RoleItem>(`/roles/${id}/menus`, { menuIds });
}
