import { create } from 'zustand';
import { getSiteSetting, type SiteSetting } from '@/api/settings';
import { applySiteBranding } from '@/utils/branding';
import type { LoginMode } from '@/constants/evm-chains';
import { DEFAULT_WALLET_CHAIN_ID } from '@/constants/evm-chains';

const FALLBACK_TITLE = import.meta.env.VITE_APP_TITLE ?? '基础管理系统';

interface SiteState {
  loaded: boolean;
  siteName: string;
  siteSubtitle: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginMode: LoginMode;
  walletChainId: number;
  walletChainName: string;
  fetchSiteSetting: () => Promise<void>;
  applySetting: (setting: SiteSetting) => void;
}

function applySiteState(setting: SiteSetting): Partial<SiteState> {
  return {
    loaded: true,
    siteName: setting.siteName,
    siteSubtitle: setting.siteSubtitle ?? 'Admin Management Platform',
    logoUrl: setting.logoUrl,
    faviconUrl: setting.faviconUrl,
    loginMode: setting.loginMode ?? 'password',
    walletChainId: setting.walletChainId ?? DEFAULT_WALLET_CHAIN_ID,
    walletChainName: setting.walletChainName ?? 'Sepolia',
  };
}

export const useSiteStore = create<SiteState>((set) => ({
  loaded: false,
  siteName: FALLBACK_TITLE,
  siteSubtitle: 'Admin Management Platform',
  loginMode: 'password',
  walletChainId: DEFAULT_WALLET_CHAIN_ID,
  walletChainName: 'Sepolia',
  fetchSiteSetting: async () => {
    const setting = await getSiteSetting();
    set(applySiteState(setting));
    applySiteBranding(setting.siteName, setting.faviconUrl);
  },
  applySetting: (setting) => {
    set(applySiteState(setting));
    applySiteBranding(setting.siteName, setting.faviconUrl);
  },
}));
