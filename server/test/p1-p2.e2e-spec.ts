import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createE2eApp } from './create-e2e-app';

/** 测试过程创建的实体 ID，afterAll 统一清理 */
const ctx = {
  suffix: Date.now(),
  permissionId: 0,
  roleId: 0,
  roleDefaultPermCount: 0,
  userId: 0,
  menuId: 0,
  departmentId: 0,
  positionId: 0,
  dictTypeId: 0,
  dictDataId: 0,
  noticeId: 0,
  messageId: 0,
};

describe('P1+P2 RBAC & Business (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  beforeAll(async () => {
    app = await createE2eApp();
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' })
      .expect(200);
    accessToken = login.body.data.accessToken;
    expect(accessToken).toBeTruthy();
    expect(login.body.data.userInfo.permissions.length).toBeGreaterThan(0);
  });

  afterAll(async () => {
    const auth = () => ({ Authorization: `Bearer ${accessToken}` });
    const server = app.getHttpServer();

    if (ctx.noticeId) await request(server).delete(`/api/notices/${ctx.noticeId}`).set(auth());
    if (ctx.dictDataId) await request(server).delete(`/api/dict/data/${ctx.dictDataId}`).set(auth());
    if (ctx.dictTypeId) await request(server).delete(`/api/dict/types/${ctx.dictTypeId}`).set(auth());
    if (ctx.userId) await request(server).delete(`/api/users/${ctx.userId}`).set(auth());
    if (ctx.positionId) await request(server).delete(`/api/positions/${ctx.positionId}`).set(auth());
    if (ctx.departmentId) await request(server).delete(`/api/departments/${ctx.departmentId}`).set(auth());
    if (ctx.menuId) await request(server).delete(`/api/menus/${ctx.menuId}`).set(auth());
    if (ctx.roleId) await request(server).delete(`/api/roles/${ctx.roleId}`).set(auth());
    if (ctx.permissionId) await request(server).delete(`/api/permissions/${ctx.permissionId}`).set(auth());

    await app.close();
  });

  const auth = () => ({ Authorization: `Bearer ${accessToken}` });

  // ── P1 认证 ──────────────────────────────────────────────

  describe('P1 认证', () => {
    it('GET /api/auth/me 获取当前用户', async () => {
      const res = await request(app.getHttpServer()).get('/api/auth/me').set(auth()).expect(200);
      expect(res.body.data.username).toBe('admin');
    });

    it('GET /api/users 无 Token 返回 401', async () => {
      await request(app.getHttpServer()).get('/api/users').expect(401);
    });

    it('GET /api/menus/tree 返回菜单树', async () => {
      const res = await request(app.getHttpServer()).get('/api/menus/tree').set(auth()).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ── P1 权限 ──────────────────────────────────────────────

  describe('P1 权限管理', () => {
    it('GET /api/permissions 列表', async () => {
      const res = await request(app.getHttpServer()).get('/api/permissions').set(auth()).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/permissions 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/permissions')
        .set(auth())
        .send({
          code: `e2e:perm:${ctx.suffix}`,
          name: 'E2E测试权限',
          module: 'e2e',
        })
        .expect(200);
      ctx.permissionId = res.body.data.id;
      expect(ctx.permissionId).toBeGreaterThan(0);
    });

    it('PUT /api/permissions/:id 更新', async () => {
      await request(app.getHttpServer())
        .put(`/api/permissions/${ctx.permissionId}`)
        .set(auth())
        .send({ name: 'E2E测试权限-已更新' })
        .expect(200);
    });
  });

  // ── P1 角色 ──────────────────────────────────────────────

  describe('P1 角色管理', () => {
    it('GET /api/roles 列表', async () => {
      const res = await request(app.getHttpServer()).get('/api/roles').set(auth()).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/roles 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/roles')
        .set(auth())
        .send({
          code: `e2e_role_${ctx.suffix}`,
          name: 'E2E测试角色',
          description: '自动化测试',
        })
        .expect(200);
      ctx.roleId = res.body.data.id;
    });

    it('GET /api/roles/menu-options 可分配菜单', async () => {
      const res = await request(app.getHttpServer()).get('/api/roles/menu-options').set(auth()).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    it('POST /api/roles/:id/permissions 未分配菜单时拒绝', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/roles/${ctx.roleId}/permissions`)
        .set(auth())
        .send({ permissionIds: [ctx.permissionId] })
        .expect(400);
      expect(res.body.errorCode).toBe('MENU_REQUIRED');
    });

    it('POST /api/roles/:id/menus 分配菜单后默认授予栏目权限', async () => {
      const options = await request(app.getHttpServer()).get('/api/roles/menu-options').set(auth()).expect(200);
      const menuIds = (options.body.data as { id: number; permissionCode?: string }[])
        .filter((m) => m.permissionCode)
        .slice(0, 3)
        .map((m) => m.id);
      const res = await request(app.getHttpServer())
        .post(`/api/roles/${ctx.roleId}/menus`)
        .set(auth())
        .send({ menuIds })
        .expect(200);
      expect(res.body.data.menuRestricted).toBe(true);
      expect(res.body.data.menus?.length).toBe(menuIds.length);
      expect(res.body.data.permissions?.length).toBeGreaterThan(0);
      ctx.roleDefaultPermCount = res.body.data.permissions.length;
    });

    it('POST /api/roles/:id/permissions 可在菜单栏目内微调', async () => {
      const detail = await request(app.getHttpServer()).get(`/api/roles/${ctx.roleId}`).set(auth()).expect(200);
      const firstId = detail.body.data.permissions[0].id as number;
      const res = await request(app.getHttpServer())
        .post(`/api/roles/${ctx.roleId}/permissions`)
        .set(auth())
        .send({ permissionIds: [firstId] })
        .expect(200);
      expect(res.body.data.permissions).toHaveLength(1);
      expect(res.body.data.permissions[0].id).toBe(firstId);
    });

    it('POST /api/roles/:id/permissions 空列表默认栏目下全部权限', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/roles/${ctx.roleId}/permissions`)
        .set(auth())
        .send({ permissionIds: [] })
        .expect(200);
      expect(res.body.data.permissions.length).toBe(ctx.roleDefaultPermCount);
    });

    it('GET /api/roles/:id 详情含权限', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/roles/${ctx.roleId}`)
        .set(auth())
        .expect(200);
      expect(res.body.data.permissions?.length).toBeGreaterThan(0);
    });
  });

  // ── P1 用户 ──────────────────────────────────────────────

  describe('P1 用户管理', () => {
    it('GET /api/users 分页', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/users?page=1&pageSize=10')
        .set(auth())
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
    });

    it('POST /api/users 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/users')
        .set(auth())
        .send({
          username: `e2e_user_${ctx.suffix}`,
          password: 'Test@123456',
          nickname: 'E2E用户',
          roleIds: [ctx.roleId],
        })
        .expect(200);
      ctx.userId = res.body.data.id;
    });

    it('PUT /api/users/:id 更新', async () => {
      await request(app.getHttpServer())
        .put(`/api/users/${ctx.userId}`)
        .set(auth())
        .send({ nickname: 'E2E用户-已更新', username: `e2e_user_${ctx.suffix}` })
        .expect(200);
    });

    it('POST /api/users/:id/reset-password 重置密码', async () => {
      await request(app.getHttpServer())
        .post(`/api/users/${ctx.userId}/reset-password`)
        .set(auth())
        .send({ password: 'Reset@123456' })
        .expect(200);
    });

    it('DELETE /api/users/:id 最后一名用户不可删除', async () => {
      if (ctx.userId) {
        await request(app.getHttpServer()).delete(`/api/users/${ctx.userId}`).set(auth()).expect(200);
        ctx.userId = 0;
      }
      const list = await request(app.getHttpServer())
        .get('/api/users?page=1&pageSize=1')
        .set(auth())
        .expect(200);
      if (list.body.data.total !== 1) return;

      const lastId = list.body.data.items[0].id;
      const res = await request(app.getHttpServer()).delete(`/api/users/${lastId}`).set(auth()).expect(400);
      expect(res.body.message).toContain('至少保留');
    });
  });

  // ── P1 菜单 ──────────────────────────────────────────────

  describe('P1 菜单管理', () => {
    it('GET /api/menus 列表', async () => {
      const res = await request(app.getHttpServer()).get('/api/menus').set(auth()).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/menus 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/menus')
        .set(auth())
        .send({
          name: 'E2E测试菜单',
          path: `/e2e/test-${ctx.suffix}`,
          sort: 99,
          status: 1,
        })
        .expect(200);
      ctx.menuId = res.body.data.id;
    });

    it('PUT /api/menus/:id 更新', async () => {
      await request(app.getHttpServer())
        .put(`/api/menus/${ctx.menuId}`)
        .set(auth())
        .send({ name: 'E2E测试菜单-已更新' })
        .expect(200);
    });
  });

  // ── P2 部门 ──────────────────────────────────────────────

  describe('P2 部门管理', () => {
    it('GET /api/departments/tree 部门树', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/departments/tree')
        .set(auth())
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/departments 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/departments')
        .set(auth())
        .send({
          name: 'E2E测试部门',
          code: `e2e_dept_${ctx.suffix}`,
          sort: 0,
          status: 1,
        })
        .expect(200);
      ctx.departmentId = res.body.data.id;
    });

    it('PUT /api/departments/:id 更新', async () => {
      await request(app.getHttpServer())
        .put(`/api/departments/${ctx.departmentId}`)
        .set(auth())
        .send({ name: 'E2E测试部门-已更新' })
        .expect(200);
    });
  });

  // ── P2 岗位 ──────────────────────────────────────────────

  describe('P2 岗位管理', () => {
    it('GET /api/positions 分页', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/positions?page=1&pageSize=10')
        .set(auth())
        .expect(200);
      expect(res.body.data).toHaveProperty('items');
    });

    it('POST /api/positions 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/positions')
        .set(auth())
        .send({
          code: `e2e_pos_${ctx.suffix}`,
          name: 'E2E测试岗位',
          sort: 0,
          status: 1,
        })
        .expect(200);
      ctx.positionId = res.body.data.id;
    });

    it('PUT /api/positions/:id 更新', async () => {
      await request(app.getHttpServer())
        .put(`/api/positions/${ctx.positionId}`)
        .set(auth())
        .send({ name: 'E2E测试岗位-已更新' })
        .expect(200);
    });
  });

  // ── P2 字典 ──────────────────────────────────────────────

  describe('P2 字典管理', () => {
    it('GET /api/dict/types 类型列表', async () => {
      const res = await request(app.getHttpServer()).get('/api/dict/types').set(auth()).expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('POST /api/dict/types 创建类型', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/dict/types')
        .set(auth())
        .send({
          code: `e2e_dict_${ctx.suffix}`,
          name: 'E2E字典类型',
          status: 1,
        })
        .expect(200);
      ctx.dictTypeId = res.body.data.id;
    });

    it('POST /api/dict/data 创建数据', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/dict/data')
        .set(auth())
        .send({
          typeId: ctx.dictTypeId,
          label: '选项A',
          value: 'a',
          sort: 0,
          status: 1,
        })
        .expect(200);
      ctx.dictDataId = res.body.data.id;
    });

    it('GET /api/dict/data 按类型查询', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/dict/data?typeId=${ctx.dictTypeId}`)
        .set(auth())
        .expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
    });
  });

  // ── P2 公告 ──────────────────────────────────────────────

  describe('P2 系统公告', () => {
    it('GET /api/notices 分页', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/notices?page=1&pageSize=10')
        .set(auth())
        .expect(200);
      expect(res.body.data).toHaveProperty('items');
    });

    it('POST /api/notices 创建', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/notices')
        .set(auth())
        .send({
          title: `E2E公告-${ctx.suffix}`,
          content: '测试内容',
        })
        .expect(200);
      ctx.noticeId = res.body.data.id;
    });

    it('PUT /api/notices/:id 更新草稿', async () => {
      await request(app.getHttpServer())
        .put(`/api/notices/${ctx.noticeId}`)
        .set(auth())
        .send({ title: `E2E公告-已更新` })
        .expect(200);
    });

    it('PUT /api/notices/:id/publish 发布并投递', async () => {
      const res = await request(app.getHttpServer())
        .put(`/api/notices/${ctx.noticeId}/publish`)
        .set(auth())
        .send({ targetType: 'all' })
        .expect(200);
      expect(res.body.data.deliveredCount).toBeGreaterThan(0);
    });

    it('GET /api/messages/unread-count 有未读', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/messages/unread-count')
        .set(auth())
        .expect(200);
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('GET /api/messages/mine 我的消息', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/messages/mine?page=1&pageSize=10')
        .set(auth())
        .expect(200);
      expect(res.body.data.items.length).toBeGreaterThan(0);
      ctx.messageId = res.body.data.items[0].id;
    });

    it('GET /api/messages/:id 详情标已读', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/messages/${ctx.messageId}`)
        .set(auth())
        .expect(200);
      expect(res.body.data.isRead).toBe(1);
    });
  });

  // ── P2 个人中心 ──────────────────────────────────────────────

  describe('P2 个人中心', () => {
    const originalNickname = '管理员';

    it('PUT /api/auth/profile 更新昵称', async () => {
      await request(app.getHttpServer())
        .put('/api/auth/profile')
        .set(auth())
        .send({ nickname: 'E2E昵称' })
        .expect(200);

      const me = await request(app.getHttpServer()).get('/api/auth/me').set(auth()).expect(200);
      expect(me.body.data.nickname).toBe('E2E昵称');
    });

    it('PUT /api/auth/profile 恢复昵称', async () => {
      await request(app.getHttpServer())
        .put('/api/auth/profile')
        .set(auth())
        .send({ nickname: originalNickname })
        .expect(200);
    });

    it('PUT /api/auth/password 修改密码（测试用户）', async () => {
      // P1 末尾会删掉 e2e 用户，这里单独再建一个用于改密
      const created = await request(app.getHttpServer())
        .post('/api/users')
        .set(auth())
        .send({
          username: `e2e_pwd_${ctx.suffix}`,
          password: 'Test@123456',
          nickname: 'E2E改密',
          roleIds: [ctx.roleId],
        })
        .expect(200);
      ctx.userId = created.body.data.id;

      const login = await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: `e2e_pwd_${ctx.suffix}`, password: 'Test@123456' })
        .expect(200);
      const userToken = login.body.data.accessToken;

      await request(app.getHttpServer())
        .put('/api/auth/password')
        .set({ Authorization: `Bearer ${userToken}` })
        .send({ oldPassword: 'Test@123456', newPassword: 'NewPass@123' })
        .expect(200);

      await request(app.getHttpServer())
        .post('/api/auth/login')
        .send({ username: `e2e_pwd_${ctx.suffix}`, password: 'NewPass@123' })
        .expect(200);
    });
  });
});
