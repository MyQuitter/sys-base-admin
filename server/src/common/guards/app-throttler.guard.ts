import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';
import { getClientIp } from '../utils/client-ip';

/**
 * 按真实客户端 IP 限流（Cloudflare / 反代后不能用 TCP 对端）。
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Request): Promise<string> {
    return getClientIp(req) || req.ip || 'unknown';
  }
}
