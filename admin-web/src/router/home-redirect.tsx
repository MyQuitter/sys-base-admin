import { Spin } from 'antd';
import { Navigate } from 'react-router-dom';
import { useMenuStore } from '@/stores/useMenuStore';
import { resolveLandingPath } from '@/utils/menu';

/**
 * 根路径：进入当前用户可见菜单的第一项，未勾选工作台时不会落到 /dashboard。
 */
export function HomeRedirect() {
  const loaded = useMenuStore((s) => s.loaded);
  const menus = useMenuStore((s) => s.menus);

  if (!loaded) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin />
      </div>
    );
  }

  return <Navigate to={resolveLandingPath(menus)} replace />;
}
