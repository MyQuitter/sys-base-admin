import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, catchError, finalize, throwError } from 'rxjs';
import { Request, Response } from 'express';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { LogService } from '../../modules/base/log/log.service';

/** 不记录审计日志的路径前缀（避免日志查询/导出产生噪音） */
const EXCLUDED_PREFIXES = ['/logs', '/monitor', '/health', '/auth/refresh'];

/** 从 URL 解析模块名，如 /users -> users */
function parseModule(url: string): string {
  const path = url.split('?')[0].replace(/^\/?api\/?/, '').replace(/^\//, '');
  return path.split('/')[0] || 'unknown';
}

/** 从 HTTP 方法映射操作类型 */
function parseAction(method: string): string {
  const map: Record<string, string> = {
    GET: 'query',
    POST: 'create',
    PUT: 'update',
    PATCH: 'update',
    DELETE: 'delete',
  };
  return map[method] ?? method.toLowerCase();
}

function shouldExcludePath(url: string): boolean {
  const path = url.split('?')[0];
  return EXCLUDED_PREFIXES.some((prefix) => path.startsWith(prefix) || path.startsWith(`/api${prefix}`));
}

/**
 * 操作日志拦截器：对已认证的非 GET 请求写入审计日志（成功与失败均记录）。
 */
@Injectable()
export class OperationLogInterceptor implements NestInterceptor {
  constructor(
    private readonly logService: LogService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const { method, url, ip } = request;
    const user = request.user as { userId?: number; username?: string } | undefined;

    const shouldLog =
      !isPublic &&
      user?.userId &&
      method !== 'GET' &&
      !shouldExcludePath(url);

    if (!shouldLog) return next.handle();

    const start = Date.now();
    let status = 200;

    return next.handle().pipe(
      catchError((err: unknown) => {
        status =
          err instanceof HttpException ? err.getStatus() : response.statusCode || 500;
        return throwError(() => err);
      }),
      finalize(() => {
        if (response.statusCode && response.statusCode >= 400) {
          status = response.statusCode;
        }
        this.logService.recordOperation({
          userId: user.userId,
          username: user.username,
          module: parseModule(url),
          action: parseAction(method),
          method,
          url,
          ip: ip ?? request.socket.remoteAddress,
          status,
          durationMs: Date.now() - start,
        });
      }),
    );
  }
}
