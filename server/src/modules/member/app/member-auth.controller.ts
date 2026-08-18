import { Body, Controller, Get, HttpCode, Post, Put, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { MemberChangePasswordDto, MemberLoginDto, MemberRegisterDto, MemberUpdateProfileDto } from './dto/member-auth.dto';
import { MemberJwtGuard } from './guards/member-jwt.guard';
import { MemberAuthService } from './member-auth.service';

@ApiTags('会员认证')
@Controller('app/auth')
@Public()
export class MemberAuthController {
  constructor(private readonly memberAuthService: MemberAuthService) {}

  @HttpCode(200)
  @Post('register')
  @ApiOperation({ summary: '会员用户注册' })
  register(@Body() dto: MemberRegisterDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.memberAuthService.register(dto, res, req);
  }

  @HttpCode(200)
  @Post('login')
  @ApiOperation({ summary: '会员用户登录' })
  login(@Body() dto: MemberLoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.memberAuthService.login(dto, res, req);
  }

  @HttpCode(200)
  @Post('refresh')
  @ApiOperation({ summary: '刷新会员 Access Token' })
  refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { memberId, token } = this.memberAuthService.parseRefreshCookie(req.cookies ?? {});
    if (!memberId || !token) {
      throw new UnauthorizedException('Refresh Token 缺失');
    }
    return this.memberAuthService.refresh(memberId, token, res);
  }

  @UseGuards(MemberJwtGuard)
  @Post('logout')
  @ApiOperation({ summary: '会员用户登出' })
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const memberId = (req.user as { memberId?: number } | undefined)?.memberId;
    return this.memberAuthService.logout(memberId, res);
  }

  @UseGuards(MemberJwtGuard)
  @Get('me')
  @ApiOperation({ summary: '获取当前会员用户资料' })
  getProfile(@Req() req: Request) {
    const memberId = (req.user as { memberId: number }).memberId;
    return this.memberAuthService.getProfile(memberId);
  }

  @UseGuards(MemberJwtGuard)
  @Put('profile')
  @ApiOperation({ summary: '更新会员用户资料' })
  updateProfile(@Req() req: Request, @Body() dto: MemberUpdateProfileDto) {
    const memberId = (req.user as { memberId: number }).memberId;
    return this.memberAuthService.updateProfile(memberId, dto);
  }

  @UseGuards(MemberJwtGuard)
  @Put('password')
  @ApiOperation({ summary: '修改会员用户密码' })
  changePassword(@Req() req: Request, @Body() dto: MemberChangePasswordDto) {
    const memberId = (req.user as { memberId: number }).memberId;
    return this.memberAuthService.changePassword(memberId, dto);
  }
}
