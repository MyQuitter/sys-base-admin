import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { useSiteStore } from '@/stores/useSiteStore';

export default function App() {
  const fetchSiteSetting = useSiteStore((s) => s.fetchSiteSetting);

  useEffect(() => {
    fetchSiteSetting().catch(() => undefined);
  }, [fetchSiteSetting]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#1677ff',
          borderRadius: 8,
          colorBgLayout: '#f0f4fa',
        },
        components: {
          Menu: {
            itemBorderRadius: 8,
            subMenuItemBorderRadius: 8,
          },
          Card: {
            borderRadiusLG: 12,
          },
        },
      }}
    >
      <RouterProvider router={router} />
    </ConfigProvider>
  );
}
