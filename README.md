# 基础管理系统

Monorepo：`server/`（NestJS）+ `admin-web/`（React + Ant Design）。

## 快速启动

```bash
# 1. 启动 MySQL + Redis
docker-compose up -d

# 2. 后端
cd server
cp .env.development .env   # 首次
npm install
npm run start:dev

# 3. 前端（新终端）
cd admin-web
npm install
npm run dev
```

- 前端：http://localhost:5173
- 后端 API：http://localhost:3000/api
- Swagger：http://localhost:3000/api/docs

## 默认账号

- 用户名：`admin`
- 密码：`Admin@123`

## 文档

- [技术方案文档](./技术方案文档.md)
- [前后端开发规范](./前后端开发规范.md)
