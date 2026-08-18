import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './create-e2e-app';

describe('P4 File Management (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let fileId = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' })
      .expect(200);
    accessToken = login.body.data.accessToken;
  });

  afterAll(async () => {
    const auth = () => ({ Authorization: `Bearer ${accessToken}` });
    const server = app.getHttpServer();
    if (fileId) {
      await request(server).delete(`/api/files/${fileId}`).set(auth());
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  it('POST /api/files/upload 上传 PNG', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const res = await request(app.getHttpServer())
      .post('/api/files/upload')
      .set(auth())
      .attach('file', png, 'e2e-test.png')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.data.originalName).toBe('e2e-test.png');
    expect(res.body.data.mimeType).toBe('image/png');
    fileId = res.body.data.id;
    expect(res.body.data.url).toContain('/download');
  });

  it('GET /api/files 列表包含上传文件', async () => {
    const res = await request(app.getHttpServer()).get('/api/files').set(auth()).expect(200);
    expect(res.body.data.items.some((item: { id: number }) => item.id === fileId)).toBe(true);
  });

  it('GET /api/files/:id/download 可下载', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/files/${fileId}/download`)
      .set(auth())
      .expect(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('DELETE /api/files/:id 删除文件', async () => {
    await request(app.getHttpServer()).delete(`/api/files/${fileId}`).set(auth()).expect(200);
    await request(app.getHttpServer()).get(`/api/files/${fileId}`).set(auth()).expect(404);
    fileId = 0;
  });
});
