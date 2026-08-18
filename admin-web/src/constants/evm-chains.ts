export type LoginMode = 'password' | 'wallet' | 'both';

export const SUPPORTED_EVM_CHAINS = [
  { chainId: 1, name: 'Ethereum Mainnet' },
  { chainId: 11155111, name: 'Sepolia' },
  { chainId: 56, name: 'BNB Smart Chain' },
  { chainId: 137, name: 'Polygon' },
  { chainId: 42161, name: 'Arbitrum One' },
] as const;

export const DEFAULT_WALLET_CHAIN_ID = 11155111;

export const LOGIN_MODE_OPTIONS: { value: LoginMode; label: string; hint?: string }[] = [
  { value: 'password', label: '账户密码登录' },
  { value: 'wallet', label: '钱包登录' },
  { value: 'both', label: '账户密码 + 钱包', hint: '须先验密码，再验已绑定钱包签名（双重验证）' },
];
