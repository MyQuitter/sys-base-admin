import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import Redis from 'ioredis';
// viem：校验 EVM 地址格式、转 EIP-55 校验和地址、用 personal_sign 消息验签
import { getAddress, isAddress, verifyMessage } from 'viem';
import { LogService, ProtectionLogContext, RecordProtectionParams } from '../log/log.service';
import { ChainService } from '../../blockchain/services/chain.service';
import { SettingService } from '../setting/setting.service';

/** 前端拿到后交给钱包签名的一次性挑战；expiresAt 为 ISO 时间，与 Redis TTL 对齐 */
export interface WalletNonceResult {
  nonce: string;
  message: string;
  expiresAt: string;
}

/**
 * 存入 Redis 的 nonce 载荷。
 * - 纯钱包登录：仅 nonce + message
 * - both 双因子第二步：额外带 userId / loginTicket，验签时校验会话是否属于该用户
 */
interface NoncePayload {
  nonce: string;
  message: string;
  userId?: number;
  loginTicket?: string;
}

/**
 * 钱包登录与验签领域服务。
 *
 * 职责边界：
 * 1. 登录模式 / 链 ID 门禁（与站点设置联动）
 * 2. 签发待签消息（nonce）并落 Redis（防重放、带 TTL）
 * 3. both 模式下密码通过后的 loginTicket（短时凭证）
 * 4. 用 viem.verifyMessage 校验钱包签名，成功后销毁 nonce（一次性）
 *
 * 调用方：AuthService（wallet/login、wallet/complete、wallet/nonce）
 */
@Injectable()
export class WalletAuthService {
  /** 独立 Redis 连接：存 wallet-nonce:*、login-ticket:* */
  private redis: Redis;
  /** nonce 存活秒数，默认 300；过期后验签会报 WALLET_NONCE_INVALID */
  private readonly nonceTtlSeconds: number;
  /** both 模式：密码登录成功后签发的 ticket 存活秒数（固定 5 分钟） */
  private readonly ticketTtlSeconds = 300;

