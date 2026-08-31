import request from '@/utils/request';
import type { PageResult } from '@/types/api';

export interface CrmWlConfig {
  id: number | null;
  chainId: number | null;
  tokenAddress: string;
  businessAddress: string;
  tokenAbiKey: string;
  traderStartBlock: string;
  nodeStartBlock: string;
  relationStartBlock: string;
  traderSyncedBlock: string;
  nodeSyncedBlock: string;
  relationSyncedBlock: string;
  joinSyncedBlock?: string;
  updatedAt: string | null;
  /** 本次保存是否清空索引并回退游标 */
  resetIndexed?: boolean;
}

export interface UpdateCrmWlConfigParams {
  chainId: number;
  tokenAddress: string;
  businessAddress: string;
  tokenAbiKey?: string;
  traderStartBlock?: string;
  nodeStartBlock?: string;
  relationStartBlock?: string;
}

export interface CrmWlTraderItem {
  id: number;
  address: string;
  allowed: number;
  blockNumber: string;
  txHash?: string;
  eventAt?: string;
  updatedAt: string;
}

export interface CrmWlNodeItem {
  id: number;
  address: string;
  level: number;
  /** 1=官方位（不占额度），0=团队长位 */
  uncapped: number;
  blockNumber: string;
  txHash?: string;
  eventAt?: string;
  updatedAt: string;
}

export interface CrmWlJoinItem {
  id: number;
  address: string;
  participationId: string;
  bnbAmount: string;
  participationUsd: string;
  quotaUsd: string;
  blockNumber: string;
  txHash?: string;
  eventAt?: string;
  updatedAt: string;
}

export interface CrmTeamMemberItem {
  id: number;
  address: string;
  inviterAddress?: string;
  ancestorPath: string;
  depth: number;
  bindBlockNumber: string;
  bindTxHash?: string;
  directValidUsers: string;
  ownUsd: string;
  directUsd: string;
  teamUsd: string;
  ownBnb?: string;
  directBnb?: string;
  teamBnb?: string;
  /** V2：额度（原算力 powerUsd） */
  quotaUsd: string;
  nodeLevel: number;
  /** V2：累计邀请返佣 CRAM（原 referralBnb） */
  referralCrm: string;
  updatedAt: string;

  /** 账户级账本概览（来自 on-chain accountOverview；团队详情接口才会返回） */
  participations?: string;
  contributedBnb?: string;
  participationUsd?: string;
  orderQuotaUsd?: string;
  claimedRewardUsd?: string;
  directParticipationUsd?: string;
  teamParticipationUsd?: string;
  pendingStaticCrm?: string;
  pendingNodeCrm?: string;
  claimableCrm?: string;
  referralCrmEarned?: string;
  nodeClaimedCrm?: string;
  crmUsdPrice?: string;
  remainingQuotaUsd?: string;
  openOrders?: string;
  exited?: boolean;
  isValidUser?: boolean;
  priceReady?: boolean;
}

export function getCrmWlConfig() {
  return request.get<any, CrmWlConfig>('/crm-whitelist/config');
}

export function saveCrmWlConfig(data: UpdateCrmWlConfigParams) {
  return request.put<any, CrmWlConfig>('/crm-whitelist/config', data);
}

export interface CrmWlSyncPart {
  syncedTo: string;
  processed: number;
  skippedBlocks?: string[];
  caughtUp: boolean;
}

export function syncCrmWl() {
  return request.post<any, { trader: CrmWlSyncPart; node: CrmWlSyncPart }>(
    '/crm-whitelist/sync',
    undefined,
    {
      timeout: 300_000,
      skipErrorToast: true,
    },
  );
}

export function importCrmWlTx(kind: 'trader' | 'node', txHash: string) {
  return request.post<any, { processed: number; blockNumber: string | null }>(
    '/crm-whitelist/import-tx',
    { kind, txHash },
    { skipErrorToast: true },
  );
}

export function getCrmWlTraders(params: { page?: number; pageSize?: number; address?: string }) {
  return request.get<any, PageResult<CrmWlTraderItem>>('/crm-whitelist/traders', { params });
}

export function lookupCrmWlTrader(address: string) {
  return request.get<any, { address: string; indexedAllowed: boolean; onChainAllowed: boolean | null; blockNumber: string | null; txHash: string | null }>(
    '/crm-whitelist/traders/lookup',
    { params: { address } },
  );
}

export function getCrmWlNodes(params: { page?: number; pageSize?: number; address?: string }) {
  return request.get<any, PageResult<CrmWlNodeItem>>('/crm-whitelist/nodes', { params });
}

export function lookupCrmWlNode(address: string) {
  return request.get<
    any,
    {
      address: string;
      indexedLevel: number;
      indexedUncapped: boolean;
      onChainLevel: number | null;
      onChainUncapped: boolean | null;
      blockNumber: string | null;
      txHash: string | null;
    }
  >('/crm-whitelist/nodes/lookup', { params: { address } });
}

export function getCrmWlJoins(params: { page?: number; pageSize?: number; address?: string }) {
  return request.get<any, PageResult<CrmWlJoinItem>>('/crm-whitelist/joins', { params });
}

export function syncCrmWlJoins() {
  return request.post<any, CrmWlSyncPart>('/crm-whitelist/joins/sync', undefined, {
    timeout: 300_000,
    skipErrorToast: true,
  });
}

