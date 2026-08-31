import { WalletOutlined, LockOutlined, UserOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Steps, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  getWalletNonce,
  isLoginTicketResult,
  login,
  walletComplete,
  walletLogin,
} from '@/api/auth';
import { useAuthStore } from '@/stores/useAuthStore';
import { useMenuStore } from '@/stores/useMenuStore';
import { useTabStore } from '@/stores/useTabStore';
import { useSiteStore } from '@/stores/useSiteStore';
import { withCacheBust } from '@/utils/branding';
import { resolveLandingPath } from '@/utils/menu';
import { connectWallet, ensureWalletChain, shortenAddress, signMessage } from '@/utils/wallet';
import './login.css';

type LoginErrorScope = 'password' | 'wallet';

interface LoginErrorState {
  scope: LoginErrorScope;
  title: string;
  message: string;
  detail?: string;
  errorCode?: string;
}

const LOGIN_ERROR_HINTS: Record<string, { title: string; hint?: string }> = {
  AUTH_FAILED: { title: '登录失败', hint: '请检查用户名与密码是否正确，或联系管理员确认账号状态。' },
  LOGIN_LOCKED: {
    title: '登录已临时锁定',
    hint: '连续登录失败次数过多，请稍后再试。',
  },
  WALLET_NOT_BOUND: { title: '钱包未绑定', hint: '该钱包地址未绑定任何后台账号，请联系管理员在系统用户页绑定。' },
  WALLET_NOT_BOUND_FOR_USER: {
    title: '账号未绑定钱包',
    hint: '该账号尚未绑定钱包，无法完成登录。请联系管理员绑定后再试。',
  },
  WALLET_ADDRESS_MISMATCH: {
    title: '钱包地址不一致',
    hint: '请在 MetaMask 中切换至账号绑定的钱包地址后重新签名。',
  },
  WALLET_USER_DISABLED: { title: '账号已禁用', hint: '该账号已被停用，请联系管理员。' },
  LOGIN_TICKET_INVALID: {
    title: '登录凭证已失效',
    hint: '密码验证已过期，请返回重新输入账户密码。',
  },
  WALLET_NONCE_INVALID: { title: '签名已过期', hint: '请重新点击连接钱包并签名。' },
  WALLET_SIGNATURE_INVALID: { title: '签名无效', hint: '请重新获取签名消息并完成签名。' },
  WALLET_CHAIN_MISMATCH: { title: '网络不正确', hint: '请在 MetaMask 中切换到系统要求的链后再试。' },
  WALLET_ADDRESS_INVALID: { title: '钱包地址无效', hint: '请确认已正确连接 MetaMask 并重试。' },
  LOGIN_MODE_WALLET_DISABLED: { title: '未启用钱包登录', hint: '当前系统未开放钱包登录，请使用账户密码。' },
  LOGIN_MODE_PASSWORD_DISABLED: { title: '未启用密码登录', hint: '当前系统仅支持钱包登录。' },
};

function getApiError(err: unknown) {
  const e = err as {
    response?: {
      data?: {
        message?: string;
        errorCode?: string;
        detail?: { retryAfterSeconds?: number; lockedUntil?: string; remainingAttempts?: number };
      };
    };
    message?: string;
    code?: number;
  };
  return {
    message: e.response?.data?.message ?? e.message ?? '操作失败',
    errorCode: e.response?.data?.errorCode,
    detail: e.response?.data?.detail,
    walletRejected: e.code === 4001,
  };
}

function formatRetryMinutes(seconds?: number) {
  if (!seconds || seconds <= 0) return undefined;
  return Math.max(1, Math.ceil(seconds / 60));
}

