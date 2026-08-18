import request from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface UserItem {
  id: number;
  username: string;
  nickname?: string;
  status: number;
  departmentId?: number;
  walletAddress?: string;
  walletAddressMasked?: string;
  roles: { id: number; code: string; name: string }[];
  positions: { id: number; code: string; name: string }[];
  createdAt: string;
  updatedAt: string;
}

export interface UserQuery {
  page?: number;
  pageSize?: number;
  username?: string;
  status?: number;
  departmentId?: number;
}

export interface CreateUserParams {
  username: string;
  password: string;
  nickname?: string;
  status?: number;
  departmentId?: number;
  roleIds?: number[];
  positionIds?: number[];
}

export interface UpdateUserParams {
  username?: string;
  nickname?: string;
  status?: number;
  departmentId?: number;
  roleIds?: number[];
  positionIds?: number[];
}

/** 分页查询用户列表 */
export function getUsers(params: UserQuery) {
  return request.get<never, PageResult<UserItem>>('/users', { params });
}

/** 查询单个用户详情（含角色） */
export function getUser(id: number) {
  return request.get<never, UserItem>(`/users/${id}`);
}

/** 创建用户并可选绑定角色 */
export function createUser(data: CreateUserParams) {
  return request.post<never, UserItem>('/users', data);
}

/** 更新用户信息与角色绑定 */
export function updateUser(id: number, data: UpdateUserParams) {
  return request.put<never, UserItem>(`/users/${id}`, data);
}

/** 软删除用户 */
export function deleteUser(id: number) {
  return request.delete(`/users/${id}`);
}

/** 管理员重置指定用户密码 */
export function resetPassword(id: number, password: string) {
  return request.post(`/users/${id}/reset-password`, { password });
}

export function bindUserWallet(id: number, walletAddress: string) {
  return request.put<never, UserItem>(`/users/${id}/wallet`, { walletAddress });
}

export function unbindUserWallet(id: number) {
  return request.delete<never, UserItem>(`/users/${id}/wallet`);
}
