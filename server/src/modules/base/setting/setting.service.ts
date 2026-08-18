import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createReadStream, existsSync, writeFileSync } from 'fs';
import { extname, join } from 'path';
import { IsNull, Not, Repository } from 'typeorm';
import { ChainService } from '../../blockchain/services/chain.service';
import { User } from '../user/entities/user.entity';
import { UpdateSiteSettingDto } from './dto/update-site-setting.dto';
import { DEFAULT_WALLET_CHAIN_ID } from './evm-chains';
import { SiteSettingStore } from './site-setting.store';
import type { LoginMode, SiteSettingData, SiteSettingVo } from './site-setting.types';
const LOGO_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);
const FAVICON_MIME = new Set([...LOGO_MIME, 'image/x-icon', 'image/vnd.microsoft.icon']);

/**
 * 站点外观与登录配置：读写 JSON 配置文件与 branding 目录资源。
 */
@Injectable()
export class SettingService {
  private readonly store: SiteSettingStore;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly chainService: ChainService,
  ) {
    const configPath = join(
      process.cwd(),
      this.configService.get<string>('siteSetting.configPath') ?? 'data/site.setting.json',
    );
    const brandingDir = join(
      process.cwd(),
      this.configService.get<string>('siteSetting.brandingDir') ?? 'data/branding',
    );
    this.store = new SiteSettingStore(configPath, brandingDir);
    this.store.ensureDirs();
  }

  readData(): SiteSettingData {
    const raw = this.store.read();
    return {
      ...raw,
      loginMode: raw.loginMode ?? 'password',
      walletChainId: raw.walletChainId ?? DEFAULT_WALLET_CHAIN_ID,
    };
  }

  getLoginMode(): LoginMode {
    return this.readData().loginMode ?? 'password';
  }

  getWalletChainId(): number {
    return this.readData().walletChainId ?? DEFAULT_WALLET_CHAIN_ID;
  }

  async getSupportedChains() {
    return this.chainService.findLoginEnabled();
  }

  private async toVo(data: SiteSettingData): Promise<SiteSettingVo> {
    const walletChainId = data.walletChainId ?? DEFAULT_WALLET_CHAIN_ID;
    const walletChainName =
      (await this.chainService.getChainName(walletChainId)) ?? `Chain ${walletChainId}`;
    return {
      siteName: data.siteName,
      siteSubtitle: data.siteSubtitle,
      logoUrl: data.logoFile ? '/api/settings/branding/logo' : undefined,
      faviconUrl: data.faviconFile ? '/api/settings/branding/favicon' : undefined,
      loginMode: data.loginMode ?? 'password',
      walletChainId,
      walletChainName,
    };
  }

  async getSiteSetting(): Promise<SiteSettingVo> {
    return this.toVo(this.readData());
  }
  private async countBoundActiveUsers() {
    return this.userRepository.count({
      where: { status: 1, walletAddress: Not(IsNull()) },
    });
  }

  async updateSiteSetting(dto: UpdateSiteSettingDto): Promise<SiteSettingVo> {
    const current = this.readData();
    const nextLoginMode = dto.loginMode ?? current.loginMode ?? 'password';
    const nextChainId = dto.walletChainId ?? current.walletChainId ?? DEFAULT_WALLET_CHAIN_ID;

    if (dto.walletChainId !== undefined) {
      const supported = await this.chainService.isSupportedChainId(dto.walletChainId);
      if (!supported) {
        throw new BadRequestException({
          message: '不支持的链 ID',
          errorCode: 'WALLET_CHAIN_UNSUPPORTED',
        });
      }
      const loginEnabled = await this.chainService.isLoginEnabledChainId(dto.walletChainId);
      if (!loginEnabled) {
        throw new BadRequestException({
          message: '该链未启用钱包登录',
          errorCode: 'CHAIN_LOGIN_DISABLED',
        });
      }
    }
    if (
      (dto.loginMode === 'wallet' || dto.loginMode === 'both') &&
      (await this.countBoundActiveUsers()) === 0
    ) {
      throw new BadRequestException({
        message: '至少一名启用用户已绑定钱包后才能启用钱包相关登录方式',
        errorCode: 'WALLET_NO_BOUND_USER',
      });
    }

    const next: SiteSettingData = {
      ...current,
      ...(dto.siteName !== undefined ? { siteName: dto.siteName } : {}),
      ...(dto.siteSubtitle !== undefined ? { siteSubtitle: dto.siteSubtitle } : {}),
      ...(dto.loginMode !== undefined ? { loginMode: nextLoginMode } : {}),
      ...(dto.walletChainId !== undefined ? { walletChainId: nextChainId } : {}),
    };
    this.store.write(next);
    return this.toVo(next);
  }

  async saveBranding(type: 'logo' | 'favicon', file: Express.Multer.File) {
    if (!file) throw new BadRequestException('请选择文件');
    const allowed = type === 'logo' ? LOGO_MIME : FAVICON_MIME;
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException('不支持的图片格式');
    }

    const ext = extname(file.originalname) || '.png';
    const fileName = type === 'logo' ? `logo${ext}` : `favicon${ext}`;
    const current = this.readData();
    const oldFile = type === 'logo' ? current.logoFile : current.faviconFile;

    this.store.removeBrandingFile(oldFile);
    const targetPath = join(this.store.getBrandingDir(), fileName);
    writeFileSync(targetPath, file.buffer);

    const next: SiteSettingData = {
      ...current,
      ...(type === 'logo' ? { logoFile: fileName } : { faviconFile: fileName }),
    };
    this.store.write(next);
    return this.toVo(next);
  }

  async clearBranding(type: 'logo' | 'favicon') {
    const current = this.readData();
    if (type === 'logo') {
      this.store.removeBrandingFile(current.logoFile);
      const { logoFile: _removed, ...rest } = current;
      this.store.write(rest);
    } else {
      this.store.removeBrandingFile(current.faviconFile);
      const { faviconFile: _removed, ...rest } = current;
      this.store.write(rest);
    }
    return this.toVo(this.readData());
  }

  getBrandingMeta(type: 'logo' | 'favicon') {
    const current = this.readData();
    const fileName = type === 'logo' ? current.logoFile : current.faviconFile;
    const path = this.store.getBrandingPath(fileName);
    if (!fileName || !path || !existsSync(path)) return null;

    const ext = extname(fileName).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
    };

    return {
      stream: createReadStream(path),
      mimeType: mimeMap[ext] ?? 'application/octet-stream',
      fileName,
    };
  }
}