function resolveLoginError(
  err: unknown,
  scope: LoginErrorScope,
  walletChainName?: string,
): LoginErrorState {
  const { message: errMsg, errorCode, detail, walletRejected } = getApiError(err);

  if (walletRejected) {
    return {
      scope,
      title: scope === 'wallet' ? '已取消钱包操作' : '已取消',
      message: errMsg.includes('签名') || errMsg.toLowerCase().includes('sign')
        ? '您已取消签名，请重新连接钱包并完成签名。'
        : '您已取消钱包连接，请重新点击连接按钮。',
    };
  }

  if (errMsg.includes('未检测到钱包') || errMsg.includes('MetaMask')) {
    return {
      scope,
      title: '未检测到钱包',
      message: '请安装 MetaMask 浏览器扩展，或在支持注入钱包的浏览器中打开本页。',
    };
  }

  if (errorCode === 'LOGIN_LOCKED') {
    const minutes = formatRetryMinutes(detail?.retryAfterSeconds);
    const unlockHint = detail?.lockedUntil
      ? `预计解锁时间：${new Date(detail.lockedUntil).toLocaleString()}。`
      : undefined;
    return {
      scope,
      title: '登录已临时锁定',
      message: minutes
        ? `连续登录失败次数过多，请 ${minutes} 分钟后再试。`
        : errMsg,
      detail: unlockHint,
      errorCode,
    };
  }

  const mapped = errorCode ? LOGIN_ERROR_HINTS[errorCode] : undefined;
  let message = errMsg;
  if (mapped?.hint) {
    message = mapped.hint;
  }
  if (errorCode === 'WALLET_CHAIN_MISMATCH' && walletChainName) {
    message = `请在 MetaMask 中切换到 ${walletChainName} 网络后再试。`;
  }
  if (errorCode === 'AUTH_FAILED' && detail?.remainingAttempts !== undefined && detail.remainingAttempts > 0) {
    message = `${message} 还可尝试 ${detail.remainingAttempts} 次。`;
  }

  return {
    scope,
    title: mapped?.title ?? '登录失败',
    message,
    detail: mapped?.hint && errMsg !== message ? errMsg : undefined,
    errorCode,
  };
}

async function finishLogin(
  accessToken: string,
  userInfo: { id: number; username: string; nickname?: string; permissions: string[] },
  deps: {
    setAuth: ReturnType<typeof useAuthStore.getState>['setAuth'];
    resetTabs: () => void;
    fetchMenus: () => Promise<void>;
    navigate: ReturnType<typeof useNavigate>;
  },
) {
  deps.setAuth(accessToken, userInfo);
  deps.resetTabs();
  await deps.fetchMenus();
  const home = resolveLandingPath(useMenuStore.getState().menus);
  message.success('登录成功');
  deps.navigate(home, { replace: true });
}

/**
 * 登录页：按 loginMode 渲染密码 / 钱包 / 双重验证流程。
 */
