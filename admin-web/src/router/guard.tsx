import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/useAuthStore';

/**
 * 路由守卫：无 Access Token 时重定向登录页，并记录来源路径供登录后跳回。
 */
export function AuthGuard() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const location = useLocation();

  if (!accessToken) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
}
