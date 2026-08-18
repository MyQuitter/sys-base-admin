import { Controller, Get, Param, ParseIntPipe, Put, Query, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { QueryMyMessageDto } from './dto/query-my-message.dto';
import { MessageService } from './message.service';

@ApiTags('个人消息')
@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  private getUserId(req: Request) {
    return (req.user as { userId: number }).userId;
  }

  @Get('unread-count')
  @ApiOperation({ summary: '当前用户未读消息数' })
  getUnreadCount(@Req() req: Request) {
    return this.messageService.getUnreadCount(this.getUserId(req));
  }

  @Get('mine')
  @ApiOperation({ summary: '我的消息分页列表' })
  findMine(@Req() req: Request, @Query() query: QueryMyMessageDto) {
    return this.messageService.findMine(this.getUserId(req), query);
  }

  @Put('read-all')
  @ApiOperation({ summary: '全部标为已读' })
  markAllRead(@Req() req: Request) {
    return this.messageService.markAllRead(this.getUserId(req));
  }

  @Get(':id')
  @ApiOperation({ summary: '消息详情（自动标已读）' })
  findOne(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.messageService.findOne(this.getUserId(req), id);
  }

  @Put(':id/read')
  @ApiOperation({ summary: '标记单条已读' })
  markRead(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    return this.messageService.markRead(this.getUserId(req), id);
  }
}
