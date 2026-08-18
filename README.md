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

开发与技术方案文档统一放在 [`doc/`](./doc/)：

- [技术方案文档](./doc/技术方案文档.md)
- [前后端开发规范](./doc/前后端开发规范.md)
- [架构分层说明](./doc/架构分层说明.md)
- [区块链系统方案](./doc/区块链系统方案.md)
- [Web3钱包登录方案](./doc/Web3钱包登录方案.md)
- [C端用户管理方案](./doc/C端用户管理方案.md)
- [开发规则与技术栈](./doc/开发规则与技术栈.md)（已合并至前后端开发规范，保留跳转）
