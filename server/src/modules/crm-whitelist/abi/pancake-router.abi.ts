import type { Abi } from 'viem';

/** PancakeSwap V2 Router：仅取价用 getAmountsOut */
export const PANCAKE_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const satisfies Abi;
