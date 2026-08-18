import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './create-e2e-app';

describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health', () => {
    return request(app.getHttpServer()).get('/api/health').expect(200);
  });
});
