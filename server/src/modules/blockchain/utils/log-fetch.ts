import type { Log } from 'viem';

export type RpcLogErrorKind = 'dense_block' | 'rate_limit' | 'range_limit' | 'unknown';

export class LogFetchDeadlineError extends Error {
  constructor(message = 'eth_getLogs 扫描达到时间上限') {
    super(message);
    this.name = 'LogFetchDeadlineError';
  }
}

export interface LogFetchOptions {
  /** 每次 eth_getLogs 请求前的间隔（毫秒），降低公共节点限流概率 */
  requestDelayMs?: number;
  /** 墙钟截止时间（Date.now() 毫秒）；超时抛出 LogFetchDeadlineError */
  deadlineAt?: number;
}

export interface LogFetchResult {
  logs: Log[];
  /** 单区块仍超限、已跳过的区块号 */
  skippedBlocks: bigint[];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 判断是否为 RPC 区块范围/结果集超限错误 */
export function isLogRangeLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  const name = err instanceof Error ? err.name.toLowerCase() : '';
  return (
    name.includes('limitexceeded') ||
    msg.includes('limit exceeded') ||
    msg.includes('query returned more than') ||
    msg.includes('block range') ||
    msg.includes('too many') ||
    (msg.includes('up to a') && msg.includes('block'))
  );
}

/** 从 RPC 错误中解析建议的最大区块跨度（如 Alchemy Free：10） */
export function parseSuggestedLogBlockRange(err: unknown): number | null {
  const msg = err instanceof Error ? err.message : String(err);
  const m =
    msg.match(/up to a\s+(\d+)\s+block/i) ||
    msg.match(/block range.*?(\d+)\s*block/i) ||
    msg.match(/\[(0x[0-9a-f]+),\s*(0x[0-9a-f]+)\]/i);
  if (m?.[1] && m[2] && m[1].startsWith('0x')) {
    try {
      const a = BigInt(m[1]);
      const b = BigInt(m[2]);
      const span = Number(b - a + 1n);
      return span > 0 && span < 100_000 ? span : null;
    } catch {
      return null;
    }
  }
  if (m?.[1] && /^\d+$/.test(m[1])) {
    const n = parseInt(m[1], 10);
    return n > 0 && n < 100_000 ? n : null;
  }
  return null;
}

/** 判断是否为 RPC 限流 / 封禁类错误 */
export function isRpcRateLimitError(err: unknown): boolean {
  const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    msg.includes('403') ||
    msg.includes('429') ||
    msg.includes('too many requests') ||
    msg.includes('rate limit') ||
    msg.includes('forbidden')
  );
}

/** 分类 eth_getLogs 相关错误，便于日志提示 */
export function classifyRpcLogError(err: unknown): RpcLogErrorKind {
  if (err instanceof LogFetchDeadlineError) return 'unknown';
  if (isRpcRateLimitError(err)) return 'rate_limit';
  if (isLogRangeLimitError(err)) return 'range_limit';
  return 'unknown';
}

export function describeRpcLogError(kind: RpcLogErrorKind): string {
  switch (kind) {
    case 'dense_block':
      return '单区块日志过密，已跳过该区块（建议换付费 RPC 或加 topic 过滤）';
    case 'rate_limit':
      return 'RPC 限流或封禁（建议降低扫描频率或更换节点）';
    case 'range_limit':
      return '查询区块范围或结果集超限';
    default:
      return 'RPC 请求失败';
  }
}

/**
 * 串行自适应拉取 logs：遇 limit exceeded 时二分缩小范围；
 * 单区块仍失败则记入 skippedBlocks 并继续，避免整段扫描卡死。
 */
export async function fetchLogsAdaptive(
  fetchChunk: (fromBlock: bigint, toBlock: bigint) => Promise<Log[]>,
  fromBlock: bigint,
  toBlock: bigint,
  options: LogFetchOptions = {},
): Promise<LogFetchResult> {
  const logs: Log[] = [];
  const skippedBlocks: bigint[] = [];
  await fetchRange(
    fetchChunk,
    fromBlock,
    toBlock,
    logs,
    skippedBlocks,
    options.requestDelayMs ?? 0,
    options.deadlineAt,
  );
  return { logs, skippedBlocks };
}

async function fetchRange(
  fetchChunk: (fromBlock: bigint, toBlock: bigint) => Promise<Log[]>,
  fromBlock: bigint,
  toBlock: bigint,
  logs: Log[],
  skippedBlocks: bigint[],
  requestDelayMs: number,
  deadlineAt?: number,
): Promise<void> {
  if (fromBlock > toBlock) return;

  if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
    throw new LogFetchDeadlineError();
  }

  if (requestDelayMs > 0) {
    await delay(requestDelayMs);
  }

  try {
    const chunk = await fetchChunk(fromBlock, toBlock);
    logs.push(...chunk);
  } catch (err) {
    if (err instanceof LogFetchDeadlineError) throw err;

    if (!isLogRangeLimitError(err) && !isRpcRateLimitError(err)) {
      throw err;
    }

    if (fromBlock >= toBlock) {
      skippedBlocks.push(fromBlock);
      return;
    }

    // Alchemy 等会提示最大跨度：直接按提示切块，避免从 500 二分到 10 的大量失败请求
    const suggested = parseSuggestedLogBlockRange(err);
    const span = toBlock - fromBlock + 1n;
    if (suggested && BigInt(suggested) < span) {
      let cursor = fromBlock;
      const step = BigInt(suggested);
      while (cursor <= toBlock) {
        if (deadlineAt !== undefined && Date.now() >= deadlineAt) {
          throw new LogFetchDeadlineError();
        }
        const end = cursor + step - 1n > toBlock ? toBlock : cursor + step - 1n;
        await fetchRange(fetchChunk, cursor, end, logs, skippedBlocks, requestDelayMs, deadlineAt);
        cursor = end + 1n;
      }
      return;
    }

    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    await fetchRange(fetchChunk, fromBlock, mid, logs, skippedBlocks, requestDelayMs, deadlineAt);
    await fetchRange(fetchChunk, mid + 1n, toBlock, logs, skippedBlocks, requestDelayMs, deadlineAt);
  }
}
