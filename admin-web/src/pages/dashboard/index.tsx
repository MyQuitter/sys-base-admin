import {
  ApartmentOutlined,
  AuditOutlined,
  ClusterOutlined,
  FileTextOutlined,
  IdcardOutlined,
  MenuOutlined,
  SafetyOutlined,
  TeamOutlined,
  UserOutlined,
  UsergroupAddOutlined,
  BlockOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { Avatar, Card, Col, Empty, Row, Skeleton, Tag, Typography } from 'antd';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getDashboardOverview, type DashboardOverview } from '@/api/dashboard';
import type { MenuTreeNode } from '@/api/menu';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMenuStore } from '@/stores/useMenuStore';
import { useTabStore } from '@/stores/useTabStore';
import { flattenMenuLinks, formatUptime, getGreeting } from '@/utils/dashboard';
import { formatDateTime } from '@/utils/format';
import { renderMenuIcon } from '@/utils/menuIcon';
import './dashboard.css';

interface StatCardConfig {
  key: keyof DashboardOverview['stats'];
  label: string;
  icon: React.ReactNode;
  color: string;
  path?: string;
  permission?: string;
}

const statCards: StatCardConfig[] = [
  { key: 'users', label: '系统用户', icon: <UserOutlined />, color: 'blue', path: '/system/user', permission: 'user:list' },
  { key: 'members', label: '会员用户', icon: <UsergroupAddOutlined />, color: 'geekblue', path: '/member/list', permission: 'member:list' },
  { key: 'enabledChains', label: '启用链', icon: <BlockOutlined />, color: 'volcano', path: '/blockchain/chain', permission: 'chain:list' },
  { key: 'pendingTransactions', label: '待确认交易', icon: <BlockOutlined />, color: 'gold', path: '/blockchain/transaction', permission: 'tx:list' },
  { key: 'roles', label: '角色数量', icon: <TeamOutlined />, color: 'green', path: '/system/role', permission: 'role:list' },
  { key: 'departments', label: '部门数量', icon: <ClusterOutlined />, color: 'orange', path: '/org/department', permission: 'department:list' },
  { key: 'onlineUsers', label: '在线用户', icon: <IdcardOutlined />, color: 'purple', path: '/monitor/online', permission: 'monitor:online' },
  { key: 'todayOperations', label: '今日操作', icon: <AuditOutlined />, color: 'cyan', path: '/monitor/operation-log', permission: 'log:operation' },
  { key: 'todayLoginFailures', label: '今日登录失败', icon: <WarningOutlined />, color: 'red', path: '/monitor/login-log', permission: 'log:login' },
];

/**
 * 工作台首页：聚合统计、快捷入口、公告与最近访问。
 */
