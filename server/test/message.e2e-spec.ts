import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './create-e2e-app';

describe('P2-1 Personal Messages (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let noticeId = 0;
  let messageId = 0;

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
    if (noticeId) {
      await request(app.getHttpServer()).delete(`/api/notices/${noticeId}`).set(auth());
    }
    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  it('POST /api/notices 创建草稿', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/notices')
      .set(auth())
      .send({
        title: `P2-1消息测试-${Date.now()}`,
        content: '投递测试内容',
        targetType: 'all',
        priority: 'important',
      })
      .expect(200);
    noticeId = res.body.data.id;
    expect(res.body.data.status).toBe(0);
  });

  it('PUT /api/notices/:id/publish 投递全员', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/notices/${noticeId}/publish`)
      .set(auth())
      .send({ targetType: 'all' })
      .expect(200);
    expect(res.body.data.deliveredCount).toBeGreaterThan(0);
  });

  it('GET /api/messages/unread-count', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/messages/unread-count')
      .set(auth())
      .expect(200);
    expect(res.body.data.count).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/messages/mine 未读列表', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/messages/mine?isRead=0')
      .set(auth())
      .expect(200);
    const hit = res.body.data.items.find((m: { noticeId: number }) => m.noticeId === noticeId);
    expect(hit).toBeTruthy();
    messageId = hit.id;
    expect(hit.isPopup).toBe(1);
  });

  it('PUT /api/messages/:id/read 标记已读', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/messages/${messageId}/read`)
      .set(auth())
      .expect(200);
    expect(res.body.data.isRead).toBe(1);
  });

  it('PUT /api/notices/:id/revoke 撤回公告', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/notices/${noticeId}/revoke`)
      .set(auth())
      .expect(200);
    expect(res.body.data.status).toBe(2);
  });
});
