import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { SiteSettingData } from './site-setting.types';
import { DEFAULT_WALLET_CHAIN_ID } from './evm-chains';

const DEFAULT_SETTING: SiteSettingData = {
  siteName: '基础管理系统',
  siteSubtitle: 'Admin Management Platform',
  loginMode: 'password',
  walletChainId: DEFAULT_WALLET_CHAIN_ID,
};

/**
 * 站点配置 JSON 文件读写。
 */
export class SiteSettingStore {
  constructor(
    private readonly configPath: string,
    private readonly brandingDir: string,
  ) {}

  getBrandingDir() {
    return this.brandingDir;
  }

  ensureDirs() {
    const configDir = join(this.configPath, '..');
    if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true });
    if (!existsSync(this.brandingDir)) mkdirSync(this.brandingDir, { recursive: true });
    if (!existsSync(this.configPath)) {
      writeFileSync(this.configPath, JSON.stringify(DEFAULT_SETTING, null, 2), 'utf-8');
    }
  }

  read(): SiteSettingData {
    this.ensureDirs();
    const raw = readFileSync(this.configPath, 'utf-8');
    return { ...DEFAULT_SETTING, ...JSON.parse(raw) } as SiteSettingData;
  }

  write(data: SiteSettingData) {
    this.ensureDirs();
    writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  getBrandingPath(fileName?: string) {
    if (!fileName) return null;
    return join(this.brandingDir, fileName);
  }

  removeBrandingFile(fileName?: string) {
    const path = this.getBrandingPath(fileName);
    if (path && existsSync(path)) unlinkSync(path);
  }
}
