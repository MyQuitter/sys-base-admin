import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LogModule } from '../log/log.module';
import { SettingModule } from '../setting/setting.module';
import { BlockchainModule } from '../../blockchain/blockchain.module';
import { UserModule } from '../user/user.module';
import { User } from '../user/entities/user.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { LoginLockoutService } from './login-lockout.service';
import { WalletAuthService } from './wallet-auth.service';

@Module({
  imports: [
    LogModule,
    UserModule,
    SettingModule,
    BlockchainModule,
    TypeOrmModule.forFeature([User]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.secret'),
        signOptions: {
          expiresIn: config.getOrThrow<string>('jwt.accessTokenExpiresIn') as JwtSignOptions['expiresIn'],
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, WalletAuthService, LoginLockoutService, JwtStrategy],
  exports: [AuthService, JwtModule, LoginLockoutService],
})
export class AuthModule {}
