import { Injectable, Logger } from '@nestjs/common';

import { createPublicClient, defineChain, http, webSocket, type Chain as ViemChain, type PublicClient } from 'viem';

import { isLogRangeLimitError, isRpcRateLimitError } from '../utils/log-fetch';

import { Chain } from '../entities/chain.entity';



export interface RpcHealthResult {

  ok: boolean;

  blockNumber?: string;

  latencyMs: number;

  rpcUrl?: string;

  error?: string;

}



/** viem PublicClient 池，按链 RPC 故障转移 */

@Injectable()

export class BlockchainRpcService {

  private readonly logger = new Logger(BlockchainRpcService.name);

  private readonly clientByUrlCache = new Map<string, PublicClient>();

  private readonly wsClientCache = new Map<number, PublicClient>();

  /** 每条链当前优先使用的 RPC 下标 */

  private readonly activeRpcIndex = new Map<number, number>();



  /** 多数 EVM 链（含 BSC 56）共用的 Multicall3；viem multicall 依赖此配置 */
  private readonly multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

  private resolveViemChain(chainId: number, rpcUrls: string[]): ViemChain {
    return defineChain({
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: rpcUrls } },
      contracts: {
        multicall3: {
          address: this.multicall3Address,
        },
      },
    });
  }



  private resolveRpcUrls(chain: Pick<Chain, 'rpcUrls'>): string[] {

    return chain.rpcUrls?.length ? chain.rpcUrls : [];

  }



  private clientCacheKey(chainId: number, rpcUrl: string): string {

    return `${chainId}::${rpcUrl}`;

  }



  getActiveRpcUrl(chain: Pick<Chain, 'chainId' | 'rpcUrls'>): string {

    const urls = this.resolveRpcUrls(chain);

    if (!urls.length) {

      throw new Error('未配置 RPC 地址');

    }

    const idx = this.activeRpcIndex.get(chain.chainId) ?? 0;

    return urls[idx % urls.length];

  }



  getClientForUrl(chain: Pick<Chain, 'chainId' | 'rpcUrls'>, rpcUrl: string): PublicClient {

    const key = this.clientCacheKey(chain.chainId, rpcUrl);

    const cached = this.clientByUrlCache.get(key);

    if (cached) return cached;



    const viemChain = this.resolveViemChain(chain.chainId, this.resolveRpcUrls(chain));

    const client = createPublicClient({

      chain: viemChain,

      transport: http(rpcUrl, { timeout: 15_000 }),

    });

    this.clientByUrlCache.set(key, client);

    return client;

  }



  /** 返回当前优先 RPC 对应的客户端 */
  getClient(chain: Pick<Chain, 'chainId' | 'rpcUrls'>): PublicClient {
    const rpcUrl = this.getActiveRpcUrl(chain);
    return this.getClientForUrl(chain, rpcUrl);
  }

  /** 日志扫描：付费 Alchemy HTTP 优先，公共节点放到最后 */
  rankRpcUrlsForLogs(urls: string[]): string[] {
    const score = (url: string): number => {
      const isAlchemy = /alchemy\.com/i.test(url);
      const isHttps = /^https:/i.test(url);
      const isPublic = /bsc-dataseed|binance\.org|publicnode\.io|defibit|ninicoin/i.test(url);
      if (isAlchemy && isHttps) return 0;
      if (isAlchemy) return 2;
      if (isPublic) return 3;
      return 1;
    };
    return [...urls].sort((a, b) => score(a) - score(b));
  }

  /**
   * 选适合 eth_getLogs 的 HTTP 客户端：优先付费 Alchemy HTTP。
   */
  getClientForLogs(chain: Pick<Chain, 'chainId' | 'rpcUrls'>): { client: PublicClient; rpcUrl: string } {
    const urls = this.resolveRpcUrls(chain);
    if (!urls.length) throw new Error('未配置 RPC 地址');
    const rpcUrl = this.rankRpcUrlsForLogs(urls)[0];
    return { client: this.getClientForUrl(chain, rpcUrl), rpcUrl };
  }



  /**
   * 仅限流类错误适合换节点重试。
   * 范围/结果集超限应交给上层二分缩小 from/to，换节点通常同样失败且会放大耗时。
   */
  isRetryableRpcError(err: unknown): boolean {
    if (isLogRangeLimitError(err)) return false;
    return isRpcRateLimitError(err);
  }



  /**

   * 遇可重试错误时轮换 RPC 节点重试（用于 eth_getLogs 等重请求）。

   * 成功后记住可用节点，供后续 getClient 复用。

   */

  async withHttpFailover<T>(

    chain: Pick<Chain, 'chainId' | 'rpcUrls'>,

    operation: (client: PublicClient, rpcUrl: string) => Promise<T>,

  ): Promise<T> {

    const urls = this.resolveRpcUrls(chain);

    if (!urls.length) {

      throw new Error('未配置 RPC 地址');

    }



    const startIdx = this.activeRpcIndex.get(chain.chainId) ?? 0;

    let lastError: unknown;



    for (let i = 0; i < urls.length; i++) {

      const idx = (startIdx + i) % urls.length;

      const rpcUrl = urls[idx];

      const client = this.getClientForUrl(chain, rpcUrl);

      try {

        const result = await operation(client, rpcUrl);

        this.activeRpcIndex.set(chain.chainId, idx);

        return result;

      } catch (err) {

        lastError = err;

        if (!this.isRetryableRpcError(err) || i === urls.length - 1) {

          throw err;

        }

        this.logger.warn(

          `RPC 请求失败，切换节点 chainId=${chain.chainId} url=${rpcUrl}: ${err instanceof Error ? err.message : String(err)}`,

        );

      }

    }



    throw lastError;

  }



  /** 获取 WebSocket 客户端；未配置 wssUrls 时返回 null */

  getWsClient(chain: Pick<Chain, 'chainId' | 'rpcUrls' | 'wssUrls'>): PublicClient | null {

    const wssUrl = chain.wssUrls?.[0];

    if (!wssUrl) return null;



    const cached = this.wsClientCache.get(chain.chainId);

    if (cached) return cached;



    const viemChain = this.resolveViemChain(chain.chainId, this.resolveRpcUrls(chain));

    const client = createPublicClient({

      chain: viemChain,

      transport: webSocket(wssUrl, { timeout: 15_000 }),

    });

    this.wsClientCache.set(chain.chainId, client);

    return client;

  }



  hasWebSocket(chain: Pick<Chain, 'wssUrls'>): boolean {

    return Boolean(chain.wssUrls?.length);

  }



  invalidateClient(chainId: number) {

    for (const key of this.clientByUrlCache.keys()) {

      if (key.startsWith(`${chainId}::`)) {

        this.clientByUrlCache.delete(key);

      }

    }

    this.activeRpcIndex.delete(chainId);

  }



  invalidateWsClient(chainId: number) {

    this.wsClientCache.delete(chainId);

  }



  async checkHealth(chain: Chain): Promise<RpcHealthResult> {

    const urls = this.resolveRpcUrls(chain);

    if (!urls.length) {

      return { ok: false, latencyMs: 0, error: '未配置 RPC 地址' };

    }



    for (const rpcUrl of urls) {

      const start = Date.now();

      try {

        const client = createPublicClient({

          chain: this.resolveViemChain(chain.chainId, [rpcUrl]),

          transport: http(rpcUrl, { timeout: 10_000 }),

        });

        const blockNumber = await client.getBlockNumber();

        return {

          ok: true,

          blockNumber: blockNumber.toString(),

          latencyMs: Date.now() - start,

          rpcUrl,

        };

      } catch (err) {

        this.logger.warn(`RPC 探活失败 chainId=${chain.chainId} url=${rpcUrl}: ${String(err)}`);

      }

    }



    return { ok: false, latencyMs: 0, error: '全部 RPC 节点不可用' };

  }

}


