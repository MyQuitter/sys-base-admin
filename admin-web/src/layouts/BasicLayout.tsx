import {
  BellOutlined,
  DashboardOutlined,
  DownOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  QuestionCircleOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar, Button, Dropdown, Input, Layout, Menu, Tabs, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { PageLoadingBar } from '@/components/PageLoadingBar';
import { MessageBell } from '@/components/MessageBell';
import { MessageDetailDrawer } from '@/components/MessageDetailDrawer';
import { MessagePopup } from '@/components/MessagePopup';
import { logout } from '@/api/auth';
import type { MenuTreeNode } from '@/api/menu';
import { useSiteStore } from '@/stores/useSiteStore';
import { withCacheBust } from '@/utils/branding';
import { parseJwtPermissions } from '@/utils/jwt';
import request from '@/utils/request';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMenuStore } from '@/stores/useMenuStore';
import { useMessageStore } from '@/stores/useMessageStore';
import { useTabStore } from '@/stores/useTabStore';
import { findMenuOpenKeys, getPageTitle, isPathAllowed, resolveLandingPath } from '@/utils/menu';
import { renderMenuIcon } from '@/utils/menuIcon';
import './layout.css';

const { Content } = Layout;

const SIDER_COLLAPSED_KEY = 'pro-sider-collapsed';

/**
 * 将后端菜单树转换为 Ant Design Menu 的 items 配置。
 */
function toMenuItems(nodes: MenuTreeNode[]): MenuProps['items'] {
  return nodes.map((node) => ({
    key: node.path ?? `group-${node.id}`,
    icon: renderMenuIcon(node.icon),
    label: node.name,
    children: node.children?.length ? toMenuItems(node.children) : undefined,
  }));
}

/**
 * 顶栏横向菜单：与侧栏同源，便于在大屏下快速切换一级模块。
 */
function toTopMenuItems(nodes: MenuTreeNode[]): MenuProps['items'] {
  return nodes.map((node) => ({
    key: node.path ?? `group-${node.id}`,
    label: node.name,
    children: node.children?.length ? toTopMenuItems(node.children) : undefined,
  }));
}

/**
 * Pro 风格管理后台布局：顶栏 + 侧栏 + 多标签页 + 内容区。
 * 整体固定为一屏高度（100vh），仅侧栏菜单与主内容区内部出现滚动条。
 */
