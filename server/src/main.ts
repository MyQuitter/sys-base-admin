import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { NormalizeHttpStatusInterceptor } from './common/interceptors/normalize-http-status.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

// CommonJS 包在 Node 24 下需用 require，避免 default import 运行时非函数
// eslint-disable-next-line @typescript-eslint/no-require-imports
const cookieParser = require('cookie-parser');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const helmet = require('helmet');
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: configService.get<string[]>('corsOrigins'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(
    new ResponseInterceptor(reflector),
    new NormalizeHttpStatusInterceptor(),
    new LoggingInterceptor(),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('基础管理系统 API')
    .setDescription('NestJS 后端接口文档')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get<number>('port') ?? 3000;
  await app.listen(port);
  console.log(`Server running on http://localhost:${port}/api`);
  console.log(`Swagger: http://localhost:${port}/api/docs`);
}

bootstrap();
