import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from 'express';

/**
 * 将 NestJS POST 默认的 201 规范化为 200，与 `{ code: 200 }` 契约一致。
 */
@Injectable()
export class NormalizeHttpStatusInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const response = context.switchToHttp().getResponse<Response>();
    return next.handle().pipe(
      tap(() => {
        if (response.statusCode === 201) {
          response.status(200);
        }
      }),
    );
  }
}
