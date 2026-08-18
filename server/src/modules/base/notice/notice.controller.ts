import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreateNoticeDto } from './dto/create-notice.dto';
import { PublishNoticeDto } from './dto/publish-notice.dto';
import { QueryNoticeDto } from './dto/query-notice.dto';
import { UpdateNoticeDto } from './dto/update-notice.dto';
import { NoticePublishService } from './notice-publish.service';
import { NoticeService } from './notice.service';

@ApiTags('系统公告')
@Controller('notices')
export class NoticeController {
  constructor(
    private readonly noticeService: NoticeService,
    private readonly noticePublishService: NoticePublishService,
  ) {}

  @Get()
  @RequirePermissions('notice:list')
  @ApiOperation({ summary: '分页查询公告' })
  findAll(@Query() query: QueryNoticeDto) {
    return this.noticeService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('notice:list')
  @ApiOperation({ summary: '查询公告详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.noticeService.findOne(id);
  }

  @Post()
  @RequirePermissions('notice:create')
  @ApiOperation({ summary: '创建公告草稿' })
  create(@Body() dto: CreateNoticeDto) {
    return this.noticeService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('notice:update')
  @ApiOperation({ summary: '更新公告草稿' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateNoticeDto) {
    return this.noticeService.update(id, dto);
  }

  @Put(':id/publish')
  @RequirePermissions('notice:update')
  @ApiOperation({ summary: '发布公告并投递至个人收件箱' })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PublishNoticeDto,
    @Req() req: Request,
  ) {
    const publisherId = (req.user as { userId: number }).userId;
    return this.noticePublishService.publish(id, publisherId, dto);
  }

  @Put(':id/revoke')
  @RequirePermissions('notice:update')
  @ApiOperation({ summary: '撤回已发布公告' })
  revoke(@Param('id', ParseIntPipe) id: number) {
    return this.noticePublishService.revoke(id);
  }

  @Delete(':id')
  @RequirePermissions('notice:delete')
  @ApiOperation({ summary: '删除公告' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.noticeService.remove(id);
  }
}
