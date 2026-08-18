export interface EvmChainOption {
  chainId: number;
  name: string;
}

export const SUPPORTED_EVM_CHAINS: EvmChainOption[] = [
  { chainId: 1, name: 'Ethereum Mainnet' },
  { chainId: 11155111, name: 'Sepolia' },
  { chainId: 56, name: 'BNB Smart Chain' },
  { chainId: 137, name: 'Polygon' },
  { chainId: 42161, name: 'Arbitrum One' },
];

export const DEFAULT_WALLET_CHAIN_ID = 11155111;

export function getChainName(chainId: number): string | undefined {
  return SUPPORTED_EVM_CHAINS.find((c) => c.chainId === chainId)?.name;
}

export function isSupportedChainId(chainId: number): boolean {
  return SUPPORTED_EVM_CHAINS.some((c) => c.chainId === chainId);
}
