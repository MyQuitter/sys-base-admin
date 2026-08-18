import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../base/auth/auth.module';
import { LogModule } from '../base/log/log.module';
import { MemberAdminController } from './admin/member-admin.controller';
import { MemberAuthController } from './app/member-auth.controller';
import { MemberAuthService } from './app/member-auth.service';
import { MemberJwtStrategy } from './app/strategies/member-jwt.strategy';
import { Member } from './entities/member.entity';
import { MemberService } from './member.service';

@Module({
  imports: [
    AuthModule,
    LogModule,
    TypeOrmModule.forFeature([Member]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.getOrThrow<string>('member.jwtAccessExpiresIn') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [MemberAdminController, MemberAuthController],
  providers: [MemberService, MemberAuthService, MemberJwtStrategy],
  exports: [MemberService],
})
export class MemberModule {}
