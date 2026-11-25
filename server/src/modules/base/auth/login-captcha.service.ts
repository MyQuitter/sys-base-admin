import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes, randomInt } from 'crypto';
import Redis from 'ioredis';
import { renderCaptchaPng } from '../../../common/utils/captcha-png';

const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CODE_LEN = 5;
const TTL_SECONDS = 180;

/**
 * 登录图形验证码：生成 PNG（非 SVG），答案仅存 Redis，接口不回传明文。
 */
@Injectable()
export class LoginCaptchaService {
  private redis: Redis;

  constructor(private readonly configService: ConfigService) {
    this.redis = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      lazyConnect: true,
    });
    this.redis.connect().catch(() => undefined);
  }

  /**
   * 签发验证码：Redis 存答案，响应仅含 captchaId 与 PNG data URL。
   */
  async issue() {
    const code = this.randomCode();
    const captchaId = randomBytes(16).toString('hex');
    await this.redis.set(`login-captcha:${captchaId}`, code.toLowerCase(), 'EX', TTL_SECONDS);
    const png = renderCaptchaPng(code);
    return {
      captchaId,
      image: `data:image/png;base64,${png.toString('base64')}`,
      expiresIn: TTL_SECONDS,
    };
  }

  /**
   * 校验并一次性消费验证码。
   * @throws UnauthorizedException 缺失、错误或过期时
   */
  async assertValid(captchaId: string | undefined, captchaCode: string | undefined) {
    if (this.configService.get<string>('nodeEnv') === 'test') return;

    const id = captchaId?.trim() ?? '';
    const input = captchaCode?.trim().toLowerCase() ?? '';
    if (!id || !input) {
      throw new UnauthorizedException({
        message: '请输入验证码',
        errorCode: 'AUTH_CAPTCHA_INVALID',
      });
    }
    const key = `login-captcha:${id}`;
    const expected = await this.redis.get(key);
    await this.redis.del(key);
    if (!expected || expected !== input) {
      throw new UnauthorizedException({
        message: '验证码错误或已过期，请刷新后重试',
        errorCode: 'AUTH_CAPTCHA_INVALID',
      });
    }
  }

  private randomCode() {
    let out = '';
    for (let i = 0; i < CODE_LEN; i++) {
      out += CHARS[randomInt(CHARS.length)];
    }
    return out;
  }
}
