import axios from 'axios';

import request from '@/utils/request';
import { useAuthStore } from '@/stores/useAuthStore';
import type { PageResult } from '@/types/api';

import { toast } from '@/utils/toast';
export interface FileItem {
  id: number;
  originalName: string;
  mimeType: string;
  size: number;
  url: string;
  uploadedBy: number;
  uploaderName?: string;
  createdAt: string;
}

export interface FileQuery {
  page?: number;
  pageSize?: number;
  filename?: string;
  mimeType?: string;
  userId?: number;
  startTime?: string;
  endTime?: string;
}

function cleanQuery(params?: FileQuery): FileQuery | undefined {
  if (!params) return undefined;
  const cleaned: FileQuery = {};
  if (params.page) cleaned.page = params.page;
  if (params.pageSize) cleaned.pageSize = params.pageSize;
  if (params.filename?.trim()) cleaned.filename = params.filename.trim();
  if (params.mimeType?.trim()) cleaned.mimeType = params.mimeType.trim();
  if (params.userId) cleaned.userId = params.userId;
  if (params.startTime) cleaned.startTime = params.startTime;
  if (params.endTime) cleaned.endTime = params.endTime;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export function getFiles(params?: FileQuery) {
  return request.get<never, PageResult<FileItem>>('/files', { params: cleanQuery(params) });
}

export function getFile(id: number) {
  return request.get<never, FileItem>(`/files/${id}`);
}

export function deleteFile(id: number) {
  return request.delete<never, { success: boolean }>(`/files/${id}`);
}

/** multipart 上传，支持多文件 */
export function uploadFiles(files: File[]) {
  const formData = new FormData();
  files.forEach((file) => formData.append('file', file));
  return request.post<never, FileItem | FileItem[]>('/files/upload', formData);
}

/** blob 下载或触发浏览器保存 */
export async function downloadFile(id: number, filename: string) {
  const token = useAuthStore.getState().accessToken;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/files/${id}/download`, {
      responseType: 'blob',
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    const contentType = String(res.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      const text = await res.data.text();
      const json = JSON.parse(text) as { message?: string };
      throw new Error(json.message ?? '下载失败');
    }

    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '下载失败';
    toast.error(msg);
    throw err;
  }
}

/** 图片预览 URL（带鉴权 blob） */
export async function fetchFileBlobUrl(id: number) {
  const token = useAuthStore.getState().accessToken;
  const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/files/${id}/download`, {
    responseType: 'blob',
    withCredentials: true,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  return URL.createObjectURL(res.data);
}