export default function BasicLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const userInfo = useAuthStore((s) => s.userInfo);
  const logoutStore = useAuthStore((s) => s.logout);
  const menus = useMenuStore((s) => s.menus);
  const menusLoaded = useMenuStore((s) => s.loaded);
  const fetchMenus = useMenuStore((s) => s.fetchMenus);
  const resetMenus = useMenuStore((s) => s.reset);
  const tabs = useTabStore((s) => s.tabs);
  const activeKey = useTabStore((s) => s.activeKey);
  const openTab = useTabStore((s) => s.openTab);
  const closeTab = useTabStore((s) => s.closeTab);
  const closeLeftTabs = useTabStore((s) => s.closeLeftTabs);
  const closeRightTabs = useTabStore((s) => s.closeRightTabs);
  const closeOtherTabs = useTabStore((s) => s.closeOtherTabs);
  const closeAllTabs = useTabStore((s) => s.closeAllTabs);
  const setActiveKey = useTabStore((s) => s.setActiveKey);
  const resetTabs = useTabStore((s) => s.reset);
  const syncTabLabels = useTabStore((s) => s.syncTabLabels);
  const dropUnauthorizedTabs = useTabStore((s) => s.dropUnauthorizedTabs);
  const siteName = useSiteStore((s) => s.siteName);
  const siteSubtitle = useSiteStore((s) => s.siteSubtitle);
  const logoUrl = useSiteStore((s) => s.logoUrl);
  const startMessagePolling = useMessageStore((s) => s.startPolling);
  const stopMessagePolling = useMessageStore((s) => s.stopPolling);
  const resetMessages = useMessageStore((s) => s.reset);

  const [openKeys, setOpenKeys] = useState<string[]>([]);
  const [messageDrawerOpen, setMessageDrawerOpen] = useState(false);
  const [activeMessageId, setActiveMessageId] = useState<number>();
  const [siderCollapsed, setSiderCollapsed] = useState(
    () => localStorage.getItem(SIDER_COLLAPSED_KEY) === '1',
  );

  useEffect(() => {
    fetchMenus().catch(() => undefined);
  }, [fetchMenus]);

  // 未分配的工作台等页面：从标签里去掉，并跳到第一个可见菜单
  useEffect(() => {
    if (!menusLoaded) return;
    const landing = resolveLandingPath(menus);
    dropUnauthorizedTabs((path) => isPathAllowed(menus, path), landing);
    if (!isPathAllowed(menus, location.pathname) && landing && landing !== location.pathname) {
      navigate(landing, { replace: true });
    }
  }, [menusLoaded, menus, location.pathname, navigate, dropUnauthorizedTabs]);

  // 菜单加载后同步标签标题（处理菜单重命名与 localStorage 缓存旧名）
  useEffect(() => {
    if (!menus.length) return;
    syncTabLabels((path) => getPageTitle(menus, path));
  }, [menus, syncTabLabels]);

  useEffect(() => {
    startMessagePolling();
    return () => stopMessagePolling();
  }, [startMessagePolling, stopMessagePolling]);

  // 进入后台时刷新 Token，同步数据库中最新的权限码（如新增 file:* 后无需重新登录）
  useEffect(() => {
    const syncPermissions = async () => {
      try {
        const data = (await request.post('/auth/refresh', null, { skipLoading: true })) as {
          accessToken: string;
        };
        const accessToken = data.accessToken;
        useAuthStore.getState().setAccessToken(accessToken);
        const userInfo = useAuthStore.getState().userInfo;
        if (userInfo) {
          const permissions = parseJwtPermissions(accessToken);
          useAuthStore.getState().setUserInfo({ ...userInfo, permissions });
        }
      } catch {
        // Cookie 失效时由后续 API 401 跳转登录
      }
    };
    syncPermissions();
  }, []);

  // 路由变化时同步标签页（浏览器前进/后退、编程式导航）
  useEffect(() => {
    const path = location.pathname;
    const title = getPageTitle(menus, path);
    openTab(path, title);
    setOpenKeys(findMenuOpenKeys(menus, path));
  }, [location.pathname, menus, openTab]);

  const sideMenuItems = useMemo<MenuProps['items']>(() => {
    if (menus.length) return toMenuItems(menus);
    if (menusLoaded) return [];
    return [{ key: '/dashboard', icon: <DashboardOutlined />, label: '工作台' }];
  }, [menus, menusLoaded]);

  const topMenuItems = useMemo<MenuProps['items']>(() => {
    if (menus.length) return toTopMenuItems(menus);
    if (menusLoaded) return [];
    return [{ key: '/dashboard', label: '首页' }];
  }, [menus, menusLoaded]);

  const selectedKey = useMemo(() => {
    const matched = findMenuOpenKeys(menus, location.pathname);
    return matched.length ? [matched[matched.length - 1]] : [location.pathname];
  }, [location.pathname, menus]);

  const navigateByKey = (key: string) => {
    if (!key.startsWith('/')) return;
    const title = getPageTitle(menus, key);
    openTab(key, title);
    navigate(key);
  };

  const activeTabIndex = useMemo(
    () => tabs.findIndex((t) => t.key === activeKey),
    [tabs, activeKey],
  );

  const hasClosableLeft = useMemo(
    () => tabs.slice(0, activeTabIndex).some((t) => t.closable),
    [tabs, activeTabIndex],
  );

  const hasClosableRight = useMemo(
    () => tabs.slice(activeTabIndex + 1).some((t) => t.closable),
    [tabs, activeTabIndex],
  );

  const hasClosableOthers = useMemo(
    () => tabs.some((t) => t.closable && t.key !== activeKey),
    [tabs, activeKey],
  );

  const handleTabBatchAction = (action: 'left' | 'right' | 'other' | 'all') => {
    const nextKey =
      action === 'left'
        ? closeLeftTabs()
        : action === 'right'
          ? closeRightTabs()
          : action === 'other'
            ? closeOtherTabs()
            : closeAllTabs();
    if (nextKey && nextKey !== location.pathname) {
      navigate(nextKey);
    }
  };

  const tabActionMenu: MenuProps = {
    items: [
      {
        key: 'close-left',
        label: '关闭左侧',
        disabled: !hasClosableLeft,
        onClick: () => handleTabBatchAction('left'),
      },
      {
        key: 'close-right',
        label: '关闭右侧',
        disabled: !hasClosableRight,
        onClick: () => handleTabBatchAction('right'),
      },
      {
        key: 'close-other',
        label: '关闭其他',
        disabled: !hasClosableOthers,
        onClick: () => handleTabBatchAction('other'),
      },
      { type: 'divider' },
      {
        key: 'close-all',
        label: '关闭全部',
        disabled: !hasClosableOthers,
        onClick: () => handleTabBatchAction('all'),
      },
    ],
  };

  /** 最近访问：取除首页外最近打开的标签（最多 3 条） */
  const recentTabs = useMemo(
    () => [...tabs].filter((t) => t.key !== '/dashboard').slice(-3).reverse(),
    [tabs],
  );

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      logoutStore();
      resetMenus();
      resetTabs();
      resetMessages();
      navigate('/login', { replace: true });
    }
  };

  const appTitle = siteName;
  const logoPreviewUrl = withCacheBust(logoUrl);

  const toggleSider = () => {
    setSiderCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(SIDER_COLLAPSED_KEY, next ? '1' : '0');
      return next;
    });
  };

  return (
    <Layout className={`pro-layout${siderCollapsed ? ' sider-collapsed' : ''}`}>
      <PageLoadingBar />
      <header className="pro-header">
        <div className="pro-header-brand">
          {logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt="logo" className="pro-header-logo-image" />
          ) : (
            <div className="pro-header-logo">{appTitle.slice(0, 1)}</div>
          )}
          <div className="pro-header-title">
            <div className="pro-header-title-main">{appTitle}</div>
            <div className="pro-header-title-sub">{siteSubtitle}</div>
          </div>
        </div>
        <Button
            type="text"
            className={`pro-header-sider-toggle${siderCollapsed ? ' is-collapsed' : ''}`}
            icon={<MenuFoldOutlined />}
            onClick={toggleSider}
            aria-label={siderCollapsed ? '展开侧边栏' : '收起侧边栏'}
          />
        <Menu
          className="pro-header-nav"
          mode="horizontal"
          selectedKeys={selectedKey}
          items={topMenuItems}
          onClick={({ key }) => navigateByKey(key)}
        />

        <div className="pro-header-right">
          <Input
            className="pro-header-search"
            placeholder="搜索功能"
            prefix={<SearchOutlined style={{ color: '#bfbfbf' }} />}
            allowClear
          />
          <MessageBell
            onOpenMessage={(item) => {
              setActiveMessageId(item.id);
              setMessageDrawerOpen(true);
            }}
          />
          <Dropdown
            menu={{
              items: [
                {
                  key: 'profile',
                  icon: <UserOutlined />,
                  label: '个人中心',
                  onClick: () => navigateByKey('/profile'),
                },
                {
                  key: 'messages',
                  icon: <BellOutlined />,
                  label: '我的消息',
                  onClick: () => navigateByKey('/profile/messages'),
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  icon: <LogoutOutlined />,
                  label: '退出登录',
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <div className="pro-header-user">
              <Avatar size={32} style={{ background: '#1677ff' }}>
                {(userInfo?.nickname ?? userInfo?.username ?? 'U').slice(0, 1)}
              </Avatar>
              <Typography.Text>{userInfo?.nickname ?? userInfo?.username ?? '用户'}</Typography.Text>
            </div>
          </Dropdown>
        </div>
      </header>

      <div className="pro-body">
        <aside className={`pro-sider${siderCollapsed ? ' collapsed' : ''}`}>
          <div className="pro-sider-inner">
            <div className="pro-sider-menu-wrap">
              <Menu
                className="pro-sider-menu"
                mode="inline"
                selectedKeys={selectedKey}
                openKeys={openKeys}
                onOpenChange={setOpenKeys}
                items={sideMenuItems}
                onClick={({ key }) => navigateByKey(key)}
              />
            </div>
          <div className="pro-sider-footer">
            {recentTabs.length > 0 && (
              <>
                <div className="pro-sider-recent-title">最近访问</div>
                {recentTabs.map((tab) => (
                  <div
                    key={tab.key}
                    className="pro-sider-recent-item"
                    onClick={() => navigateByKey(tab.key)}
                  >
                    {tab.label}
                  </div>
                ))}
              </>
            )}
            <Button type="primary" block className="pro-sider-help" icon={<QuestionCircleOutlined />}>
              帮助中心
            </Button>
          </div>
          </div>
        </aside>

        <div className="pro-main">
          <Tabs
            className="pro-tabs"
            type="editable-card"
            hideAdd
            activeKey={activeKey}
            tabBarExtraContent={
              <Dropdown menu={tabActionMenu} trigger={['click']}>
                <Button type="text" className="pro-tab-actions" size="small">
                  标签操作
                  <DownOutlined style={{ fontSize: 10, marginLeft: 4 }} />
                </Button>
              </Dropdown>
            }
            onChange={(key) => {
              setActiveKey(key);
              navigate(key);
            }}
            onEdit={(targetKey, action) => {
              if (action === 'remove' && typeof targetKey === 'string') {
                const next = closeTab(targetKey);
                navigate(next);
              }
            }}
            items={tabs.map((tab) => ({
              key: tab.key,
              label: tab.label,
              closable: tab.closable,
            }))}
          />
          <Content className="pro-content">
            <Outlet />
          </Content>
        </div>
      </div>
      <MessagePopup />
      <MessageDetailDrawer
        open={messageDrawerOpen}
        messageId={activeMessageId}
        onClose={() => setMessageDrawerOpen(false)}
      />
    </Layout>
  );
}
