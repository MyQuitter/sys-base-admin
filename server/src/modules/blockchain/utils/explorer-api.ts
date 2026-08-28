/** Etherscan API V2 统一端点（支持 BSC chainId=56 等 60+ 链） */
export const EXPLORER_API_V2_BASE = 'https://api.etherscan.io/v2/api';

/** @deprecated V1 已于 2025-08 停用，仅作兼容回退 */
export const DEFAULT_EXPLORER_API_V1: Record<number, string> = {
  1: 'https://api.etherscan.io/api',
  11155111: 'https://api-sepolia.etherscan.io/api',
  56: 'https://api.bscscan.com/api',
  137: 'https://api.polygonscan.com/api',
  42161: 'https://api.arbiscan.io/api',
};

export interface ExplorerTxItem {
  blockNumber: string;
  hash: string;
  from: string;
  to: string;
  gasUsed?: string;
  isError?: string;
  txreceipt_status?: string;
  /** 合约调用 input，用于按 method 过滤 */
  input?: string;
  methodId?: string;
}

interface ExplorerApiResponse {
  status: string;
  message: string;
  result: ExplorerTxItem[] | string;
}

const EMPTY_RESULT_HINTS = [
  'no transactions found',
  'no records found',
  'no internal transactions found',
  'no token transfers found',
];

function isEmptyResult(detail: string): boolean {
  const lower = detail.toLowerCase();
  return EMPTY_RESULT_HINTS.some((hint) => lower.includes(hint));
}

function formatExplorerError(data: ExplorerApiResponse): string {
  if (typeof data.result === 'string' && data.result.trim()) {
    return data.result.trim();
  }
  return data.message?.trim() || '浏览器 API 返回错误';
}

/** 解析浏览器 API 地址（统一走 Etherscan V2） */
export function resolveExplorerApiUrl(_chainId: number, _explorerUrl?: string): string {
  return EXPLORER_API_V2_BASE;
}

export async function fetchExplorerTxList(params: {
  chainId: number;
  apiUrl: string;
  apiKey: string;
  address: string;
  startBlock: number;
  page: number;
  offset: number;
  action?: 'txlist' | 'txlistinternal' | 'tokentx';
}): Promise<ExplorerTxItem[]> {
  const url = new URL(params.apiUrl);
  url.searchParams.set('chainid', String(params.chainId));
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', params.action ?? 'txlist');
  url.searchParams.set('address', params.address);
  url.searchParams.set('startblock', String(params.startBlock));
  url.searchParams.set('endblock', '99999999');
  url.searchParams.set('page', String(params.page));
  url.searchParams.set('offset', String(params.offset));
  url.searchParams.set('sort', 'asc');
  url.searchParams.set('apikey', params.apiKey);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    throw new Error(`浏览器 API 请求失败: HTTP ${res.status}`);
  }

  const data = (await res.json()) as ExplorerApiResponse;
  if (data.status !== '1') {
    const detail = formatExplorerError(data);
    if (isEmptyResult(detail) || isEmptyResult(data.message ?? '')) {
      return [];
    }
    if (detail.includes('deprecated V1 endpoint')) {
      throw new Error('浏览器 API V1 已停用，请升级服务端或更换 Etherscan V2 API Key');
    }
    if (detail.toLowerCase().includes('invalid api key')) {
      throw new Error(
        'API Key 无效。请在 etherscan.io 创建统一 API Key（BscScan 旧 Key 已不适用 V2），配置到 BC_EXPLORER_API_KEY',
      );
    }
    if (detail.toLowerCase().includes('free api access is not supported for this chain')) {
      throw new Error(
        `当前 Etherscan 免费 API 不支持 chainId=${params.chainId} 的交易列表查询。BSC 需要升级 Etherscan API 付费套餐，或改接 BSCTrace / NodeReal 之类支持 BNB Chain 历史交易查询的服务。`,
      );
    }
    throw new Error(detail);
  }
  if (!Array.isArray(data.result)) return [];
  return data.result;
}
