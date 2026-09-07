import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const parserType =
      typeof exception === 'object' && exception !== null && 'type' in exception
        ? exception.type
        : undefined;
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : parserType === 'entity.too.large'
          ? HttpStatus.PAYLOAD_TOO_LARGE
          : parserType === 'entity.parse.failed'
            ? HttpStatus.BAD_REQUEST
            : HttpStatus.INTERNAL_SERVER_ERROR;
    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;
    const messages =
      typeof body === 'object' && body !== null && 'message' in body
        ? body.message
        : undefined;
    response.status(status).json({
      error: {
        code:
          status === 400
            ? 'VALIDATION_ERROR'
            : status === 404
              ? 'RESOURCE_NOT_FOUND'
              : status === 413
                ? 'PAYLOAD_TOO_LARGE'
                : 'INTERNAL_ERROR',
        message:
          status >= 500
            ? 'Erreur interne du serveur'
            : typeof messages === 'string'
              ? messages
              : 'Requête invalide',
        details: Array.isArray(messages) ? messages : [],
        requestId: response.getHeader('X-Request-Id'),
      },
    });
  }
}