  constructor(
    private readonly configService: ConfigService,
    private readonly settingService: SettingService,
    private readonly logService: LogService,
    private readonly chainService: ChainService,
  ) {
    // lazyConnect：构造时不阻塞；connect 失败静默，业务侧读写时再暴露错误
    this.redis = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      lazyConnect: true,
    });
    this.redis.connect().catch(() => undefined);
    this.nonceTtlSeconds = configService.get<number>('wallet.nonceTtlSeconds') ?? 300;
  }

  /**
   * 写入防护/安全审计日志（钱包地址错误、链不匹配、验签失败等）。
   * 合并请求上下文（IP、路径、用户）便于运维排查。
   */
  private logProtection(
    ctx: ProtectionLogContext | undefined,
    params: Pick<RecordProtectionParams, 'category' | 'eventType' | 'errorCode' | 'message' | 'severity'>,
  ) {
    this.logService.recordProtection({
      ...params,
      ip: ctx?.ip,
      path: ctx?.path,
      username: ctx?.username,
      userId: ctx?.userId,
      walletAddress: ctx?.walletAddress,
    });
  }

  /**
   * 规范化钱包地址：先校验是否为合法 EVM 地址，再转为 EIP-55 checksum。
   * 后续 Redis key、验签 address 一律用校验和形式，避免大小写不一致导致 nonce 对不上。
   */
  normalizeAddress(address: string, ctx?: ProtectionLogContext): string {
    if (!isAddress(address)) {
      this.logProtection(ctx, {
        category: 'wallet',
        eventType: 'WALLET_ADDRESS_INVALID',
        errorCode: 'WALLET_ADDRESS_INVALID',
        message: '钱包地址格式无效',
        severity: 'info',
      });
      throw new UnauthorizedException({ message: '钱包地址格式无效', errorCode: 'WALLET_ADDRESS_INVALID' });
    }
    // getAddress：小写输入 → 带校验和的标准地址
    return getAddress(address);
  }

  /**
   * 门禁：站点 loginMode === 'password' 时禁止走钱包登录接口。
   * password / wallet / both 由 SettingService（站点配置）决定。
   */
  assertWalletLoginAllowed(ctx?: ProtectionLogContext) {
    const mode = this.settingService.getLoginMode();
    if (mode === 'password') {
      this.logProtection(ctx, {
        category: 'auth',
        eventType: 'LOGIN_MODE_WALLET_DISABLED',
        errorCode: 'LOGIN_MODE_WALLET_DISABLED',
        message: '当前系统未启用钱包登录',
        severity: 'info',
      });
      throw new UnauthorizedException({
        message: '当前系统未启用钱包登录',
        errorCode: 'LOGIN_MODE_WALLET_DISABLED',
      });
    }
  }

  /**
   * 门禁：站点 loginMode === 'wallet' 时禁止纯密码登录。
   * 例外：配置 auth.passwordLoginFallback=true 时可强制放开（应急/运维）。
   */
  assertPasswordLoginAllowed(ctx?: ProtectionLogContext) {
    const fallback = this.configService.get<boolean>('auth.passwordLoginFallback');
    if (fallback) return;

    const mode = this.settingService.getLoginMode();
    if (mode === 'wallet') {
      this.logProtection(ctx, {
        category: 'auth',
        eventType: 'LOGIN_MODE_PASSWORD_DISABLED',
        errorCode: 'LOGIN_MODE_PASSWORD_DISABLED',
        message: '当前系统仅支持钱包登录',
        severity: 'info',
      });
      throw new UnauthorizedException({
        message: '当前系统仅支持钱包登录',
        errorCode: 'LOGIN_MODE_PASSWORD_DISABLED',
      });
    }
  }

  /**
   * 门禁：请求中的 chainId 必须等于站点配置的钱包登录链。
   * 防止用户在错误网络上签名后被误接受；失败时提示可读的链名称。
   */
  async assertChainId(chainId: number, ctx?: ProtectionLogContext) {
    const expected = this.settingService.getWalletChainId();
    if (chainId !== expected) {
      // 优先展示链配置里的名称，没有则退回数字 chainId
      const chainLabel = (await this.chainService.getChainName(expected)) ?? String(expected);
      this.logProtection(ctx, {
        category: 'wallet',
        eventType: 'WALLET_CHAIN_MISMATCH',
        errorCode: 'WALLET_CHAIN_MISMATCH',
        message: `请在 ${chainLabel} 网络完成签名`,
        severity: 'warn',
      });
      throw new UnauthorizedException({
        message: `请在 ${chainLabel} 网络完成签名`,
        errorCode: 'WALLET_CHAIN_MISMATCH',
      });
    }
  }

  /**
   * 组装用户在钱包里看到的明文消息（personal_sign）。
   * 含站点名、链、地址、nonce、时间，便于用户确认且绑定本次挑战。
   */
  async buildSignMessage(address: string, nonce: string, chainId: number) {
    const data = this.settingService.readData();
    const chainName = (await this.chainService.getChainName(chainId)) ?? String(chainId);
    return [
      `欢迎登录 ${data.siteName}`,
      `链: ${chainName} (chainId: ${chainId})`,
      `地址: ${address}`,
      `Nonce: ${nonce}`,
      `签发时间: ${new Date().toISOString()}`,
    ].join('\n');
  }

  /** Redis key：按「链 + 校验和地址」隔离，同一地址在不同链上 nonce 互不影响 */
  private nonceKey(chainId: number, address: string) {
    return `wallet-nonce:${chainId}:${address}`;
  }

  /**
   * both 模式第一步（密码校验通过后）：签发短时 loginTicket。
   * 前端凭 ticket 再调 nonce → 签名 → wallet/complete；ticket 只存 userId。
   */
  async createLoginTicket(userId: number) {
    const ticket = randomBytes(24).toString('hex');
    // EX：过期自动删除，避免长期有效的「半登录」凭证
    await this.redis.set(`login-ticket:${ticket}`, String(userId), 'EX', this.ticketTtlSeconds);
    const expiresAt = new Date(Date.now() + this.ticketTtlSeconds * 1000).toISOString();
    return { loginTicket: ticket, expiresAt };
  }

  /**
   * 校验 ticket 是否仍有效（不删除）。
   * 用于仅查询绑定用户、或 createNonceForTicket 前窥探。
   */
  async validateLoginTicket(ticket: string, ctx?: ProtectionLogContext): Promise<number> {
    const userId = await this.redis.get(`login-ticket:${ticket}`);
    if (!userId) {
      this.logProtection(ctx, {
        category: 'auth',
        eventType: 'LOGIN_TICKET_INVALID',
        errorCode: 'LOGIN_TICKET_INVALID',
        message: '登录凭证无效或已过期',
        severity: 'warn',
      });
      throw new UnauthorizedException({ message: '登录凭证无效或已过期', errorCode: 'LOGIN_TICKET_INVALID' });
    }
    return Number(userId);
  }

  /** 主动作废 ticket（例如用户放弃第二步、或安全策略强制失效） */
  async releaseLoginTicket(ticket: string) {
    await this.redis.del(`login-ticket:${ticket}`);
  }

  /**
   * 消费 ticket：读出 userId 后立即删除（一次性）。
   * 用于 wallet/complete 成功路径，防止同一 ticket 重复完成登录。
   */
  async consumeLoginTicket(ticket: string, ctx?: ProtectionLogContext): Promise<number> {
    const key = `login-ticket:${ticket}`;
    const userId = await this.redis.get(key);
    if (!userId) {
      this.logProtection(ctx, {
        category: 'auth',
        eventType: 'LOGIN_TICKET_INVALID',
        errorCode: 'LOGIN_TICKET_INVALID',
        message: '登录凭证无效或已过期',
        severity: 'warn',
      });
      throw new UnauthorizedException({ message: '登录凭证无效或已过期', errorCode: 'LOGIN_TICKET_INVALID' });
    }
    // 先读后删：成功路径保证 ticket 不可复用
    await this.redis.del(key);
    return Number(userId);
  }

  /**
   * 为指定地址签发签名挑战（纯钱包登录或带可选会话绑定）。
   * 流程：校验链 → 规范化地址 → 生成随机 nonce → 拼消息 → 写入 Redis（带 TTL）→ 返回给前端。
   */
  async createNonceForAddress(
    address: string,
    chainId: number,
    options?: { userId?: number; loginTicket?: string },
    ctx?: ProtectionLogContext,
  ) {
    // 1. 链必须与站点配置一致
    await this.assertChainId(chainId, ctx);
    // 2. 非法地址直接拒绝；合法则转 checksum
    const checksum = this.normalizeAddress(address, ctx);
    // 3. 高熵随机串，作为本次挑战的唯一标识（也嵌在 message 里）
    const nonce = randomBytes(16).toString('hex');
    // 4. 用户实际签名的是整段 message，不是裸 nonce
    const message = await this.buildSignMessage(checksum, nonce, chainId);
    // 5. options 在 both 模式下写入 userId/loginTicket，供验签时比对会话
    const payload: NoncePayload = { nonce, message, ...options };
    await this.redis.set(this.nonceKey(chainId, checksum), JSON.stringify(payload), 'EX', this.nonceTtlSeconds);
    const expiresAt = new Date(Date.now() + this.nonceTtlSeconds * 1000).toISOString();
    return { nonce, message, expiresAt };
  }

  /**
   * both 模式：已有 loginTicket 时发 nonce。
   * 先 peek ticket 得到 userId（不消费 ticket），再把 userId/ticket 绑进 nonce 载荷。
   */
  async createNonceForTicket(loginTicket: string, address: string, chainId: number, ctx?: ProtectionLogContext) {
    const userId = await this.peekLoginTicket(loginTicket, ctx);
    return this.createNonceForAddress(address, chainId, { userId, loginTicket }, { ...ctx, userId });
  }

  /** 仅读取 ticket 对应 userId，不删除（发 nonce 阶段仍需保留 ticket 给 complete 用） */
  private async peekLoginTicket(ticket: string, ctx?: ProtectionLogContext): Promise<number> {
    const userId = await this.redis.get(`login-ticket:${ticket}`);
    if (!userId) {
      this.logProtection(ctx, {
        category: 'auth',
        eventType: 'LOGIN_TICKET_INVALID',
        errorCode: 'LOGIN_TICKET_INVALID',
        message: '登录凭证无效或已过期',
        severity: 'warn',
      });
      throw new UnauthorizedException({ message: '登录凭证无效或已过期', errorCode: 'LOGIN_TICKET_INVALID' });
    }
    return Number(userId);
  }

  /**
   * 核心验签：确认 signature 是否由 address 对 Redis 中保存的 message 做的合法 personal_sign。
   *
   * @param address 声称的签名者地址
   * @param signature 钱包返回的签名十六进制串
   * @param chainId 签名时所在链（须与站点配置一致）
   * @param expectedUserId both 模式传入：须与 nonce 载荷里的 userId 一致
   * @returns checksum 地址 + 原始 nonce 载荷（调用方可继续做业务绑定）
   */
  async verifySignature(
    address: string,
    signature: string,
    chainId: number,
    expectedUserId?: number,
    ctx?: ProtectionLogContext,
  ) {
    // —— 1. 链与地址门禁 ——
    await this.assertChainId(chainId, ctx);
    const checksum = this.normalizeAddress(address, ctx);

    // —— 2. 取回本次挑战；没有则视为过期或未申请 nonce ——
    const raw = await this.redis.get(this.nonceKey(chainId, checksum));
    if (!raw) {
      this.logProtection({ ...ctx, walletAddress: checksum }, {
        category: 'wallet',
        eventType: 'WALLET_NONCE_INVALID',
        errorCode: 'WALLET_NONCE_INVALID',
        message: '签名已过期，请重新获取',
        severity: 'warn',
      });
      throw new UnauthorizedException({ message: '签名已过期，请重新获取', errorCode: 'WALLET_NONCE_INVALID' });
    }

    const payload = JSON.parse(raw) as NoncePayload;

    // —— 3. 密码学验签：从 signature 恢复/校验是否由 checksum 对 payload.message 签名 ——
    // verifyMessage 内部对应 eth_personal_sign（EIP-191）语义
    const valid = await verifyMessage({
      address: checksum as `0x${string}`,
      message: payload.message,
      signature: signature as `0x${string}`,
    });
    if (!valid) {
      this.logProtection({ ...ctx, walletAddress: checksum }, {
        category: 'wallet',
        eventType: 'WALLET_SIGNATURE_INVALID',
        errorCode: 'WALLET_SIGNATURE_INVALID',
        message: '钱包签名无效',
        severity: 'warn',
      });
      throw new UnauthorizedException({ message: '钱包签名无效', errorCode: 'WALLET_SIGNATURE_INVALID' });
    }

    // —— 4. both 模式：防止用 A 用户的 ticket 去验 B 用户绑定的 nonce ——
    if (expectedUserId !== undefined && payload.userId !== undefined && payload.userId !== expectedUserId) {
      this.logProtection({ ...ctx, userId: expectedUserId, walletAddress: checksum }, {
        category: 'auth',
        eventType: 'LOGIN_TICKET_INVALID',
        errorCode: 'LOGIN_TICKET_INVALID',
        message: '签名会话不匹配',
        severity: 'warn',
      });
      throw new UnauthorizedException({ message: '签名会话不匹配', errorCode: 'LOGIN_TICKET_INVALID' });
    }

    // —— 5. 一次性：验签成功立即删 nonce，防止同一签名重放登录 ——
    await this.redis.del(this.nonceKey(chainId, checksum));
    return { checksum, payload };
  }
}
