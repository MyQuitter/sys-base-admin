import type { Log } from 'viem';

function toHex(value: unknown, fallback = '0x'): `0x${string}` {
  if (typeof value === 'string' && value.startsWith('0x')) return value as `0x${string}`;
  if (typeof value === 'string' && value.length) return `0x${value}` as `0x${string}`;
  return fallback as `0x${string}`;
}

function toBigIntValue(value: unknown): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === 'string' && value) {
    return value.startsWith('0x') ? BigInt(value) : BigInt(value);
  }
  return 0n;
}

function pickAddress(raw: Record<string, unknown>): string {
  if (typeof raw.address === 'string') return raw.address;
  if (typeof raw.account === 'string') return raw.account;
  const account = raw.account;
  if (account && typeof account === 'object' && 'address' in account) {
    return String((account as { address?: unknown }).address || '');
  }
  return '';
}

function pickTxHash(raw: Record<string, unknown>): unknown {
  if (raw.transactionHash) return raw.transactionHash;
  if (raw.transaction_hash) return raw.transaction_hash;
  const tx = raw.transaction;
  if (tx && typeof tx === 'object' && 'hash' in tx) {
    return (tx as { hash?: unknown }).hash;
  }
  return raw.hash;
}

function asLog(raw: Record<string, unknown>): Log | null {
  const address = pickAddress(raw);
  const topics = raw.topics;
  const data = raw.data;
  const txHash = pickTxHash(raw);
  if (!address.startsWith('0x') || !Array.isArray(topics) || typeof data !== 'string' || !txHash) {
    return null;
  }
  return {
    address: toHex(address),
    topics: topics.map((t) => toHex(t)) as Log['topics'],
    data: toHex(data),
    blockNumber: toBigIntValue(raw.blockNumber ?? raw.block_number),
    transactionHash: toHex(txHash),
    logIndex: Number(toBigIntValue(raw.logIndex ?? raw.log_index ?? raw.index ?? 0)),
    blockHash: null,
    transactionIndex: 0,
    removed: false,
  } as unknown as Log;
}

function collectFromUnknown(node: unknown, out: Record<string, unknown>[]): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const item of node) collectFromUnknown(item, out);
    return;
  }
  if (typeof node !== 'object') return;
  const rec = node as Record<string, unknown>;
  if (rec.topics && rec.data && (rec.address || rec.account)) {
    out.push(rec);
    return;
  }
  for (const key of ['logs', 'eventLogs', 'receiptLogs']) {
    if (rec[key]) collectFromUnknown(rec[key], out);
  }
  if (rec.event && typeof rec.event === 'object') {
    const event = rec.event as Record<string, unknown>;
    collectFromUnknown(event.logs, out);
    const data = event.data as Record<string, unknown> | undefined;
    const block = data?.block as Record<string, unknown> | undefined;
    const blockLogs = block?.logs;
    const blockNumber = block?.number ?? block?.blockNumber;
    if (Array.isArray(blockLogs) && blockNumber !== undefined) {
      for (const item of blockLogs) {
        if (!item || typeof item !== 'object') continue;
        collectFromUnknown(
          { ...(item as Record<string, unknown>), blockNumber: (item as Record<string, unknown>).blockNumber ?? blockNumber },
          out,
        );
      }
    } else {
      collectFromUnknown(blockLogs, out);
    }
  }
  if (rec.matchingReceipts) collectFromUnknown(rec.matchingReceipts, out);
  if (rec.receipts) collectFromUnknown(rec.receipts, out);
  if (Array.isArray(rec.data)) collectFromUnknown(rec.data, out);
}

/**
 * 把 Alchemy / QuickNode / 通用 JSON 推送解析成 viem Log。
 */
export function parseWebhookLogs(body: unknown): Log[] {
  const raw: Record<string, unknown>[] = [];
  collectFromUnknown(body, raw);
  const logs: Log[] = [];
  for (const item of raw) {
    const log = asLog(item);
    if (log) logs.push(log);
  }
  return logs;
}
