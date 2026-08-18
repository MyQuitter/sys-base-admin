export type LoginMode = 'password' | 'wallet' | 'both';

export interface SiteSettingData {
  siteName: string;
  siteSubtitle?: string;
  logoFile?: string;
  faviconFile?: string;
  loginMode?: LoginMode;
  walletChainId?: number;
}

export interface SiteSettingVo {
  siteName: string;
  siteSubtitle?: string;
  logoUrl?: string;
  faviconUrl?: string;
  loginMode: LoginMode;
  walletChainId: number;
  walletChainName: string;
}
