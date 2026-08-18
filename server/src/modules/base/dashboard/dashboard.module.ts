import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Department } from '../department/entities/department.entity';
import { LoginLog } from '../log/entities/login-log.entity';
import { OperationLog } from '../log/entities/operation-log.entity';
import { Menu } from '../menu/entities/menu.entity';
import { MonitorModule } from '../monitor/monitor.module';
import { Notice } from '../notice/entities/notice.entity';
import { Permission } from '../permission/entities/permission.entity';
import { Position } from '../position/entities/position.entity';
import { Role } from '../role/entities/role.entity';
import { User } from '../user/entities/user.entity';
import { Member } from '../../member/entities/member.entity';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Role,
      Permission,
      Menu,
      Department,
      Position,
      Notice,
      LoginLog,
      OperationLog,
      Member,
    ]),
    MonitorModule,
    BlockchainModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
})
export class DashboardModule {}
