import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../user/entities/user.entity';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { SettingController } from './setting.controller';
import { SettingService } from './setting.service';

@Module({
  imports: [TypeOrmModule.forFeature([User]), BlockchainModule],
  controllers: [SettingController],
  providers: [SettingService],
  exports: [SettingService],
})
export class SettingModule {}