import { Spin } from 'antd';
import { useEffect, useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';
import { restoreSession } from '@/utils/restore-session';

/**
 * 路由守卫：无 Access Token 时先尝试 Refresh Cookie 续期，失败再去登录页。
 */
export function AuthGuard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();
  const [checking, setChecking] = useState(!accessToken);

  useEffect(() => {
    if (accessToken) {
      setChecking(false);
      return;
    }
    let cancelled = false;
    void restoreSession().then((ok) => {
      if (!cancelled) setChecking(false);
      void ok;
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  if (checking) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40vh' }}>
        <Spin />
      </div>
    );
  }

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
