import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * 全局异常过滤器：统一错误响应格式，HTTP 状态码与 body.code 保持一致。
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  /**
   * 捕获所有异常，解析 message/errorCode/detail 并写入响应。
   * 非 HttpException 在开发环境返回堆栈摘要。
   */
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let errorCode = 'INTERNAL_ERROR';
    let detail: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (status === HttpStatus.TOO_MANY_REQUESTS) {
        message = '请求过于频繁，请稍后再试';
        errorCode = 'RATE_LIMITED';
        detail = '同一 IP 短时间请求次数过多';
      } else if (typeof body === 'string') {
        message = body;
        detail = body;
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        message = (obj.message as string) ?? message;
        errorCode = (obj.errorCode as string) ?? errorCode;
        detail = obj.detail ?? (Array.isArray(obj.message) ? obj.message.join(', ') : undefined);
        if (typeof message === 'string' && /throttler|too many requests/i.test(message)) {
          message = '请求过于频繁，请稍后再试';
          errorCode = 'RATE_LIMITED';
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
      detail = process.env.NODE_ENV === 'development' ? exception.message : undefined;
    }

    response.status(status).json({
      code: status,
      message,
      errorCode,
      detail,
      timestamp: Date.now(),
      path: request.url,
    });
  }
}
