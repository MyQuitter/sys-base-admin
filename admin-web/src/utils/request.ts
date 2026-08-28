import axios from 'axios';
import { toast } from '@/utils/toast';
import { useAuthStore } from '@/stores/useAuthStore';
import { parseJwtPermissions } from '@/utils/jwt';
import { useLoadingStore } from '@/stores/useLoadingStore';

declare module 'axios' {
  interface AxiosRequestConfig {
    /** 为 true 时不触发顶栏加载进度 */
    skipLoading?: boolean;
    /** 为 true 时不弹出全局错误 toast（由调用方自行处理） */
    skipErrorToast?: boolean;
  }
}

/** 是否计入顶栏加载进度 */
function shouldTrackLoading(url?: string, skipLoading?: boolean) {
  if (skipLoading) return false;
  if (!url) return true;
  return !url.includes('/auth/refresh');
}

const { start: startLoading, done: doneLoading } = useLoadingStore.getState();

/** 登录相关公开接口的 401 表示凭证错误，不应触发 Token 刷新 */
function isPublicAuthRequest(url?: string) {
  if (!url) return false;
  return (
    url.includes('/auth/login') ||
    url.includes('/auth/wallet/login') ||
    url.includes('/auth/wallet/complete') ||
    url.includes('/auth/wallet/nonce') ||
    url.includes('/app/auth/login') ||
    url.includes('/app/auth/register') ||
    url.includes('/app/auth/refresh')
  );
}

/** 是否正在刷新 Token，避免并发 401 重复请求 refresh */
let isRefreshing = false;
/** 刷新期间挂起的请求队列，拿到新 Token 后依次重试 */
let refreshQueue: Array<(token: string) => void> = [];

/**
 * 全局 Axios 实例：统一 baseURL、凭证、响应解包与 401 自动刷新。
 * Refresh Token 通过 Cookie 自动携带，前端不读写。
 */
const request = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  timeout: 15000,
  withCredentials: true,
});

request.interceptors.request.use((config) => {
  if (shouldTrackLoading(config.url, config.skipLoading)) {
    startLoading();
  }
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

request.interceptors.response.use(
  (res) => {
    if (shouldTrackLoading(res.config.url, res.config.skipLoading)) {
      doneLoading();
    }
    const { code, data, message: msg } = res.data;
    if (code === 200) return data;
    toast.error(msg ?? '请求失败');
    return Promise.reject(new Error(msg));
  },
  async (error) => {
    const original = error.config;
    if (original && shouldTrackLoading(original.url, original.skipLoading)) {
      doneLoading();
    }
    // 401 且非 refresh / 登录接口：尝试用 Cookie 刷新 Access Token 后重试原请求
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/refresh') &&
      !isPublicAuthRequest(original.url)
    ) {
      if (isRefreshing) {
        return new Promise((resolve) => {
          refreshQueue.push((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            resolve(request(original));
          });
        });
      }

      original._retry = true;
      isRefreshing = true;
      try {
        const data = (await request.post('/auth/refresh')) as { accessToken: string };
        const accessToken = data.accessToken;
        useAuthStore.getState().setAccessToken(accessToken);
        const userInfo = useAuthStore.getState().userInfo;
        if (userInfo) {
          const permissions = parseJwtPermissions(accessToken);
          useAuthStore.getState().setUserInfo({ ...userInfo, permissions });
        }
        refreshQueue.forEach((cb) => cb(accessToken));
        refreshQueue = [];
        original.headers.Authorization = `Bearer ${accessToken}`;
        return request(original);
      } catch {
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    const msg =
      error.response?.data?.message ??
      (error.code === 'ECONNABORTED' ? '请求超时，请稍后重试' : null) ??
      error.message ??
      '网络异常';
    if (!original?.skipErrorToast) {
      toast.error(msg);
    }
    return Promise.reject(new Error(msg));
  },
);

export default request;
