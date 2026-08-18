import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * 业务异常：用于可预期的规则违反（如重复用户名），默认 400。
 * 响应体携带 errorCode 供前端区分场景。
 */
export class BusinessException extends HttpException {
  constructor(message: string, errorCode?: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super(
      {
        code: status,
        message,
        errorCode: errorCode ?? 'BUSINESS_ERROR',
        detail: message,
      },
      status,
    );
  }
}
