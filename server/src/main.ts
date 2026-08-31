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
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');
  app.use(helmet());
  app.use(cookieParser());
  app.use((
    req: { originalUrl?: string; method?: string; headers?: Record<string, string | string[] | undefined> },
    res: { setHeader: (k: string, v: string) => void; sendStatus: (n: number) => void; end: () => void },
    next: () => void,
  ) => {
    const url = req.originalUrl || '';
    const publicCrm =
      url.startsWith('/api/crm-whitelist/team/metrics') || url.startsWith('/api/crm-whitelist/rpc');
    if (!publicCrm) {
      next();
      return;
    }
    const rawOrigin = req.headers && req.headers.origin;
    const origin = Array.isArray(rawOrigin) ? rawOrigin[0] : rawOrigin;
    const allowOrigin = origin || '*';
    const origSetHeader = res.setHeader.bind(res);
    res.setHeader = ((k: string, v: string) => {
      if (/^access-control-allow-origin$/i.test(k)) return origSetHeader(k, allowOrigin);
      if (/^access-control-allow-credentials$/i.test(k)) return origSetHeader(k, 'false');
      return origSetHeader(k, v);
    }) as typeof res.setHeader;
    origSetHeader('Access-Control-Allow-Origin', allowOrigin);
    origSetHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    origSetHeader('Access-Control-Allow-Headers', 'Content-Type');
    origSetHeader('Access-Control-Allow-Credentials', 'false');
    origSetHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    origSetHeader('Vary', 'Origin');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
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
  await app.listen(port, '0.0.0.0');
  console.log(`Server running on http://0.0.0.0:${port}/api`);
  console.log(`Swagger: http://127.0.0.1:${port}/api/docs`);
}

bootstrap();
