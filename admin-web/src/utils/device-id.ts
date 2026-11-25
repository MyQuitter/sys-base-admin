import { useAuthStore } from '@/stores/useAuthStore';

const STORAGE_KEY = 'admin_device_id';

/**
 * 获取或创建浏览器设备标识（UUID），持久化在 localStorage。
 * 与后端 JWT.did / X-Device-Id 绑定，防止 Token 被换到其他浏览器直接使用。
 */
export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY)?.trim();
    if (existing && isUuid(existing)) return existing;
  } catch {
    // 隐私模式等读失败时走下方新建
  }

  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : fallbackUuid();

  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 写失败仍返回本次会话可用的 id
  }
  return id;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function fallbackUuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const n = (Math.random() * 16) | 0;
    const v = ch === 'x' ? n : (n & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * 裸 axios 下载/导出用的鉴权头：Bearer + 设备绑定。
 */
export function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'X-Device-Id': getOrCreateDeviceId(),
  };
  const token = useAuthStore.getState().accessToken;
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}
