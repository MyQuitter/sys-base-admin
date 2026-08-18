/**
 * 应用配置：从环境变量读取，供 ConfigService 注入各模块。
 * 开发环境优先加载 `.env.development`，见 app.module.ts 的 envFilePath。
 */
export default () => ({
  /** HTTP 监听端口，对应环境变量 PORT */
  port: parseInt(process.env.PORT ?? '3000', 10),
  /** 运行环境：development / production / test */
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** 允许跨域的前端源，多个用逗号分隔（CORS_ORIGINS） */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173').split(','),

  /** MySQL 连接（Docker 开发默认 3307 映射，见 docker-compose.yml） */
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    username: process.env.DB_USERNAME ?? 'root',
    password: process.env.DB_PASSWORD ?? 'root',
    database: process.env.DB_DATABASE ?? 'sys_base',
  },

  /** Redis：Refresh Token 校验、在线用户等（Docker 开发默认 6380 映射） */
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB ?? '0', 10),
  },

  /** JWT：Access Token 走响应体，Refresh Token 走 HttpOnly Cookie */
  jwt: {
    secret: process.env.JWT_SECRET ?? 'dev-secret-key-must-be-at-least-32-characters-long',
    accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN ?? '15m',
    refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN ?? '7d',
    refreshCookieName: 'refresh_token',
  },

  /** 密码 bcrypt 哈希轮数，越高越慢越安全 */
  bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS ?? '10', 10),

  /** 通用文件上传：存储目录、大小上限、MIME 白名单 */
  upload: {
    dest: process.env.UPLOAD_DEST ?? 'uploads',
    maxSize: parseInt(process.env.UPLOAD_MAX_SIZE ?? String(10 * 1024 * 1024), 10),
    allowedMime: (process.env.UPLOAD_ALLOWED_MIME ??
      'image/jpeg,image/png,image/gif,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  },

  /** 系统设置：站点名称/Logo 等 JSON 配置与 branding 图片目录（不入库） */
  siteSetting: {
    configPath: process.env.SITE_SETTING_PATH ?? 'data/site.setting.json',
    brandingDir: process.env.SITE_BRANDING_DIR ?? 'data/branding',
  },

  /** 钱包登录：nonce TTL、运维密码登录兜底 */
  wallet: {
    nonceTtlSeconds: parseInt(process.env.WALLET_NONCE_TTL_SECONDS ?? '300', 10),
  },
  auth: {
    passwordLoginFallback: process.env.AUTH_PASSWORD_LOGIN_FALLBACK === 'true',
    /** 连续密码登录失败上限，默认 5 次 */
    loginMaxAttempts: parseInt(process.env.AUTH_LOGIN_MAX_ATTEMPTS ?? '5', 10),
    /** 超限后锁定分钟数，默认 15 分钟 */
    loginLockoutMinutes: parseInt(process.env.AUTH_LOGIN_LOCKOUT_MINUTES ?? '15', 10),
  },

  /** C 端会员 JWT 与 Refresh Cookie */
  member: {
    jwtAccessExpiresIn: process.env.MEMBER_JWT_ACCESS_EXPIRES_IN ?? '7d',
    jwtRefreshExpiresIn: process.env.MEMBER_JWT_REFRESH_EXPIRES_IN ?? '30d',
    refreshCookieName: 'member_refresh_token',
  },

  /** 区块链：后台不定时轮询 */
  blockchain: {
    /** 全局浏览器 API Key，也可按链设置 BC_EXPLORER_API_KEY_56 等 */
    explorerApiKey: process.env.BC_EXPLORER_API_KEY || undefined,
    explorerApiKeys: Object.fromEntries(
      Object.entries(process.env)
        .filter(([key]) => key.startsWith('BC_EXPLORER_API_KEY_'))
        .map(([key, value]) => [key.replace('BC_EXPLORER_API_KEY_', ''), value]),
    ),
    eventSync: {
      /** 调度心跳最小间隔（毫秒） */
      tickMinMs: parseInt(process.env.BC_EVENT_SYNC_TICK_MIN_MS ?? '3000', 10),
      /** 调度心跳最大间隔（毫秒） */
      tickMaxMs: parseInt(process.env.BC_EVENT_SYNC_TICK_MAX_MS ?? '10000', 10),
      /** 单次扫描后下次扫描最小间隔（毫秒） */
      pollMinMs: parseInt(process.env.BC_EVENT_SYNC_POLL_MIN_MS ?? '15000', 10),
      /** 单次扫描后下次扫描最大间隔（毫秒） */
      pollMaxMs: parseInt(process.env.BC_EVENT_SYNC_POLL_MAX_MS ?? '45000', 10),
      /** 每个调度周期最多处理的订阅数 */
      maxPerTick: parseInt(process.env.BC_EVENT_SYNC_MAX_PER_TICK ?? '3', 10),
      /** 链配置了 wssUrls 时启用 WebSocket 推送 */
      useWebSocket: process.env.BC_EVENT_SYNC_USE_WS !== 'false',
      /** eth_getLogs 单次最大区块跨度（公共 RPC 常限制 500～2000） */
      logChunkSize: parseInt(process.env.BC_EVENT_SYNC_LOG_CHUNK_SIZE ?? '500', 10),
      logChunkByChain: Object.fromEntries(
        Object.entries(process.env)
          .filter(
            (entry): entry is [string, string] =>
              entry[0].startsWith('BC_EVENT_SYNC_LOG_CHUNK_SIZE_') && entry[1] !== undefined,
          )
          .map(([key, value]) => [key.replace('BC_EVENT_SYNC_LOG_CHUNK_SIZE_', ''), parseInt(value, 10)]),
      ),
      /** 每次 eth_getLogs 前的间隔（毫秒），降低公共节点限流 */
      logRequestDelayMs: parseInt(process.env.BC_EVENT_SYNC_LOG_REQUEST_DELAY_MS ?? '200', 10),
    },
    txSync: {
      tickMinMs: parseInt(process.env.BC_TX_SYNC_TICK_MIN_MS ?? '2000', 10),
      tickMaxMs: parseInt(process.env.BC_TX_SYNC_TICK_MAX_MS ?? '8000', 10),
      pollMinMs: parseInt(process.env.BC_TX_SYNC_POLL_MIN_MS ?? '8000', 10),
      pollMaxMs: parseInt(process.env.BC_TX_SYNC_POLL_MAX_MS ?? '25000', 10),
      maxPerTick: parseInt(process.env.BC_TX_SYNC_MAX_PER_TICK ?? '5', 10),
    },
  },
});
