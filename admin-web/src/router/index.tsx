import { Spin } from 'antd';
import { lazy, Suspense } from 'react';
import { Navigate, createBrowserRouter } from 'react-router-dom';
import BasicLayout from '@/layouts/BasicLayout';
import { AuthGuard } from '@/router/guard';

const LoginPage = lazy(() => import('@/pages/login'));
const DashboardPage = lazy(() => import('@/pages/dashboard'));
const MemberListPage = lazy(() => import('@/pages/member/list'));
const BlockchainChainPage = lazy(() => import('@/pages/blockchain/chain'));
const BlockchainContractPage = lazy(() => import('@/pages/blockchain/contract'));
const BlockchainTransactionPage = lazy(() => import('@/pages/blockchain/transaction'));
const BlockchainEventSubscriptionPage = lazy(() => import('@/pages/blockchain/event-subscription'));
const BlockchainEventLogPage = lazy(() => import('@/pages/blockchain/event-log'));
const CrmWlConfigPage = lazy(() => import('@/pages/crm-whitelist/config'));
const CrmWlTraderPage = lazy(() => import('@/pages/crm-whitelist/trader'));
const CrmWlNodePage = lazy(() => import('@/pages/crm-whitelist/node'));
const CrmTeamPage = lazy(() => import('@/pages/crm-whitelist/team'));
const CrmWlDashboardPage = lazy(() => import('@/pages/crm-whitelist/dashboard'));
const UserListPage = lazy(() => import('@/pages/system/user'));
const RoleListPage = lazy(() => import('@/pages/system/role'));
const PermissionListPage = lazy(() => import('@/pages/system/permission'));
const MenuListPage = lazy(() => import('@/pages/system/menu'));
const DictListPage = lazy(() => import('@/pages/system/dict'));
const NoticeListPage = lazy(() => import('@/pages/system/notice'));
const FileManagePage = lazy(() => import('@/pages/system/file'));
const SystemSettingsPage = lazy(() => import('@/pages/system/settings'));
const DepartmentPage = lazy(() => import('@/pages/org/department'));
const PositionListPage = lazy(() => import('@/pages/org/position'));
const ProfilePage = lazy(() => import('@/pages/profile'));
const MyMessagesPage = lazy(() => import('@/pages/profile/messages'));
const OperationLogPage = lazy(() => import('@/pages/monitor/operation-log'));
const LoginLogPage = lazy(() => import('@/pages/monitor/login-log'));
const ProtectionLogPage = lazy(() => import('@/pages/monitor/protection-log'));
const OnlineUsersPage = lazy(() => import('@/pages/monitor/online'));
const SystemMonitorPage = lazy(() => import('@/pages/monitor/system'));

const suspense = (node: React.ReactNode) => <Suspense fallback={<Spin />}>{node}</Suspense>;

/**
 * 应用路由表：登录页公开；业务页经 AuthGuard + BasicLayout 嵌套。
 */
export const router = createBrowserRouter([
  { path: '/login', element: suspense(<LoginPage />) },
  {
    path: '/',
    element: <AuthGuard />,
    children: [
      {
        element: <BasicLayout />,
        children: [
          { index: true, element: <Navigate to="/dashboard" replace /> },
          { path: 'dashboard', element: suspense(<DashboardPage />) },
          { path: 'member/list', element: suspense(<MemberListPage />) },
          { path: 'blockchain/chain', element: suspense(<BlockchainChainPage />) },
          { path: 'blockchain/contract', element: suspense(<BlockchainContractPage />) },
          { path: 'blockchain/transaction', element: suspense(<BlockchainTransactionPage />) },
          { path: 'blockchain/event-subscription', element: suspense(<BlockchainEventSubscriptionPage />) },
          { path: 'blockchain/event-log', element: suspense(<BlockchainEventLogPage />) },
          { path: 'crm-whitelist/panel', element: suspense(<CrmWlDashboardPage />) },
          { path: 'crm-whitelist/config', element: suspense(<CrmWlConfigPage />) },
          { path: 'crm-whitelist/trader', element: suspense(<CrmWlTraderPage />) },
          { path: 'crm-whitelist/node', element: suspense(<CrmWlNodePage />) },
          { path: 'crm-whitelist/team', element: suspense(<CrmTeamPage />) },
          // 兼容旧菜单 path，避免点进 /crm-whitelist/dashboard 被通配打回首页
          { path: 'crm-whitelist/dashboard', element: <Navigate to="/crm-whitelist/panel" replace /> },
          { path: 'org/department', element: suspense(<DepartmentPage />) },
          { path: 'org/position', element: suspense(<PositionListPage />) },
          { path: 'system/user', element: suspense(<UserListPage />) },
          { path: 'system/role', element: suspense(<RoleListPage />) },
          { path: 'system/permission', element: suspense(<PermissionListPage />) },
          { path: 'system/menu', element: suspense(<MenuListPage />) },
          { path: 'system/dict', element: suspense(<DictListPage />) },
          { path: 'system/notice', element: suspense(<NoticeListPage />) },
          { path: 'system/file', element: suspense(<FileManagePage />) },
          { path: 'system/settings', element: suspense(<SystemSettingsPage />) },
          { path: 'monitor/operation-log', element: suspense(<OperationLogPage />) },
          { path: 'monitor/login-log', element: suspense(<LoginLogPage />) },
          { path: 'monitor/protection-log', element: suspense(<ProtectionLogPage />) },
          { path: 'monitor/online', element: suspense(<OnlineUsersPage />) },
          { path: 'monitor/system', element: suspense(<SystemMonitorPage />) },
          { path: 'profile', element: suspense(<ProfilePage />) },
          { path: 'profile/messages', element: suspense(<MyMessagesPage />) },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
