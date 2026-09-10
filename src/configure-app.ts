import { ValidationPipe, RequestMethod } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json } from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { ApiExceptionFilter } from './common/api-exception.filter';

export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.use((_: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Request-Id', randomUUID());
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(json({ limit: '64kb' }));
  app.enableCors({
    origin: (process.env.CORS_ORIGINS ?? 'http://localhost:8080')
      .split(',')
      .map((origin) => origin.trim()),
    exposedHeaders: ['X-Request-Id'],
  });
  app.setGlobalPrefix('api/v1', {
    exclude: [{ path: 'health', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: { target: false, value: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  const config = new DocumentBuilder()
    .setTitle('Menu2Kin — intégration Flutter')
    .setDescription(
      'Catalogue mobile : source demo ou PostgreSQL selon CATALOG_SOURCE. Import OSM et édition via routes admin protégées par clé opérateur.',
    )
    .setVersion('0.1.0')
    .build();
  SwaggerModule.setup(
    'api/docs',
    app,
    SwaggerModule.createDocument(app, config),
  );
}
