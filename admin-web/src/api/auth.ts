import request from '@/utils/request';
import type { UserInfo } from '@/types/api';

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginTicketResult {
  needWalletVerify: true;
  loginTicket: string;
  expiresAt: string;
  boundWalletMasked: string;
}

export interface WalletNonceResult {
  nonce: string;
  message: string;
  expiresAt: string;
}

export interface WalletLoginParams {
  address: string;
  signature: string;
  chainId: number;
}

export interface WalletCompleteParams {
  loginTicket: string;
  address: string;
  signature: string;
  chainId: number;
}

export type LoginResponse = { accessToken: string; userInfo: UserInfo } | LoginTicketResult;

export function isLoginTicketResult(res: LoginResponse): res is LoginTicketResult {
  return 'needWalletVerify' in res && res.needWalletVerify === true;
}

/** 用户登录，成功后 body 返回 accessToken 或 both 模式下的 loginTicket */
export function login(data: LoginParams) {
  return request.post<never, LoginResponse>('/auth/login', data, { skipErrorToast: true });
}

export function getWalletNonce(params: { chainId: number; address?: string; loginTicket?: string }) {
  return request.get<never, WalletNonceResult>('/auth/wallet/nonce', {
    params,
    skipLoading: true,
    skipErrorToast: true,
  });
}

export function walletLogin(data: WalletLoginParams) {
  return request.post<never, { accessToken: string; userInfo: UserInfo }>('/auth/wallet/login', data, {
    skipErrorToast: true,
  });
}

export function walletComplete(data: WalletCompleteParams) {
  return request.post<never, { accessToken: string; userInfo: UserInfo }>('/auth/wallet/complete', data, {
    skipErrorToast: true,
  });
}

export function logout() {
  return request.post('/auth/logout');
}

export function getProfile() {
  return request.get<never, import('@/api/user').UserItem>('/auth/me');
}

export function updateProfile(data: { nickname?: string }) {
  return request.put<never, import('@/api/user').UserItem>('/auth/profile', data);
}

export function changePassword(data: { oldPassword: string; newPassword: string }) {
  return request.put('/auth/password', data);
}