export default function DashboardPage() {
  const navigate = useNavigate();
  const userInfo = useAuthStore((s) => s.userInfo);
  const hasPermission = useAuthStore((s) => s.hasPermission);
  const menus = useMenuStore((s) => s.menus);
  const tabs = useTabStore((s) => s.tabs);
  const openTab = useTabStore((s) => s.openTab);

  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);

  const displayName = userInfo?.nickname ?? userInfo?.username ?? '管理员';
  const appTitle = import.meta.env.VITE_APP_TITLE ?? '基础管理系统';

  const quickLinks = useMemo(() => flattenMenuLinks(menus, 8), [menus]);

  const recentTabs = useMemo(
    () => [...tabs].filter((t) => t.key !== '/dashboard').slice(-4).reverse(),
    [tabs],
  );

  const visibleStats = useMemo(
    () => statCards.filter((s) => !s.permission || hasPermission(s.permission)),
    [hasPermission],
  );

  const loadOverview = async () => {
    try {
      const data = await getDashboardOverview();
      setOverview(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
    const timer = setInterval(loadOverview, 60000);
    return () => clearInterval(timer);
  }, []);

  const navigateTo = (path: string, label?: string) => {
    if (label) openTab(path, label);
    navigate(path);
  };

  const handleQuickLink = (node: MenuTreeNode) => {
    if (!node.path) return;
    navigateTo(node.path, node.name);
  };

  return (
    <div className="dashboard-page">
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={16}>
          <div className="dashboard-hero">
            <h2 className="dashboard-hero-title">
              {getGreeting()}，{displayName}
            </h2>
            <p className="dashboard-hero-desc">
              欢迎使用 {appTitle}。系统运行 {overview ? formatUptime(overview.system.uptime) : '—'}，
              当前状态{' '}
              <Tag color={overview?.system.status === 'ok' ? 'success' : 'warning'} style={{ marginLeft: 4 }}>
                {overview?.system.status === 'ok' ? '正常' : '降级'}
              </Tag>
            </p>
          </div>
        </Col>
        <Col xs={24} lg={8}>
          <Card className="dashboard-user-card" variant="borderless">
            <Avatar size={64} style={{ background: '#1677ff', fontSize: 28, flexShrink: 0 }}>
              {displayName.slice(0, 1)}
            </Avatar>
            <div className="dashboard-user-meta">
              <Typography.Title level={5} style={{ margin: 0 }}>
                {displayName}
              </Typography.Title>
              <Typography.Text type="secondary">@{userInfo?.username}</Typography.Text>
              <Typography.Text type="secondary" className="dashboard-user-extra">
                权限点 {userInfo?.permissions.length ?? 0} 个
              </Typography.Text>
              <Typography.Text type="secondary" className="dashboard-user-extra">
                上次登录：
                {overview?.lastLogin
                  ? `${formatDateTime(overview.lastLogin.createdAt)}${overview.lastLogin.ip ? ` · ${overview.lastLogin.ip}` : ''}`
                  : '暂无记录'}
              </Typography.Text>
            </div>
          </Card>
        </Col>
      </Row>

      <div className="dashboard-section-title" style={{ marginTop: 20 }}>
        数据概览
      </div>
      <Row gutter={[16, 16]}>
        {visibleStats.map((stat) => (
          <Col xs={12} sm={8} lg={4} key={stat.key}>
            <Card
              className={`dashboard-stat-card clickable ${stat.color}`}
              variant="borderless"
              onClick={() => stat.path && navigateTo(stat.path, stat.label)}
            >
              {loading ? (
                <Skeleton active paragraph={false} />
              ) : (
                <>
                  <div className={`dashboard-stat-icon ${stat.color}`}>{stat.icon}</div>
                  <div className="dashboard-stat-value">{overview?.stats[stat.key] ?? 0}</div>
                  <div className="dashboard-stat-label">{stat.label}</div>
                </>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} lg={14}>
          <div className="dashboard-section-title">快捷入口</div>
          <Card variant="borderless" className="dashboard-panel">
            {quickLinks.length ? (
              <div className="dashboard-quick-grid">
                {quickLinks.map((node) => (
                  <div
                    key={node.id}
                    className="dashboard-quick-item"
                    onClick={() => handleQuickLink(node)}
                  >
                    <span className="dashboard-quick-icon">{renderMenuIcon(node.icon)}</span>
                    <span className="dashboard-quick-label">{node.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="暂无可用菜单" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={10}>
          <div className="dashboard-section-title">最新公告</div>
          <Card variant="borderless" className="dashboard-panel">
            {loading ? (
              <Skeleton active paragraph={{ rows: 4 }} />
            ) : overview?.recentNotices.length ? (
              overview.recentNotices.map((item) => (
                <div
                  key={item.id}
                  className="dashboard-announce-item clickable"
                  onClick={() => navigateTo('/system/notice', '系统公告')}
                >
                  <FileTextOutlined className="dashboard-announce-icon" />
                  <Typography.Text ellipsis className="dashboard-announce-title">
                    {item.title}
                  </Typography.Text>
                  <Typography.Text type="secondary" className="dashboard-announce-date">
                    {formatDateTime(item.publishTime ?? item.createdAt)}
                  </Typography.Text>
                </div>
              ))
            ) : (
              <Empty description="暂无已发布公告" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 8 }}>
        <Col xs={24} lg={12}>
          <div className="dashboard-section-title">最近访问</div>
          <Card variant="borderless" className="dashboard-panel">
            {recentTabs.length ? (
              recentTabs.map((tab) => (
                <div
                  key={tab.key}
                  className="dashboard-recent-item clickable"
                  onClick={() => navigateTo(tab.key, tab.label)}
                >
                  <MenuOutlined className="dashboard-recent-icon" />
                  <span>{tab.label}</span>
                  <Typography.Text type="secondary" className="dashboard-recent-path">
                    {tab.key}
                  </Typography.Text>
                </div>
              ))
            ) : (
              <Empty description="从左侧菜单打开页面后将显示在这里" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <div className="dashboard-section-title">模块统计</div>
          <Card variant="borderless" className="dashboard-panel">
            {loading ? (
              <Skeleton active paragraph={{ rows: 3 }} />
            ) : (
              <div className="dashboard-module-grid">
                <ModuleStat icon={<SafetyOutlined />} label="权限点" value={overview?.stats.permissions} />
                <ModuleStat icon={<MenuOutlined />} label="菜单项" value={overview?.stats.menus} />
                <ModuleStat icon={<ApartmentOutlined />} label="岗位" value={overview?.stats.positions} />
                <ModuleStat icon={<FileTextOutlined />} label="已发布公告" value={overview?.stats.publishedNotices} />
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}

function ModuleStat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
}) {
  return (
    <div className="dashboard-module-item">
      <span className="dashboard-module-icon">{icon}</span>
      <div>
        <div className="dashboard-module-value">{value ?? 0}</div>
        <div className="dashboard-module-label">{label}</div>
      </div>
    </div>
  );
}