export function syncCrmTeamRelations() {
  return request.post<any, { syncedTo: string; processed: number; caughtUp: boolean }>(
    '/crm-whitelist/team/sync-relations',
    undefined,
    { timeout: 300_000, skipErrorToast: true },
  );
}

export function syncCrmTeamMetrics() {
  return request.post<
    any,
    { volumeUpdated: number; chainUpdated: number; chainFailed: number; total: number; caughtUp: boolean }
  >('/crm-whitelist/team/sync-metrics', undefined, {
    timeout: 300_000,
    skipErrorToast: true,
  });
}

export function getCrmTeamMembers(params: {
  page?: number;
  pageSize?: number;
  address?: string;
  inviterAddress?: string;
  refreshMetrics?: boolean;
}) {
  const { refreshMetrics, ...rest } = params;
  return request.get<any, PageResult<CrmTeamMemberItem>>('/crm-whitelist/team/members', {
    params: refreshMetrics ? { ...rest, refreshMetrics: true } : rest,
  });
}

export interface CrmTeamMemberMetrics {
  address: string;
  inviterAddress: string | null;
  /** 相对查询地址的层级，本接口固定为 1（仅直推） */
  layer: number;
  ownUsd: string;
  directUsd: string;
  teamUsd: string;
  ownBnb?: string;
  directBnb?: string;
  teamBnb?: string;
  teamCount: number;
}

export interface CrmTeamMetrics {
  indexed: boolean;
  address: string;
  ownUsd: string;
  directUsd: string;
  teamUsd: string;
  ownBnb?: string;
  directBnb?: string;
  teamBnb?: string;
  directCount: number;
  teamCount: number;
  truncated: boolean;
  members: CrmTeamMemberMetrics[];
  updatedAt: string | null;
}

export function getCrmTeamMetrics(address: string) {
  return request.get<any, CrmTeamMetrics>('/crm-whitelist/team/metrics', { params: { address } });
}

export function getCrmTeamOverview(address: string) {
  return request.get<any, { member: CrmTeamMemberItem; inviter: CrmTeamMemberItem | null; children: CrmTeamMemberItem[] }>(
    '/crm-whitelist/team/overview',
    { params: { address } },
  );
}

export function getCrmTeamTree(address: string) {
  return request.get<any, { root: CrmTeamMemberItem; nodes: CrmTeamMemberItem[] }>(
    '/crm-whitelist/team/tree',
    { params: { address } },
  );
}

export interface CrmWlDashboardStats {
  /** UTC+8 自然日 YYYY-MM-DD，与合约日切口径一致 */
  utc8Date: string;
  dailyJoinCapUsd: string;
  dailyJoinedUsdToday: string;
  dailyJoinRemainingUsd: string;
  /** cap=0 时合约不限制；剩余为 uint256.max，前端勿当金额展示 */
  dailyJoinUnlimited: boolean;
  /** 链上各账户 participationUsd 合计（入金折 U，不含档位系数） */
  totalParticipationUsd: string;
  totalQuotaUsd: string;
  totalQuota: string;
  totalParticipations: string;
  memberCount: number;
  traderCount: number;
  nodeCount: number;
  indexedOwnUsdSum: string;
  indexedQuotaUsdSum: string;
  crmBnbPrice: string;
  bnbUsdPrice: string;
  crmUsdPrice: string;
  priceReady: boolean;
  /** pancake=薄饼 getAmountsOut 现货；none=未读到 */
  priceSource: 'pancake' | 'none';
  tradingEnabled: boolean;
  publicBuysEnabled: boolean;
  totalSupply: string;
  availableExcessCrm: string;
  businessCrm: string;
  staticRewardReserve: string;
  nodeRewardReserve: string;
  dynamicReserve: string;
  lastRebaseTime: string;
  pendingExitCount: string;
  rebaseDue: boolean;
  /** 最近 30 个 UTC+8 自然日入金折 U / BNB / 笔数 */
  dailyJoins: { date: string; usd: string; bnb: string; count: number }[];
  depthDistribution: { depth: number; count: number }[];
  nodeLevelDistribution: { level: number; count: number }[];
}

export function getCrmWlDashboard() {
  return request.get<any, CrmWlDashboardStats>('/crm-whitelist/stats');
}

export type CrmWlKlineInterval = '15m' | '1h' | '4h' | '1d';

export interface CrmWlKlineCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CrmWlPriceKline {
  interval: CrmWlKlineInterval;
  pairAddress: string;
  pairName: string;
  source: 'geckoterminal' | 'none';
  candles: CrmWlKlineCandle[];
}

export function getCrmWlPriceKline(interval: CrmWlKlineInterval) {
  return request.get<any, CrmWlPriceKline>('/crm-whitelist/stats/kline', {
    params: { interval },
    skipLoading: true,
  });
}

export interface CrmWlRealtimeStatus {
  webhookEnabled: boolean;
  webhookPath: string;
  liveMode: 'idle' | 'websocket' | 'polling';
  lastIngestAt: string | null;
  lastIngestProcessed: number;
}

export function getCrmWlRealtime() {
  return request.get<any, CrmWlRealtimeStatus>('/crm-whitelist/realtime', {
    skipErrorToast: true,
    skipLoading: true,
  });
}
