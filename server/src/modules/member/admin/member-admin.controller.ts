import { Body, Controller, Delete, Get, Header, Param, ParseIntPipe, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipWrap } from '../../../common/decorators/skip-wrap.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateMemberDto, QueryMemberDto, ResetMemberPasswordDto, UpdateMemberDto } from '../dto/member.dto';
import { MemberService } from '../member.service';

@ApiTags('会员用户管理')
@Controller('members')
export class MemberAdminController {
  constructor(private readonly memberService: MemberService) {}

  @Get()
  @RequirePermissions('member:list')
  @ApiOperation({ summary: '分页查询会员用户' })
  findAll(@Query() query: QueryMemberDto) {
    return this.memberService.findAll(query);
  }

  @Get('export')
  @SkipWrap()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename=members.csv')
  @RequirePermissions('member:list')
  @ApiOperation({ summary: '导出会员用户 CSV' })
  exportMembers(@Query() query: QueryMemberDto) {
    return this.memberService.exportMembers(query);
  }

  @Get(':id')
  @RequirePermissions('member:list')
  @ApiOperation({ summary: '查询会员用户详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.memberService.findOne(id);
  }

  @Post()
  @RequirePermissions('member:create')
  @ApiOperation({ summary: '创建会员用户' })
  create(@Body() dto: CreateMemberDto) {
    return this.memberService.create(dto, 'admin');
  }

  @Put(':id')
  @RequirePermissions('member:update')
  @ApiOperation({ summary: '更新会员用户' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMemberDto) {
    return this.memberService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('member:delete')
  @ApiOperation({ summary: '删除会员用户' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.memberService.remove(id);
  }

  @Post(':id/reset-password')
  @RequirePermissions('member:reset-password')
  @ApiOperation({ summary: '重置会员用户密码' })
  resetPassword(@Param('id', ParseIntPipe) id: number, @Body() dto: ResetMemberPasswordDto) {
    return this.memberService.resetPassword(id, dto);
  }
}
