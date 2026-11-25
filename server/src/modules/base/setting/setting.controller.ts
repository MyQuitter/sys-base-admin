import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Post,
  Put,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Public } from '../../../common/decorators/public.decorator';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { UpdateSiteSettingDto } from './dto/update-site-setting.dto';
import { SettingService } from './setting.service';

@ApiTags('系统设置')
@Controller('settings')
export class SettingController {
  constructor(private readonly settingService: SettingService) {}

  @Public()
  @SkipThrottle()
  @Get('site')
  @ApiOperation({ summary: '获取站点外观配置（公开）' })
  getSiteSetting() {
    return this.settingService.getSiteSetting();
  }

  @Public()
  @SkipThrottle()
  @Get('chains')
  @ApiOperation({ summary: '获取支持的 EVM 链列表（公开）' })
  getChains() {
    return this.settingService.getSupportedChains();
  }

  @Put('site')
  @RequirePermissions('setting:update')
  @ApiOperation({ summary: '更新站点外观配置' })
  updateSiteSetting(@Body() dto: UpdateSiteSettingDto) {
    return this.settingService.updateSiteSetting(dto);
  }

  @Post('branding/logo')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('setting:update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiOperation({ summary: '上传站点 Logo' })
  uploadLogo(@UploadedFile() file: Express.Multer.File) {
    return this.settingService.saveBranding('logo', file);
  }

  @Post('branding/favicon')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermissions('setting:update')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }))
  @ApiOperation({ summary: '上传网站图标' })
  uploadFavicon(@UploadedFile() file: Express.Multer.File) {
    return this.settingService.saveBranding('favicon', file);
  }

  @Delete('branding/logo')
  @RequirePermissions('setting:update')
  @ApiOperation({ summary: '清除站点 Logo' })
  clearLogo() {
    return this.settingService.clearBranding('logo');
  }

  @Delete('branding/favicon')
  @RequirePermissions('setting:update')
  @ApiOperation({ summary: '清除网站图标' })
  clearFavicon() {
    return this.settingService.clearBranding('favicon');
  }

  @Public()
  @SkipWrap()
  @Get('branding/logo')
  @ApiOperation({ summary: '获取站点 Logo（公开）' })
  async getLogo(@Res({ passthrough: true }) res: Response) {
    const meta = this.settingService.getBrandingMeta('logo');
    if (!meta) throw new NotFoundException('未配置 Logo');
    const encodedName = encodeURIComponent(meta.fileName);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(meta.stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodedName}`,
    });
  }

  @Public()
  @SkipWrap()
  @Get('branding/favicon')
  @ApiOperation({ summary: '获取站点 Favicon（公开）' })
  async getFavicon(@Res({ passthrough: true }) res: Response) {
    const meta = this.settingService.getBrandingMeta('favicon');
    if (!meta) throw new NotFoundException('未配置网站图标');
    const encodedName = encodeURIComponent(meta.fileName);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return new StreamableFile(meta.stream, {
      type: meta.mimeType,
      disposition: `inline; filename*=UTF-8''${encodedName}`,
    });
  }
}
