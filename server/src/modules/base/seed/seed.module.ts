import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Menu } from '../menu/entities/menu.entity';
import { Permission } from '../permission/entities/permission.entity';
import { Role } from '../role/entities/role.entity';
import { User } from '../user/entities/user.entity';
import { RbacSeedService } from './rbac-seed.service';

@Module({
  imports: [TypeOrmModule.forFeature([Permission, Role, Menu, User])],
  providers: [RbacSeedService],
})
export class SeedModule {}
