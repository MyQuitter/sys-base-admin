import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './create-e2e-app';

describe('Monitor & Logs (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' })
      .expect(200);
    accessToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  it('GET /api/logs/operation 分页', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/logs/operation?page=1&pageSize=5')
      .set(auth())
      .expect(200);
    expect(res.body.data).toHaveProperty('items');
    expect(res.body.data).toHaveProperty('total');
  });

  it('GET /api/logs/operation/export 返回 CSV 且不挂起', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/logs/operation/export')
      .set(auth())
      .expect(200);
    expect(String(res.headers['content-type'])).toContain('text/csv');
    expect(res.text).toContain('ID,用户名');
  });

  it('GET /api/logs/login 分页', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/logs/login?page=1&pageSize=5')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('GET /api/monitor/system', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/monitor/system')
      .set(auth())
      .expect(200);
    expect(res.body.data).toHaveProperty('mysql');
    expect(res.body.data).toHaveProperty('redis');
  });

  it('GET /api/monitor/online-users', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/monitor/online-users')
      .set(auth())
      .expect(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
