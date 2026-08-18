import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, map } from 'rxjs';
import { SKIP_WRAP_KEY } from '../decorators/skip-wrap.decorator';

/** 与前后端契约一致的标准 API 响应体 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  timestamp: number;
}

/**
 * 全局响应拦截器：将 Controller 返回值包装为 `{ code, message, data, timestamp }`。
 * 标记 @SkipWrap() 的接口（如 CSV 导出）保持原始响应。
 */
@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T> | T> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T> | T> {
    const skipWrap = this.reflector.getAllAndOverride<boolean>(SKIP_WRAP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skipWrap) return next.handle();

    return next.handle().pipe(
      map((data) => ({
        code: 200,
        message: 'success',
        data,
        timestamp: Date.now(),
      })),
    );
  }
}
