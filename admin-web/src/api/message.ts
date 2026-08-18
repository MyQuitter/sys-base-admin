import request from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface MessageItem {
  id: number;
  noticeId?: number;
  title: string;
  content: string;
  messageType: string;
  isRead: number;
  isPopup: number;
  priority: string;
  readAt?: string;
  createdAt: string;
}

export interface MessageQuery {
  page?: number;
  pageSize?: number;
  isRead?: number;
}

export function getUnreadCount() {
  return request.get<never, { count: number }>('/messages/unread-count', { skipLoading: true });
}

export function getMyMessages(params: MessageQuery) {
  return request.get<never, PageResult<MessageItem>>('/messages/mine', { params, skipLoading: true });
}

export function getMessageDetail(id: number) {
  return request.get<never, MessageItem>(`/messages/${id}`, { skipLoading: true });
}

export function markMessageRead(id: number) {
  return request.put<never, MessageItem>(`/messages/${id}/read`, null, { skipLoading: true });
}

export function markAllMessagesRead() {
  return request.put<never, { updated: number }>('/messages/read-all', null, { skipLoading: true });
}
