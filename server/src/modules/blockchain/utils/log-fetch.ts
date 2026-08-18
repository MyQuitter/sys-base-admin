import type { Log } from 'viem';

export type RpcLogErrorKind = 'dense_block' | 'rate_limit' | 'range_limit' | 'unknown';

export interface LogFetchOptions {
  /** 每次 eth_getLogs 请求前的间隔（毫秒），降低公共节点限流概率 */
  requestDelayMs?: number;
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
    msg.includes('too many')
  );
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
  await fetchRange(fetchChunk, fromBlock, toBlock, logs, skippedBlocks, options.requestDelayMs ?? 0);
  return { logs, skippedBlocks };
}

async function fetchRange(
  fetchChunk: (fromBlock: bigint, toBlock: bigint) => Promise<Log[]>,
  fromBlock: bigint,
  toBlock: bigint,
  logs: Log[],
  skippedBlocks: bigint[],
  requestDelayMs: number,
): Promise<void> {
  if (fromBlock > toBlock) return;

  if (requestDelayMs > 0) {
    await delay(requestDelayMs);
  }

  try {
    const chunk = await fetchChunk(fromBlock, toBlock);
    logs.push(...chunk);
  } catch (err) {
    if (!isLogRangeLimitError(err) && !isRpcRateLimitError(err)) {
      throw err;
    }

    if (fromBlock >= toBlock) {
      skippedBlocks.push(fromBlock);
      return;
    }

    const mid = fromBlock + (toBlock - fromBlock) / 2n;
    await fetchRange(fetchChunk, fromBlock, mid, logs, skippedBlocks, requestDelayMs);
    await fetchRange(fetchChunk, mid + 1n, toBlock, logs, skippedBlocks, requestDelayMs);
  }
}
