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
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import {
  CreateEventSubscriptionDto,
  QueryEventSubscriptionDto,
  UpdateEventSubscriptionDto,
} from '../dto/event-subscription.dto';
import { EventSubscriptionService } from '../services/event-subscription.service';
import { EventSyncService } from '../services/event-sync.service';

@ApiTags('区块链-事件订阅')
@Controller('blockchain/event-subscriptions')
export class EventSubscriptionController {
  constructor(
    private readonly subscriptionService: EventSubscriptionService,
    private readonly eventSyncService: EventSyncService,
  ) {}

  @Get()
  @RequirePermissions('event-sub:list')
  @ApiOperation({ summary: '分页查询事件订阅' })
  findAll(@Query() query: QueryEventSubscriptionDto) {
    return this.subscriptionService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('event-sub:list')
  @ApiOperation({ summary: '查询事件订阅详情' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.subscriptionService.findOne(id);
  }

  @Post()
  @RequirePermissions('event-sub:create')
  @ApiOperation({ summary: '创建事件订阅' })
  create(@Body() dto: CreateEventSubscriptionDto) {
    return this.subscriptionService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('event-sub:update')
  @ApiOperation({ summary: '更新事件订阅' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateEventSubscriptionDto) {
    return this.subscriptionService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('event-sub:delete')
  @ApiOperation({ summary: '删除事件订阅' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.subscriptionService.remove(id);
  }

  @Post(':id/scan')
  @RequirePermissions('event-sub:create')
  @ApiOperation({ summary: '立即扫描订阅事件' })
  scan(@Param('id', ParseIntPipe) id: number) {
    return this.eventSyncService.scanSubscription(id);
  }
}
