import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OperationLogInterceptor } from '../../../common/interceptors/operation-log.interceptor';
import { LoginLog } from './entities/login-log.entity';
import { OperationLog } from './entities/operation-log.entity';
import { ProtectionLog } from './entities/protection-log.entity';
import { LogController } from './log.controller';
import { LogService } from './log.service';

@Module({
  imports: [TypeOrmModule.forFeature([OperationLog, LoginLog, ProtectionLog])],
  controllers: [LogController],
  providers: [
    LogService,
    { provide: APP_INTERCEPTOR, useClass: OperationLogInterceptor },
  ],
  exports: [LogService],
})
export class LogModule {}
