import request from '@/utils/request';
import { useAuthStore } from '@/stores/useAuthStore';
import { parseJwtPayload, parseJwtPermissions } from '@/utils/jwt';

let inflight: Promise<boolean> | null = null;

/**
 * 用 Refresh Cookie 换新 Access Token。
 * 关浏览器后再打开时 session 已空，只要 Cookie 未过期即可直接进后台。
 */
export function restoreSession(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    const store = useAuthStore.getState();
    if (store.accessToken) {
      if (!store.userInfo) {
        const payload = parseJwtPayload(store.accessToken);
        store.setUserInfo({
          id: payload?.sub ?? 0,
          username: payload?.username ?? '',
          permissions: parseJwtPermissions(store.accessToken),
        });
      }
      return true;
    }
    try {
      const data = (await request.post('/auth/refresh', null, {
        skipErrorToast: true,
        skipLoading: true,
      })) as { accessToken: string };
      const accessToken = data.accessToken;
      store.setAccessToken(accessToken);
      const payload = parseJwtPayload(accessToken);
      const permissions = parseJwtPermissions(accessToken);
      const prev = store.userInfo;
      store.setUserInfo({
        id: prev?.id ?? payload?.sub ?? 0,
        username: prev?.username ?? payload?.username ?? '',
        nickname: prev?.nickname,
        permissions,
      });
      return true;
    } catch {
      if (!useAuthStore.getState().accessToken) {
        useAuthStore.getState().logout();
      }
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
