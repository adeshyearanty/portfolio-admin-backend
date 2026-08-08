import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : null;

    let message: string | string[] = 'Internal server error';
    let errorDetails: unknown = null;

    if (exception instanceof HttpException) {
      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (exceptionResponse && typeof exceptionResponse === 'object') {
        const resObj = exceptionResponse as Record<string, unknown>;

        if ('message' in resObj) {
          const msgVal = resObj.message;
          if (typeof msgVal === 'string' || Array.isArray(msgVal)) {
            message = msgVal as string | string[];
          } else {
            message = exception.message;
          }
        } else {
          message = exception.message;
        }

        if ('error' in resObj) {
          errorDetails = resObj.error;
        }
      } else {
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    // Log the exception
    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} failed with message: ${
          Array.isArray(message) ? message.join(', ') : message
        }`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      const logMsg = exceptionResponse || message;
      this.logger.warn(
        `${request.method} ${request.url} failed with status ${status}: ${JSON.stringify(
          logMsg,
        )}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: Array.isArray(message) ? message : [message],
      ...(errorDetails !== null ? { error: errorDetails } : {}),
    });
  }
}
