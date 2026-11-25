import { create } from 'zustand';
import type { UserInfo } from '@/types/api';

const ACCESS_TOKEN_KEY = 'accessToken';
const USER_INFO_KEY = 'userInfo';

function readPersisted(key: string): string | null {
  return localStorage.getItem(key) ?? sessionStorage.getItem(key);
}

function persist(key: string, value: string) {
  localStorage.setItem(key, value);
  sessionStorage.removeItem(key);
}

function clearPersisted(key: string) {
  localStorage.removeItem(key);
  sessionStorage.removeItem(key);
}

/**
 * 从 localStorage（兼容旧版 sessionStorage）恢复用户信息。
 * 解析失败时返回 null，避免脏数据导致白屏。
 */
function loadUserInfo(): UserInfo | null {
  const raw = readPersisted(USER_INFO_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserInfo;
  } catch {
    return null;
  }
}

interface AuthState {
  /** 当前 Access Token，与 localStorage 同步 */
  accessToken: string | null;
  /** 登录用户信息与权限码列表 */
  userInfo: UserInfo | null;
  /** 登录成功后写入 Token 与用户信息 */
  setAuth: (accessToken: string, userInfo: UserInfo) => void;
  /** Token 刷新后仅更新 Access Token */
  setAccessToken: (accessToken: string) => void;
  /** 更新用户信息（含权限），与 localStorage 同步 */
  setUserInfo: (userInfo: UserInfo) => void;
  /** 清空认证状态（登出或刷新失败） */
  logout: () => void;
  /** 判断当前用户是否拥有指定权限码 */
  hasPermission: (permission: string) => boolean;
}

/**
 * 认证全局状态：Access Token 存 localStorage（关浏览器仍保留）；
 * Refresh Token 由 HttpOnly Cookie 管理，过期前可自动续 Access Token。
 */
export const useAuthStore = create<AuthState>((set, get) => ({
  accessToken: readPersisted(ACCESS_TOKEN_KEY),
  userInfo: loadUserInfo(),
  setAuth: (accessToken, userInfo) => {
    persist(ACCESS_TOKEN_KEY, accessToken);
    persist(USER_INFO_KEY, JSON.stringify(userInfo));
    set({ accessToken, userInfo });
  },
  setAccessToken: (accessToken) => {
    persist(ACCESS_TOKEN_KEY, accessToken);
    set({ accessToken });
  },
  setUserInfo: (userInfo) => {
    persist(USER_INFO_KEY, JSON.stringify(userInfo));
    set({ userInfo });
  },
  logout: () => {
    clearPersisted(ACCESS_TOKEN_KEY);
    clearPersisted(USER_INFO_KEY);
    set({ accessToken: null, userInfo: null });
  },
  hasPermission: (permission) => {
    const permissions = get().userInfo?.permissions ?? [];
    return permissions.includes(permission);
  },
}));
