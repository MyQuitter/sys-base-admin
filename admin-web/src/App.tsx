import { App as AntdApp, ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useEffect, type ReactNode } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/router';
import { useSiteStore } from '@/stores/useSiteStore';
import { setMessageApi } from '@/utils/toast';

/** 把 App.useApp().message 绑定到全局 toast，供 axios / 非组件代码使用 */
function MessageApiBinder({ children }: { children: ReactNode }) {
  const { message } = AntdApp.useApp();
  useEffect(() => {
    setMessageApi(message);
  }, [message]);
  return children;
}

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
      <AntdApp>
        <MessageApiBinder>
          <RouterProvider router={router} />
        </MessageApiBinder>
      </AntdApp>
    </ConfigProvider>
  );
}
