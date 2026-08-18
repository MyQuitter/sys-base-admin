import request from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface PositionItem {
  id: number;
  code: string;
  name: string;
  sort: number;
  status: number;
  createdAt: string;
  updatedAt: string;
}

export interface PositionQuery {
  page?: number;
  pageSize?: number;
  status?: number;
}

export function getPositions(params: PositionQuery) {
  return request.get<never, PageResult<PositionItem>>('/positions', { params });
}

export function createPosition(data: { code: string; name: string; sort?: number; status?: number }) {
  return request.post<never, PositionItem>('/positions', data);
}

export function updatePosition(id: number, data: { name?: string; sort?: number; status?: number }) {
  return request.put<never, PositionItem>(`/positions/${id}`, data);
}

export function deletePosition(id: number) {
  return request.delete(`/positions/${id}`);
}
