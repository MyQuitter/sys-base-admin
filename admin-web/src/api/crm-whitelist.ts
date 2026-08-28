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
  return request.get<any, { address: string; indexedLevel: number; onChainLevel: number | null; blockNumber: string | null; txHash: string | null }>(
    '/crm-whitelist/nodes/lookup',
    { params: { address } },
  );
}

export function syncCrmTeamRelations() {
  return request.post<any, { syncedTo: string; processed: number; caughtUp: boolean }>(
    '/crm-whitelist/team/sync-relations',
    undefined,
    { timeout: 300_000, skipErrorToast: true },
  );
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
  depthDistribution: { depth: number; count: number }[];
  nodeLevelDistribution: { level: number; count: number }[];
}

export function getCrmWlDashboard() {
  return request.get<any, CrmWlDashboardStats>('/crm-whitelist/stats');
}
