import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

/** 浏览器端生成的设备标识：标准 UUID（含连字符） */
export const DEVICE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * 校验设备 ID 格式。
 */
export function isValidDeviceId(value: string | undefined | null): value is string {
  return Boolean(value && DEVICE_ID_PATTERN.test(value));
}

/**
 * 从请求头 `X-Device-Id` 读取并校验设备标识。
 * @throws UnauthorizedException 缺失或格式非法
 */
export function requireDeviceId(req?: Request): string {
  const raw = req?.headers?.['x-device-id'];
  const deviceId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!isValidDeviceId(deviceId)) {
    throw new UnauthorizedException({
      message: '缺少或非法的设备标识',
      errorCode: 'DEVICE_ID_REQUIRED',
    });
  }
  return deviceId;
}
