import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserMessage } from './entities/user-message.entity';
import { MessageController } from './message.controller';
import { MessageService } from './message.service';

@Module({
  imports: [TypeOrmModule.forFeature([UserMessage])],
  controllers: [MessageController],
  providers: [MessageService],
  exports: [MessageService],
})
export class MessageModule {}
