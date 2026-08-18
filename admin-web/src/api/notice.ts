import request from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface NoticeItem {
  id: number;
  title: string;
  content: string;
  status: number;
  noticeType?: string;
  targetType?: string;
  targetIds?: number[];
  priority?: string;
  publisherId?: number;
  publishTime?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoticeQuery {
  page?: number;
  pageSize?: number;
  title?: string;
  status?: number;
}

export interface NoticePayload {
  title: string;
  content: string;
  noticeType?: string;
  targetType?: string;
  targetIds?: number[];
  priority?: string;
}

export function getNotices(params: NoticeQuery) {
  return request.get<never, PageResult<NoticeItem>>('/notices', { params });
}

export function createNotice(data: NoticePayload) {
  return request.post<never, NoticeItem>('/notices', data);
}

export function updateNotice(id: number, data: Partial<NoticePayload>) {
  return request.put<never, NoticeItem>(`/notices/${id}`, data);
}

export function publishNotice(id: number, data?: { targetType?: string; targetIds?: number[] }) {
  return request.put<never, { noticeId: number; deliveredCount: number }>(`/notices/${id}/publish`, data ?? {});
}

export function revokeNotice(id: number) {
  return request.put<never, { noticeId: number; status: number }>(`/notices/${id}/revoke`);
}

export function deleteNotice(id: number) {
  return request.delete(`/notices/${id}`);
}
