import { Body, Controller, Get, Header, HttpCode, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { UserService } from '../user/user.service';
import { AuthService } from './auth.service';
import { LoginCaptchaService } from './login-captcha.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { WalletCompleteDto } from './dto/wallet-complete.dto';
import { WalletLoginDto } from './dto/wallet-login.dto';

@ApiTags('认证')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly loginCaptchaService: LoginCaptchaService,
  ) {}

  @Public()
  @Get('captcha')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: '获取登录图形验证码' })
  getCaptcha() {
    return this.loginCaptchaService.issue();
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('login')
  @ApiOperation({ summary: '用户登录' })
  login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(dto, res, req);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get('wallet/nonce')
  @ApiOperation({ summary: '获取钱包签名 nonce' })
  getWalletNonce(
    @Req() req: Request,
    @Query('chainId') chainId: string,
    @Query('address') address?: string,
    @Query('loginTicket') loginTicket?: string,
  ) {
    return this.authService.getWalletNonce(
      {
        chainId: Number(chainId),
        address,
        loginTicket,
      },
      req,
    );
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('wallet/login')
  @ApiOperation({ summary: '钱包单因子登录' })
  walletLogin(@Body() dto: WalletLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.walletLogin(dto, res, req);
  }

  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 8, ttl: 60_000 } })
  @Post('wallet/complete')
  @ApiOperation({ summary: '密码+钱包双重验证第二步' })
  walletComplete(@Body() dto: WalletCompleteDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.authService.walletComplete(dto, res, req);
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({ summary: '刷新 Access Token' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { userId, token } = this.authService.parseRefreshCookie(req.cookies ?? {});
    if (!userId || !token) {
      throw new UnauthorizedException('Refresh Token 缺失');
    }
    return this.authService.refresh(userId, token, res, req);
  }

  @Post('logout')
  @ApiOperation({ summary: '用户登出' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const userId = (req.user as { userId?: number } | undefined)?.userId;
    return this.authService.logout(userId, res, req);
  }

  @Get('me')
  @ApiOperation({ summary: '获取当前用户信息' })
  getProfile(@Req() req: Request) {
    const userId = (req.user as { userId: number }).userId;
    return this.userService.findOne(userId);
  }

  @Put('profile')
  @ApiOperation({ summary: '更新当前用户资料' })
  updateProfile(@Req() req: Request, @Body() dto: UpdateProfileDto) {
    const userId = (req.user as { userId: number }).userId;
    return this.userService.updateProfile(userId, dto.nickname);
  }

  @Put('password')
  @ApiOperation({ summary: '修改当前用户密码' })
  changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    const userId = (req.user as { userId: number }).userId;
    return this.userService.changePassword(userId, dto.oldPassword, dto.newPassword);
  }
}
