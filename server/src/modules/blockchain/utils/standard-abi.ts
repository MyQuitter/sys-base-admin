/** 标准 ERC20 Transfer 事件（无需完整 ABI 即可 getLogs） */
export const STANDARD_TRANSFER_EVENT = {
  anonymous: false,
  inputs: [
    { indexed: true, internalType: 'address', name: 'from', type: 'address' },
    { indexed: true, internalType: 'address', name: 'to', type: 'address' },
    { indexed: false, internalType: 'uint256', name: 'value', type: 'uint256' },
  ],
  name: 'Transfer',
  type: 'event',
} as const;

export const STANDARD_TRANSFER_ABI = [STANDARD_TRANSFER_EVENT] as const;
