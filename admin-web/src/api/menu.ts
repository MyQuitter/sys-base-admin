import request from '@/utils/request';

export interface MenuTreeNode {
  id: number;
  name: string;
  path?: string;
  icon?: string;
  children?: MenuTreeNode[];
}

export interface MenuItem {
  id: number;
  parentId?: number;
  name: string;
  path?: string;
  icon?: string;
  permissionCode?: string;
  sort: number;
  status: number;
}

export interface CreateMenuParams {
  parentId?: number;
  name: string;
  path?: string;
  icon?: string;
  permissionCode?: string;
  sort?: number;
  status?: number;
}

export interface UpdateMenuParams {
  parentId?: number;
  name?: string;
  path?: string;
  icon?: string;
  permissionCode?: string;
  sort?: number;
  status?: number;
}

/** 获取当前用户可见菜单树（侧边栏） */
export function getMenuTree() {
  return request.get<never, MenuTreeNode[]>('/menus/tree');
}

/** 获取菜单扁平列表（管理页） */
export function getMenus() {
  return request.get<never, MenuItem[]>('/menus');
}

/** 创建菜单节点 */
export function createMenu(data: CreateMenuParams) {
  return request.post<never, MenuItem>('/menus', data);
}

/** 更新菜单 */
export function updateMenu(id: number, data: UpdateMenuParams) {
  return request.put<never, MenuItem>(`/menus/${id}`, data);
}

/** 删除菜单（有子菜单时后端拒绝） */
export function deleteMenu(id: number) {
  return request.delete(`/menus/${id}`);
}
