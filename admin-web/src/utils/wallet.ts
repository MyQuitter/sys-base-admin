import { createWalletClient, custom, getAddress, type Chain, type EIP1193Provider } from 'viem';
import { mainnet, sepolia, bsc, polygon, arbitrum } from 'viem/chains';

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  56: bsc,
  137: polygon,
  42161: arbitrum,
};

export function getEthereumProvider(): EIP1193Provider | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { ethereum?: EIP1193Provider }).ethereum;
}

export async function connectWallet(): Promise<`0x${string}`> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error('未检测到钱包，请安装 MetaMask');
  const accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  if (!accounts?.[0]) throw new Error('未获取到钱包地址');
  return getAddress(accounts[0]);
}

export async function getWalletChainId(): Promise<number> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error('未检测到钱包');
  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

export async function switchToChain(chainId: number) {
  const provider = getEthereumProvider();
  if (!provider) throw new Error('未检测到钱包');
  const hex = `0x${chainId.toString(16)}`;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hex }],
    });
  } catch (err: unknown) {
    const chain = CHAIN_MAP[chainId];
    if (!chain) throw err;
    const e = err as { code?: number };
    if (e.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: hex,
            chainName: chain.name,
            nativeCurrency: chain.nativeCurrency,
            rpcUrls: chain.rpcUrls.default.http,
            blockExplorerUrls: chain.blockExplorers?.default.url
              ? [chain.blockExplorers.default.url]
              : undefined,
          },
        ],
      });
      return;
    }
    throw err;
  }
}

export async function ensureWalletChain(chainId: number) {
  const current = await getWalletChainId();
  if (current !== chainId) {
    await switchToChain(chainId);
  }
}

export async function signMessage(address: `0x${string}`, message: string): Promise<`0x${string}`> {
  const provider = getEthereumProvider();
  if (!provider) throw new Error('未检测到钱包');
  const client = createWalletClient({
    account: address,
    transport: custom(provider),
  });
  return client.signMessage({ account: address, message });
}

export function shortenAddress(address?: string) {
  if (!address) return '-';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
