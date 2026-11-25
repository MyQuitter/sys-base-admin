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
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.getInstance()?.set?.('trust proxy', 1);

  app.setGlobalPrefix('api');
  const corsOrigins = (configService.get<string[]>('corsOrigins') ?? []).map((s) => s.trim()).filter(Boolean);
  const isAllowedOrigin = (origin?: string) => {
    if (!origin) return true;
    if (corsOrigins.includes(origin)) return true;
    try {
      const { protocol, hostname } = new URL(origin);
      if (protocol !== 'http:' && protocol !== 'https:') return false;
      if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
      return hostname === 'craymat.com' || hostname.endsWith('.craymat.com');
    } catch {
      return false;
    }
  };
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: (origin, callback) => {
      callback(null, isAllowedOrigin(origin));
    },
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
  const port = configService.get<number>('port') ?? 3000;
  const nodeEnv = configService.get<string>('nodeEnv') ?? 'development';
  const jwtSecret = configService.getOrThrow<string>('jwt.secret');
  const weakJwtSecrets = new Set([
    'dev-secret-key-must-be-at-least-32-characters-long',
    'your-secret-key-at-least-32-chars',
    'your-secret-key-here-must-be-at-least-32-characters',
  ]);
  if (nodeEnv === 'production') {
    if (jwtSecret.length < 32 || weakJwtSecrets.has(jwtSecret)) {
      throw new Error('生产环境必须配置足够强的 JWT_SECRET（≥32 字符，且不能使用示例密钥）');
    }
  } else if (weakJwtSecrets.has(jwtSecret)) {
    console.warn('[security] 当前使用示例 JWT_SECRET，切勿用于公网环境');
  }

  if (nodeEnv !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document);
    console.log(`Swagger: http://127.0.0.1:${port}/api/docs`);
  }

  await app.listen(port, '0.0.0.0');
  console.log(`Server running on http://0.0.0.0:${port}/api`);
}

bootstrap();
