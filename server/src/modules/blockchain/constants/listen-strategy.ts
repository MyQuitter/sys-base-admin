import type { ContractType } from '../entities/contract.entity';

export type ListenMode = 'rpc_event' | 'rpc_transfer' | 'explorer_history' | 'rpc_receipt';

export interface ListenOption {
  mode: ListenMode;
  title: string;
  description: string;
  recommended: boolean;
}

/** 按合约类型返回推荐监听方式（纯 RPC vs 浏览器 API） */
export function getListenOptionsForContract(contractType: ContractType): ListenOption[] {
  const rpcEvent: ListenOption = {
    mode: 'rpc_event',
    title: 'RPC 事件订阅',
    description: '通过 eth_getLogs / WebSocket 监听合约 ABI 事件，无需浏览器 API',
    recommended: contractType === 'generic',
  };
  const rpcTransfer: ListenOption = {
    mode: 'rpc_transfer',
    title: 'RPC Transfer 监听',
    description: '监听 ERC20/BEP20 Transfer 事件，等价于浏览器 Transfers 页，纯 RPC',
    recommended: contractType === 'erc20',
  };
  const explorerHistory: ListenOption = {
    mode: 'explorer_history',
    title: '浏览器 API 历史同步',
    description: '拉取 txlist/tokentx 全量历史，需配置 BC_EXPLORER_API_KEY',
    recommended: false,
  };
  const rpcReceipt: ListenOption = {
    mode: 'rpc_receipt',
    title: '单笔交易确认',
    description: '登记 txHash 后 RPC 轮询 receipt，适合已知哈希',
    recommended: false,
  };

  if (contractType === 'erc20') {
    return [rpcTransfer, rpcEvent, rpcReceipt, explorerHistory];
  }
  if (contractType === 'erc721') {
    return [
      { ...rpcTransfer, title: 'RPC Transfer 监听', description: '监听 ERC721 Transfer 事件，纯 RPC', recommended: true },
      rpcEvent,
      rpcReceipt,
      explorerHistory,
    ];
  }
  return [rpcEvent, rpcTransfer, rpcReceipt, explorerHistory];
}

export const LISTEN_GUIDE_SUMMARY = {
  rpcCapable: ['合约自定义事件', 'ERC20/BEP20 Transfer', '单笔 tx 确认'],
  explorerOnly: ['按地址全量历史交易列表', '内部交易 txlistinternal'],
};
