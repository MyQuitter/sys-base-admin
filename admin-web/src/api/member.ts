import axios from 'axios';
import { message } from 'antd';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/useAuthStore';
import type { PageResult } from '@/types/api';

export interface MemberItem {
  id: number;
  phone?: string;
  email?: string;
  nickname?: string;
  avatar?: string;
  status: number;
  registerSource: string;
  lastLoginAt?: string;
  lastLoginIp?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MemberQuery {
  page?: number;
  pageSize?: number;
  phone?: string;
  email?: string;
  nickname?: string;
  keyword?: string;
  status?: number;
}

export interface CreateMemberParams {
  phone?: string;
  email?: string;
  password: string;
  nickname?: string;
  status?: number;
}

export interface UpdateMemberParams {
  phone?: string;
  email?: string;
  nickname?: string;
  avatar?: string;
  status?: number;
}

export function getMembers(params: MemberQuery) {
  return request.get<never, PageResult<MemberItem>>('/members', { params });
}

export function getMember(id: number) {
  return request.get<never, MemberItem>(`/members/${id}`);
}

export function createMember(data: CreateMemberParams) {
  return request.post<never, MemberItem>('/members', data);
}

export function updateMember(id: number, data: UpdateMemberParams) {
  return request.put<never, MemberItem>(`/members/${id}`, data);
}

export function deleteMember(id: number) {
  return request.delete(`/members/${id}`);
}

export function resetMemberPassword(id: number, password: string) {
  return request.post(`/members/${id}/reset-password`, { password });
}

/** 导出会员用户 CSV */
export async function exportMembers(params?: MemberQuery) {
  const token = useAuthStore.getState().accessToken;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/members/export`, {
      params,
      responseType: 'blob',
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const contentType = String(res.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      const text = await res.data.text();
      const json = JSON.parse(text) as { message?: string };
      throw new Error(json.message ?? '导出失败');
    }

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'members.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '导出失败';
    message.error(msg);
    throw err;
  }
}
