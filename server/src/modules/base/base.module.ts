import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { DepartmentModule } from './department/department.module';
import { DictModule } from './dict/dict.module';
import { FileModule } from './file/file.module';
import { HealthModule } from './health/health.module';
import { MenuModule } from './menu/menu.module';
import { LogModule } from './log/log.module';
import { MessageModule } from './message/message.module';
import { MonitorModule } from './monitor/monitor.module';
import { NoticeModule } from './notice/notice.module';
import { PermissionModule } from './permission/permission.module';
import { PositionModule } from './position/position.module';
import { RoleModule } from './role/role.module';
import { SeedModule } from './seed/seed.module';
import { SettingModule } from './setting/setting.module';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    HealthModule,
    SeedModule,
    AuthModule,
    DashboardModule,
    UserModule,
    RoleModule,
    PermissionModule,
    MenuModule,
    DepartmentModule,
    PositionModule,
    DictModule,
    NoticeModule,
    MessageModule,
    FileModule,
    SettingModule,
    LogModule,
    MonitorModule,
  ],
})
export class BaseModule {}
