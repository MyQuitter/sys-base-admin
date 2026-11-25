import type { Request } from 'express';

const CF_CIDR_HINT = /^(162\.158\.|108\.162\.|172\.69\.|172\.64\.|173\.245\.|188\.114\.|197\.234\.|198\.41\.|103\.21\.|103\.22\.|103\.31\.|141\.101\.|190\.93\.|104\.16\.|104\.17\.|104\.18\.|104\.19\.|104\.20\.|104\.21\.|104\.22\.|104\.23\.|104\.24\.|104\.25\.|104\.26\.|104\.27\.)/;

function firstHeader(req: Request, name: string): string | undefined {
  const raw = req.headers[name];
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && raw[0]?.trim()) return raw[0].trim();
  return undefined;
}

function firstForwarded(value: string): string {
  return value.split(',')[0]?.trim() || value.trim();
}

function isLikelyCloudflareEdge(ip: string): boolean {
  return CF_CIDR_HINT.test(ip);
}

/**
 * 取真实客户端 IP。优先 CF-Connecting-IP，避免日志/锁定记成 Cloudflare 边缘节点。
 */
export function getClientIp(req?: Request): string | undefined {
  if (!req) return undefined;

  const cf = firstHeader(req, 'cf-connecting-ip');
  if (cf) return firstForwarded(cf);

  const realIp = firstHeader(req, 'x-real-ip');
  if (realIp && !isLikelyCloudflareEdge(realIp)) return firstForwarded(realIp);

  const forwarded = firstHeader(req, 'x-forwarded-for');
  if (forwarded) {
    const hops = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    const client = hops.find((ip) => !isLikelyCloudflareEdge(ip));
    if (client) return client;
    if (hops[0]) return hops[0];
  }

  if (realIp) return firstForwarded(realIp);
  if (req.ips?.length) {
    const fromExpress = req.ips.find((ip) => !isLikelyCloudflareEdge(ip));
    if (fromExpress) return fromExpress;
    return req.ips[0];
  }
  const fallback = req.ip || req.socket?.remoteAddress;
  return fallback || undefined;
}
