import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './errors';

/** 把领域错误转成统一 HTTP 响应格式。 */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof DomainError) {
      response.status(exception.httpStatus).json({
        statusCode: exception.httpStatus,
        message: exception.message,
      });
      return;
    }

    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({
        statusCode: exception.getStatus(),
        message: exception.message,
      });
      return;
    }

    // 未预期错误：500，记录到控制台，不外泄内部细节
    console.error('[Unhandled]', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: '服务器内部错误',
    });
  }
}
