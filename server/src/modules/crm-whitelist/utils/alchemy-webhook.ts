import { createHmac, timingSafeEqual } from 'crypto';

const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function addTxHash(hashes: Set<string>, value: unknown) {
  if (typeof value === 'string' && TX_HASH_RE.test(value)) {
    hashes.add(value.toLowerCase());
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Alchemy Notify：HMAC-SHA256(原始 body) 的 hex，头为 X-Alchemy-Signature */
export function verifyAlchemySignature(
  rawBody: Buffer | string | undefined,
  signature: string | undefined,
  signingKey: string,
): boolean {
  if (!rawBody || !signature || !signingKey) return false;
  const sig = signature.trim().replace(/^0x/i, '').toLowerCase();
  if (!/^[0-9a-f]+$/.test(sig)) return false;
  const hmac = createHmac('sha256', signingKey);
  if (typeof rawBody === 'string') hmac.update(rawBody, 'utf8');
  else hmac.update(rawBody);
  const digest = hmac.digest('hex');
  try {
    const a = Buffer.from(digest, 'utf8');
    const b = Buffer.from(sig, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function isAlchemyActivityPayload(body: unknown): boolean {
  const type = String(asRecord(body)?.type || '').toUpperCase();
  return (
    type === 'ADDRESS_ACTIVITY' ||
    type === 'MINED_TRANSACTION' ||
    type === 'NFT_ACTIVITY' ||
    type === 'DROPPED_TRANSACTION'
  );
}

/** 从 Alchemy Address Activity / Mined Tx 等载荷收集交易哈希 */
export function extractAlchemyTxHashes(body: unknown): string[] {
  const hashes = new Set<string>();
  const root = asRecord(body);
  if (!root) return [];
  const event = asRecord(root.event);
  const activity = event?.activity;
  if (Array.isArray(activity)) {
    for (const item of activity) {
      const rec = asRecord(item);
      if (!rec) continue;
      addTxHash(hashes, rec.hash);
      addTxHash(hashes, rec.transactionHash);
    }
  }
  const tx = asRecord(event?.transaction);
  addTxHash(hashes, tx?.hash);
  addTxHash(hashes, event?.hash);
  addTxHash(hashes, root.hash);
  return [...hashes];
}
