import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';
import { LoggingInterceptor } from '../src/common/interceptors/logging.interceptor';
import { NormalizeHttpStatusInterceptor } from '../src/common/interceptors/normalize-http-status.interceptor';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';

/** 与 main.ts 对齐的 E2E 应用初始化 */
export async function createE2eApp(): Promise<INestApplication> {
  // Jest 默认 NODE_ENV=test 会关闭 TypeORM synchronize，E2E 需自动建表/加列
  process.env.NODE_ENV = 'development';

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  app.setGlobalPrefix('api');
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
  await app.init();
  return app;
}
