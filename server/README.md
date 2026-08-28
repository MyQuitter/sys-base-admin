# server（NestJS 后端）

基础管理系统 API 服务。全局前缀 `/api`，默认端口 `3000`。

相关文档：[根 README](../README.md) · [技术方案 §9 部署](../doc/技术方案文档.md) · [前后端开发规范 §6](../doc/前后端开发规范.md)

## 环境要求

| 组件 | 版本 |
|------|------|
| Node.js | >= 20 |
| MySQL | >= 8.0 |
| Redis | >= 7.0 |

## 本地开发

仓库根目录启动 MySQL / Redis：

```bash
docker-compose up -d
# MySQL → localhost:3307，账号 root/root，库 sys_base
# Redis → localhost:6380
```

```bash
cd server
cp .env.development .env   # 首次；按需修改密钥与连接
npm install
npm run start:dev
```

| 地址 | 说明 |
|------|------|
| http://localhost:3000/api | API |
| http://localhost:3000/api/docs | Swagger |
| `GET /api/health` | 健康检查（MySQL / Redis / 进程） |

默认管理员：`admin` / `Admin@123`（登录后请到个人中心修改密码）。

开发环境 `NODE_ENV=development` 时 TypeORM `synchronize: true` 会自动同步表结构；**生产禁止开启**。

## 生产部署

### 1. 准备服务器

- 安装 Node.js 20+、Nginx（或其它反向代理）
- 准备 MySQL、Redis（本机、Docker 或云托管）
- 后端建议仅本机监听 `3000`，对外只暴露 80/443

### 2. 拉取代码并安装依赖

```bash
git clone <repo-url> /opt/base
cd /opt/base/server
npm ci
```

### 3. 配置环境变量

应用会按顺序加载 `.env.${NODE_ENV}` 与 `.env`（见 `app.module.ts`）。生产请设置 `NODE_ENV=production`，并配置例如：

```bash
NODE_ENV=production
PORT=3000

DB_HOST=<mysql-host>
DB_PORT=3306
DB_USERNAME=<user>
DB_PASSWORD=<password>
DB_DATABASE=sys_base

REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

JWT_SECRET=<至少32位随机串>
JWT_ACCESS_TOKEN_EXPIRES_IN=15m
JWT_REFRESH_TOKEN_EXPIRES_IN=7d

CORS_ORIGINS=https://your-admin.example.com
```

注意：

- **禁止**将含密钥的 `.env` / `.env.production` 提交到 Git
- 生产环境 **禁止** `synchronize: true`（仅在 `development` 自动开启）
- 表结构变更使用 `server/scripts/*.sql` 手动执行或纳入运维流程
- Refresh Token 使用 HttpOnly Cookie；生产 Cookie 为 `secure`，需 HTTPS

### 4. 初始化数据库

1. 创建库 `sys_base`（字符集 `utf8mb4`）
2. 按需执行 `server/scripts/` 下 SQL（增量功能脚本）
3. 首次启动后 RBAC 种子会创建默认管理员（库为空时）；立即修改默认密码

### 5. 构建并启动

```bash
cd /opt/base/server
npm run build
NODE_ENV=production npm run start:prod
# 等价：node dist/main
```

推荐 PM2 常驻：

```bash
npm i -g pm2
cd /opt/base/server
NODE_ENV=production pm2 start dist/main --name base-api
pm2 save && pm2 startup
```

### 6. Nginx 反向代理（与前端同域）

前端先构建：`cd admin-web && npm ci && npm run build`（生产 `VITE_API_BASE_URL=/api`）。

```nginx
server {
    listen 80;
    server_name your-admin.example.com;
    root /opt/base/admin-web/dist;
    index index.html;

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 20m;   # 与 UPLOAD_MAX_SIZE 对齐
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

生产建议全站 HTTPS（证书由 Let’s Encrypt 或云厂商配置）。

### 7. 发布后检查

```bash
curl -s http://127.0.0.1:3000/api/health
# 或经域名：curl -s https://your-admin.example.com/api/health
```

- 确认 CORS、`CORS_ORIGINS` 与前端域名一致
- Swagger（`/api/docs`）生产可按需关闭或限制内网访问

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run start:dev` | 开发热重载 |
| `npm run build` | 编译到 `dist/` |
| `npm run start:prod` | 生产启动（`node dist/main`） |
| `npm run lint` | ESLint |
| `npm test` | 单元测试 |

## 目录说明（简要）

```
server/
├── src/
│   ├── modules/base/       # 认证、用户、菜单、RBAC 等
│   ├── modules/member/     # C 端会员
│   ├── modules/blockchain/ # 链 / 合约 / 交易 / 事件
│   ├── modules/crm-whitelist/
│   └── config/             # 环境变量映射
├── scripts/                # 生产侧增量 SQL
└── dist/                   # build 产物
```
