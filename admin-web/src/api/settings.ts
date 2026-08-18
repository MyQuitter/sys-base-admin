import axios from 'axios';
import request from '@/utils/request';
import type { LoginMode } from '@/constants/evm-chains';

export interface SiteSetting {
  siteName: string;
  siteSubtitle?: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginMode: LoginMode;
  walletChainId: number;
  walletChainName: string;
}

export interface EvmChainOption {
  chainId: number;
  name: string;
}

export interface UpdateSiteSettingParams {
  siteName?: string;
  siteSubtitle?: string;
  loginMode?: LoginMode;
  walletChainId?: number;
}

/** 公开接口：无需登录 */
export async function getSiteSetting() {
  const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/settings/site`);
  const { code, data, message } = res.data;
  if (code !== 200) throw new Error(message ?? '获取系统设置失败');
  return data as SiteSetting;
}

export async function getSupportedChains() {
  const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/settings/chains`);
  const { code, data, message } = res.data;
  if (code !== 200) throw new Error(message ?? '获取链列表失败');
  return data as EvmChainOption[];
}

export function updateSiteSetting(params: UpdateSiteSettingParams) {
  return request.put<never, SiteSetting>('/settings/site', params);
}

function uploadBranding(path: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return request.post<never, SiteSetting>(path, formData);
}

export function uploadSiteLogo(file: File) {
  return uploadBranding('/settings/branding/logo', file);
}

export function uploadSiteFavicon(file: File) {
  return uploadBranding('/settings/branding/favicon', file);
}

export function clearSiteLogo() {
  return request.delete<never, SiteSetting>('/settings/branding/logo');
}

export function clearSiteFavicon() {
  return request.delete<never, SiteSetting>('/settings/branding/favicon');
}
