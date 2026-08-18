import axios from 'axios';
import { message } from 'antd';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/useAuthStore';
import type { PageResult } from '@/types/api';

export interface OperationLogItem {
  id: number;
  userId?: number;
  username?: string;
  module: string;
  action: string;
  method: string;
  url: string;
  ip?: string;
  status: number;
  durationMs: number;
  createdAt: string;
}

export interface LoginLogItem {
  id: number;
  username: string;
  userId?: number;
  ip?: string;
  status: number;
  userType?: string;
  loginType?: string;
  message?: string;
  createdAt: string;
}

export interface ProtectionLogItem {
  id: number;
  category: string;
  eventType: string;
  errorCode: string;
  username?: string;
  userId?: number;
  walletAddress?: string;
  ip?: string;
  path?: string;
  message: string;
  severity: string;
  createdAt: string;
}

export interface LogQuery {
  page?: number;
  pageSize?: number;
  username?: string;
  module?: string;
  status?: number;
  userType?: string;
  category?: string;
  errorCode?: string;
  severity?: string;
}

/** 去除空字符串，避免筛选条件传空值 */
function cleanQuery(params?: LogQuery): LogQuery | undefined {
  if (!params) return undefined;
  const cleaned: LogQuery = {};
  if (params.page) cleaned.page = params.page;
  if (params.pageSize) cleaned.pageSize = params.pageSize;
  if (params.username?.trim()) cleaned.username = params.username.trim();
  if (params.module?.trim()) cleaned.module = params.module.trim();
  if (params.status !== undefined && params.status !== null) cleaned.status = params.status;
  if (params.userType) cleaned.userType = params.userType;
  if (params.category) cleaned.category = params.category;
  if (params.errorCode) cleaned.errorCode = params.errorCode;
  if (params.severity) cleaned.severity = params.severity;
  return Object.keys(cleaned).length ? cleaned : undefined;
}

export function getOperationLogs(params: LogQuery) {
  return request.get<never, PageResult<OperationLogItem>>('/logs/operation', {
    params: cleanQuery(params),
  });
}

export function getLoginLogs(params: LogQuery) {
  return request.get<never, PageResult<LoginLogItem>>('/logs/login', { params: cleanQuery(params) });
}

export function getProtectionLogs(params: LogQuery) {
  return request.get<never, PageResult<ProtectionLogItem>>('/logs/protection', {
    params: cleanQuery(params),
  });
}

/** 下载 CSV 导出（绕过 JSON 响应拦截） */
async function downloadCsv(path: string, filename: string, params?: LogQuery) {
  const token = useAuthStore.getState().accessToken;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}${path}`, {
      params: cleanQuery(params),
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
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '导出失败';
    message.error(msg);
    throw err;
  }
}

export function exportOperationLogs(params?: LogQuery) {
  return downloadCsv('/logs/operation/export', 'operation-logs.csv', params);
}

export function exportLoginLogs(params?: LogQuery) {
  return downloadCsv('/logs/login/export', 'login-logs.csv', params);
}

export function exportProtectionLogs(params?: LogQuery) {
  return downloadCsv('/logs/protection/export', 'protection-logs.csv', params);
}
