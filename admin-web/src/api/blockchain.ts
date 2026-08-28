import axios from 'axios';

import request from '@/utils/request';
import { useAuthStore } from '@/stores/useAuthStore';
import type { PageResult } from '@/types/api';

import { toast } from '@/utils/toast';
export interface ChainItem {
  id: number;
  chainId: number;
  name: string;
  nativeSymbol: string;
  rpcUrls: string[];
  wssUrls?: string[];
  explorerUrl?: string;
  status: number;
  loginEnabled: number;
  sort: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChainQuery {
  page?: number;
  pageSize?: number;
  name?: string;
  status?: number;
}

export interface CreateChainParams {
  chainId: number;
  name: string;
  nativeSymbol?: string;
  rpcUrls: string[];
  wssUrls?: string[];
  explorerUrl?: string;
  status?: number;
  loginEnabled?: number;
  sort?: number;
}

export type UpdateChainParams = Partial<Omit<CreateChainParams, 'chainId'>>;

export interface RpcHealthResult {
  ok: boolean;
  blockNumber?: string;
  latencyMs: number;
  rpcUrl?: string;
  error?: string;
}

export interface ContractItem {
  id: number;
  chainId: number;
  address: string;
  name: string;
  contractType: string;
  abi?: string;
  status: number;
  remark?: string;
  lastTxSyncBlock?: string;
  lastTxSyncedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContractQuery {
  page?: number;
  pageSize?: number;
  chainId?: number;
  name?: string;
  status?: number;
}

export interface CreateContractParams {
  chainId: number;
  address: string;
  name: string;
  contractType?: string;
  abi?: string;
  status?: number;
  remark?: string;
}

export type UpdateContractParams = Partial<Omit<CreateContractParams, 'chainId' | 'address'>>;

export interface TransactionItem {
  id: number;
  txHash: string;
  chainId: number;
  from?: string;
  to?: string;
  contractId?: number;
  txType: string;
  status: string;
  blockNumber?: string;
  gasUsed?: string;
  bizRef?: string;
  errorMessage?: string;
  lastSyncedAt?: string;
  nextSyncAt?: string;
  explorerUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionQuery {
  page?: number;
  pageSize?: number;
  chainId?: number;
  txHash?: string;
  status?: string;
  bizRef?: string;
}

export interface CreateTransactionParams {
  chainId: number;
  txHash: string;
  contractId?: number;
  bizRef?: string;
}

export interface EventSubscriptionItem {
  id: number;
  contractId: number;
  contractName?: string;
  chainId: number;
  eventName: string;
  status: number;
  fromBlock?: string;
  lastScannedBlock?: string;
  lastScannedAt?: string;
  nextScanAt?: string;
  remark?: string;
  createdAt: string;
  updatedAt: string;
}

export interface EventSubscriptionQuery {
  page?: number;
  pageSize?: number;
  contractId?: number;
  chainId?: number;
  status?: number;
}

export interface CreateEventSubscriptionParams {
  contractId: number;
  eventName: string;
  fromBlock?: string;
  status?: number;
  remark?: string;
}

export type UpdateEventSubscriptionParams = Partial<
  Pick<CreateEventSubscriptionParams, 'status' | 'fromBlock' | 'remark'>
>;

export interface EventLogItem {
  id: number;
  subscriptionId: number;
  contractId: number;
  chainId: number;
  eventName: string;
  txHash: string;
  blockNumber: string;
  logIndex: number;
  args?: Record<string, unknown>;
  explorerUrl?: string;
  createdAt: string;
}

export interface EventLogQuery {
  page?: number;
  pageSize?: number;
  subscriptionId?: number;
  contractId?: number;
  chainId?: number;
  eventName?: string;
  txHash?: string;
}

export interface ScanResult {
  scannedBlocks: number;
  newLogs: number;
}

export function getChains(params?: ChainQuery) {
  return request.get<never, PageResult<ChainItem>>('/blockchain/chains', { params });
}

export function getChain(id: number) {
  return request.get<never, ChainItem>(`/blockchain/chains/${id}`);
}

export function getEnabledChains() {
  return request.get<never, Array<{ chainId: number; name: string }>>('/blockchain/chains/enabled');
}

export function createChain(data: CreateChainParams) {
  return request.post<never, ChainItem>('/blockchain/chains', data);
}

export function updateChain(id: number, data: UpdateChainParams) {
  return request.put<never, ChainItem>(`/blockchain/chains/${id}`, data);
}

export function deleteChain(id: number) {
  return request.delete(`/blockchain/chains/${id}`);
}

export function checkChainHealth(id: number) {
  return request.post<never, RpcHealthResult>(`/blockchain/chains/${id}/health`);
}

export function getContracts(params?: ContractQuery) {
  return request.get<never, PageResult<ContractItem>>('/blockchain/contracts', { params });
}

export function createContract(data: CreateContractParams) {
  return request.post<never, ContractItem>('/blockchain/contracts', data);
}

export function updateContract(id: number, data: UpdateContractParams) {
  return request.put<never, ContractItem>(`/blockchain/contracts/${id}`, data);
}

export function deleteContract(id: number) {
  return request.delete(`/blockchain/contracts/${id}`);
}

export interface ContractTxSyncResult {
  imported: number;
  skipped: number;
  lastBlock?: string;
  lastSyncedAt?: string;
}

export function syncContractTransactions(id: number, data?: { startBlock?: number; reset?: boolean }) {
  return request.post<never, ContractTxSyncResult>(`/blockchain/contracts/${id}/sync-transactions`, data ?? {});
}

export interface ListenOptionItem {
  mode: 'rpc_event' | 'rpc_transfer' | 'explorer_history' | 'rpc_receipt';
  title: string;
  description: string;
  recommended: boolean;
}

export interface ContractListenOptions {
  contractId: number;
  contractType: string;
  hasWebSocket: boolean;
  summary: { rpcCapable: string[]; explorerOnly: string[] };
  options: ListenOptionItem[];
}

export function getContractListenOptions(id: number) {
  return request.get<never, ContractListenOptions>(`/blockchain/contracts/${id}/listen-options`);
}

export function subscribeContractTransfer(id: number, data?: { startBlock?: number }) {
  return request.post<never, EventSubscriptionItem>(`/blockchain/contracts/${id}/subscribe-transfer`, data ?? {});
}

export function getTransactions(params?: TransactionQuery) {
  return request.get<never, PageResult<TransactionItem>>('/blockchain/transactions', { params });
}

export function createTransaction(data: CreateTransactionParams) {
  return request.post<never, TransactionItem>('/blockchain/transactions', data);
}

export function syncTransaction(id: number) {
  return request.post<never, TransactionItem>(`/blockchain/transactions/${id}/sync`);
}

export async function exportTransactions(params?: TransactionQuery) {
  const token = useAuthStore.getState().accessToken;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/blockchain/transactions/export`, {
      params,
      responseType: 'blob',
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const contentType = String(res.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      const text = await res.data.text();
      const json = JSON.parse(text) as { message?: string };
      throw new Error(json.message ?? '导出失败');
    }
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blockchain-transactions.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '导出失败';
    toast.error(msg);
    throw err;
  }
}

export function getEventSubscriptions(params?: EventSubscriptionQuery) {
  return request.get<never, PageResult<EventSubscriptionItem>>('/blockchain/event-subscriptions', { params });
}

export function createEventSubscription(data: CreateEventSubscriptionParams) {
  return request.post<never, EventSubscriptionItem>('/blockchain/event-subscriptions', data);
}

export function updateEventSubscription(id: number, data: UpdateEventSubscriptionParams) {
  return request.put<never, EventSubscriptionItem>(`/blockchain/event-subscriptions/${id}`, data);
}

export function deleteEventSubscription(id: number) {
  return request.delete(`/blockchain/event-subscriptions/${id}`);
}

export function scanEventSubscription(id: number) {
  return request.post<never, ScanResult>(`/blockchain/event-subscriptions/${id}/scan`);
}

export function getEventLogs(params?: EventLogQuery) {
  return request.get<never, PageResult<EventLogItem>>('/blockchain/event-logs', { params });
}

export async function exportEventLogs(params?: EventLogQuery) {
  const token = useAuthStore.getState().accessToken;
  try {
    const res = await axios.get(`${import.meta.env.VITE_API_BASE_URL}/blockchain/event-logs/export`, {
      params,
      responseType: 'blob',
      withCredentials: true,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const contentType = String(res.headers['content-type'] ?? '');
    if (contentType.includes('application/json')) {
      const text = await res.data.text();
      const json = JSON.parse(text) as { message?: string };
      throw new Error(json.message ?? '导出失败');
    }
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blockchain-event-logs.csv';
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : '导出失败';
    toast.error(msg);
    throw err;
  }
}
