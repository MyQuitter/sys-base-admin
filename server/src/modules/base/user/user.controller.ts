import { Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { BindWalletDto } from './dto/bind-wallet.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { QueryUserDto } from './dto/query-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

/**
 * 用户管理 HTTP 接口：委托 UserService，权限由 @RequirePermissions 控制。
 */
@ApiTags('系统用户')
@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequirePermissions('user:list')
  @ApiOperation({ summary: '分页查询用户' })
  findAll(@Query() query: QueryUserDto) {
    return this.userService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('user:list')
  @ApiOperation({ summary: '查询用户详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.userService.findOne(id);
  }

  @Post()
  @RequirePermissions('user:create')
  @ApiOperation({ summary: '创建用户' })
  create(@Body() dto: CreateUserDto) {
    return this.userService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('user:update')
  @ApiOperation({ summary: '更新用户' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateUserDto) {
    return this.userService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('user:delete')
  @ApiOperation({ summary: '删除用户' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.userService.remove(id);
  }

  @Post(':id/reset-password')
  @RequirePermissions('user:reset-password')
  @ApiOperation({ summary: '重置用户密码' })
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetPasswordDto) {
    return this.userService.resetPassword(id, dto);
  }

  @Put(':id/wallet')
  @RequirePermissions('user:bind-wallet')
  @ApiOperation({ summary: '绑定/换绑用户钱包' })
  bindWallet(@Param('id', ParseIntPipe) id: number, @Body() dto: BindWalletDto, @Req() req: Request) {
    const operatorId = (req.user as { userId: number }).userId;
    return this.userService.bindWallet(id, dto, operatorId);
  }

  @Delete(':id/wallet')
  @RequirePermissions('user:bind-wallet')
  @ApiOperation({ summary: '解绑用户钱包' })
  unbindWallet(@Param('id', ParseIntPipe) id: number) {
    return this.userService.unbindWallet(id);
  }
}