export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const fetchMenus = useMenuStore((s) => s.fetchMenus);
  const resetTabs = useTabStore((s) => s.reset);
  const siteName = useSiteStore((s) => s.siteName);
  const logoUrl = useSiteStore((s) => s.logoUrl);
  const loginMode = useSiteStore((s) => s.loginMode);
  const walletChainId = useSiteStore((s) => s.walletChainId);
  const walletChainName = useSiteStore((s) => s.walletChainName);

  const [loading, setLoading] = useState(false);
  const [bothStep, setBothStep] = useState(0);
  const [loginTicket, setLoginTicket] = useState<string>();
  const [ticketExpiresAt, setTicketExpiresAt] = useState<string>();
  const [verifiedUsername, setVerifiedUsername] = useState<string>();
  const [boundWalletMasked, setBoundWalletMasked] = useState<string>();
  const [loginError, setLoginError] = useState<LoginErrorState>();
  const [walletMismatch, setWalletMismatch] = useState<{
    current: string;
    expected: string;
    detail?: string;
  }>();
  const logoPreviewUrl = withCacheBust(logoUrl);

  const handleAuthSuccess = async (accessToken: string, userInfo: Parameters<typeof setAuth>[1]) => {
    setLoginError(undefined);
    await finishLogin(accessToken, userInfo, { setAuth, resetTabs, fetchMenus, navigate });
  };

  const showLoginErrorAlert = (error: LoginErrorState) => {
    setLoginError(error);
    message.error(error.title);
  };

  const runWalletSignIn = async (options?: { loginTicket?: string }) => {
    setWalletMismatch(undefined);
    setLoginError(undefined);
    setLoading(true);
    let connectedAddress: string | undefined;
    try {
      const address = await connectWallet();
      connectedAddress = shortenAddress(address);
      await ensureWalletChain(walletChainId);
      const nonceRes = await getWalletNonce({
        chainId: walletChainId,
        address,
        loginTicket: options?.loginTicket,
      });
      const signature = await signMessage(address, nonceRes.message);
      if (options?.loginTicket) {
        const res = await walletComplete({
          loginTicket: options.loginTicket,
          address,
          signature,
          chainId: walletChainId,
        });
        await handleAuthSuccess(res.accessToken, res.userInfo);
      } else {
        const res = await walletLogin({ address, signature, chainId: walletChainId });
        await handleAuthSuccess(res.accessToken, res.userInfo);
      }
    } catch (err: unknown) {
      const { errorCode } = getApiError(err);
      if (errorCode === 'WALLET_ADDRESS_MISMATCH' && options?.loginTicket && boundWalletMasked) {
        const { message: errMsg } = getApiError(err);
        setWalletMismatch({
          current: connectedAddress ?? '未知',
          expected: boundWalletMasked,
          detail: errMsg,
        });
        showLoginErrorAlert(resolveLoginError(err, 'wallet', walletChainName));
        return;
      }
      if (errorCode === 'LOGIN_TICKET_INVALID' && options?.loginTicket) {
        resetBothFlow();
        showLoginErrorAlert({
          ...resolveLoginError(err, 'password', walletChainName),
          scope: 'password',
        });
        return;
      }
      showLoginErrorAlert(resolveLoginError(err, 'wallet', walletChainName));
    } finally {
      setLoading(false);
    }
  };

  const onPasswordFinish = async (values: { username: string; password: string }) => {
    setLoginError(undefined);
    setLoading(true);
    try {
      const res = await login(values);
      if (isLoginTicketResult(res)) {
        setLoginTicket(res.loginTicket);
        setTicketExpiresAt(res.expiresAt);
        setVerifiedUsername(values.username);
        setBoundWalletMasked(res.boundWalletMasked);
        setWalletMismatch(undefined);
        setBothStep(1);
        message.success('账户密码验证通过，请继续完成钱包签名');
        return;
      }
      await handleAuthSuccess(res.accessToken, res.userInfo);
    } catch (err: unknown) {
      showLoginErrorAlert(resolveLoginError(err, 'password', walletChainName));
    } finally {
      setLoading(false);
    }
  };

  const showPasswordForm = loginMode === 'password' || loginMode === 'both';
  const showWalletOnly = loginMode === 'wallet';
  const showBothWizard = loginMode === 'both';

  const resetBothFlow = () => {
    setBothStep(0);
    setLoginTicket(undefined);
    setTicketExpiresAt(undefined);
    setVerifiedUsername(undefined);
    setBoundWalletMasked(undefined);
    setWalletMismatch(undefined);
    setLoginError(undefined);
  };

  const formatExpiresHint = (iso?: string) => {
    if (!iso) return '请在 5 分钟内完成';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '请在 5 分钟内完成';
    return `请在 ${d.toLocaleTimeString()} 前完成（约 5 分钟有效）`;
  };

  const renderErrorAlert = (scope: LoginErrorScope) => {
    if (!loginError || loginError.scope !== scope) return null;
    if (loginError.errorCode === 'WALLET_ADDRESS_MISMATCH' && walletMismatch) return null;
    return (
      <Alert
        type="error"
        showIcon
        closable
        onClose={() => setLoginError(undefined)}
        style={{ marginBottom: 16 }}
        message={loginError.title}
        description={
          <>
            <div>{loginError.message}</div>
            {loginError.detail ? (
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                {loginError.detail}
              </Typography.Paragraph>
            ) : null}
          </>
        }
      />
    );
  };

  return (
    <div className="login-page">
      <div className="login-backdrop" aria-hidden>
        <div className="login-backdrop__blob login-backdrop__blob--a" />
        <div className="login-backdrop__blob login-backdrop__blob--b" />
        <div className="login-backdrop__blob login-backdrop__blob--c" />
        <div className="login-backdrop__grid" />
        <div className="login-backdrop__ring login-backdrop__ring--outer" />
        <div className="login-backdrop__ring login-backdrop__ring--inner" />
        <div className="login-backdrop__particles">
          {Array.from({ length: 8 }, (_, i) => (
            <span key={i} className="login-backdrop__particle" />
          ))}
        </div>
      </div>

      <Card className="login-card">
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          {logoPreviewUrl ? (
            <img src={logoPreviewUrl} alt="logo" style={{ width: 56, height: 56, objectFit: 'contain' }} />
          ) : null}
          <Typography.Title level={3} style={{ margin: '16px 0 0' }}>
            {siteName}
          </Typography.Title>
        </div>

        {showBothWizard ? (
          <>
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message="双重验证登录"
              description="须先验证账户密码，再使用与该账号绑定的钱包在指定链上签名，两步均通过后方可进入系统。"
            />
            <Steps
              size="small"
              current={bothStep}
              style={{ marginBottom: 20 }}
              items={[
                { title: '账户密码', description: '第 1 步' },
                { title: '钱包签名', description: '第 2 步' },
              ]}
            />
          </>
        ) : null}

        {showPasswordForm && (!showBothWizard || bothStep === 0) ? (
          <>
            {renderErrorAlert('password')}
            {showBothWizard ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                请输入后台账号密码。若账号未绑定钱包，将无法进入下一步。
              </Typography.Paragraph>
            ) : null}
            <Form
              layout="vertical"
              onFinish={onPasswordFinish}
              initialValues={{ username: 'admin', password: 'Admin@123' }}
            >
              <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
                <Input prefix={<UserOutlined />} placeholder="用户名" size="large" />
              </Form.Item>
              <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入密码' }]}>
                <Input.Password prefix={<LockOutlined />} placeholder="密码" size="large" />
              </Form.Item>
              <Button
                type="primary"
                htmlType="submit"
                block
                size="large"
                loading={loading}
                disabled={loginError?.errorCode === 'LOGIN_LOCKED'}
              >
                {loginMode === 'both' ? '下一步：钱包验证' : '登录'}
              </Button>
            </Form>
          </>
        ) : null}

        {showWalletOnly ? (
          <>
            {renderErrorAlert('wallet')}
            <Typography.Paragraph type="secondary" style={{ textAlign: 'center' }}>
              请在 {walletChainName} 网络连接钱包并签名
            </Typography.Paragraph>
            <Button
              type="primary"
              icon={<WalletOutlined />}
              block
              size="large"
              loading={loading}
              onClick={() => runWalletSignIn()}
            >
              连接钱包登录
            </Button>
          </>
        ) : null}

        {showBothWizard && bothStep === 1 ? (
          <>
            {renderErrorAlert('wallet')}
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`账户「${verifiedUsername ?? ''}」已通过密码验证`}
              description={
                <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
                  <li>
                    请连接绑定钱包：
                    <Typography.Text code copyable>
                      {boundWalletMasked ?? '—'}
                    </Typography.Text>
                  </li>
                  <li>
                    请在 <strong>{walletChainName}</strong> 网络完成签名；如 MetaMask 网络不对，将提示切换
                  </li>
                  <li>{formatExpiresHint(ticketExpiresAt)}，超时需重新输入密码</li>
                </ul>
              }
            />
            {walletMismatch ? (
              <Alert
                type="error"
                showIcon
                closable
                onClose={() => {
                  setWalletMismatch(undefined);
                  if (loginError?.errorCode === 'WALLET_ADDRESS_MISMATCH') {
                    setLoginError(undefined);
                  }
                }}
                style={{ marginBottom: 16 }}
                message="钱包地址与绑定账户不一致"
                description={
                  <>
                    <div>
                      当前连接：<Typography.Text code>{walletMismatch.current}</Typography.Text>
                    </div>
                    <div style={{ marginTop: 4 }}>
                      应使用绑定钱包：<Typography.Text code>{walletMismatch.expected}</Typography.Text>
                    </div>
                    {walletMismatch.detail ? (
                      <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                        {walletMismatch.detail}
                      </Typography.Paragraph>
                    ) : null}
                    <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                      请在 MetaMask 中切换至绑定地址后，点击下方按钮重新签名。
                    </Typography.Paragraph>
                  </>
                }
              />
            ) : null}
            <Button
              type="primary"
              icon={<WalletOutlined />}
              block
              size="large"
              loading={loading}
              onClick={() => loginTicket && runWalletSignIn({ loginTicket })}
            >
              连接钱包并签名
            </Button>
            <Button type="link" block style={{ marginTop: 8 }} onClick={resetBothFlow}>
              返回重新输入账户密码
            </Button>
          </>
        ) : null}
      </Card>
    </div>
  );
}
