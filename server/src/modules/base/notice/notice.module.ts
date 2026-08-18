import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserMessage } from '../message/entities/user-message.entity';
import { User } from '../user/entities/user.entity';
import { Notice } from './entities/notice.entity';
import { NoticeController } from './notice.controller';
import { NoticePublishService } from './notice-publish.service';
import { NoticeService } from './notice.service';

@Module({
  imports: [TypeOrmModule.forFeature([Notice, User, UserMessage])],
  controllers: [NoticeController],
  providers: [NoticeService, NoticePublishService],
  exports: [NoticeService, NoticePublishService],
})
export class NoticeModule {}
