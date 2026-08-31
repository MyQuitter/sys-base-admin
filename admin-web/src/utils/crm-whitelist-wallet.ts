import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  type Abi,
  type Chain,
} from 'viem';
import { mainnet, sepolia, bsc, polygon, arbitrum } from 'viem/chains';
import tokenModularAbi from '@/abi/CRAMTokenModular.abi.json';
import tokenLegacyAbi from '@/abi/CRMToken.abi.json';
import businessAbiJson from '@/abi/CRAMBusiness.abi.json';
import {
  ensureWalletChain,
  ensureWalletConnected,
  getEthereumProvider,
  isWalletUserRejected,
} from '@/utils/wallet';

const CHAIN_MAP: Record<number, Chain> = {
  1: mainnet,
  11155111: sepolia,
  56: bsc,
  137: polygon,
  42161: arbitrum,
};

function resolveChain(chainId: number): Chain {
  return (
    CHAIN_MAP[chainId] ?? {
      id: chainId,
      name: `Chain ${chainId}`,
      nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [] } },
    }
  );
}

function tokenAbi(tokenAbiKey: string): Abi {
  return (tokenAbiKey === 'legacy' ? tokenLegacyAbi : tokenModularAbi) as Abi;
}

export async function assertIsContractOwner(params: {
  chainId: number;
  contractAddress: string;
  abi: Abi;
  account: `0x${string}`;
  rpcUrl?: string;
}) {
  const chain = resolveChain(params.chainId);
  const provider = getEthereumProvider();
  const client = createPublicClient({
    chain,
    transport: params.rpcUrl ? http(params.rpcUrl) : provider ? custom(provider) : http(),
  });
  const owner = (await client.readContract({
    address: getAddress(params.contractAddress),
    abi: params.abi,
    functionName: 'owner',
  })) as string;
  if (getAddress(owner) !== params.account) {
    throw new Error(`当前钱包不是合约 Owner（Owner: ${owner}）`);
  }
}

export async function writeSetTraderWhitelist(params: {
  chainId: number;
  tokenAddress: string;
  tokenAbiKey: string;
  account: string;
  allowed: boolean;
}) {
  try {
    const account = await ensureWalletConnected();
    await ensureWalletChain(params.chainId);
    const abi = tokenAbi(params.tokenAbiKey);
    const target = getAddress(params.tokenAddress);
    const trader = getAddress(params.account);
    await assertIsContractOwner({
      chainId: params.chainId,
      contractAddress: target,
      abi,
      account,
    });
    const provider = getEthereumProvider();
    if (!provider) throw new Error('未检测到钱包');
    const wallet = createWalletClient({
      account,
      chain: resolveChain(params.chainId),
      transport: custom(provider),
    });
    const hash = await wallet.writeContract({
      address: target,
      abi,
      functionName: 'setTraderWhitelist',
      args: [trader, params.allowed],
      account,
      chain: resolveChain(params.chainId),
    });
    return hash;
  } catch (err) {
    if (isWalletUserRejected(err)) throw new Error('已取消钱包操作');
    throw err;
  }
}

export async function writeSetNodeWhitelist(params: {
  chainId: number;
  businessAddress: string;
  account: string;
  level: number;
  /** 官方位 true：不占额度；团队长位 false */
  uncapped: boolean;
}) {
  try {
    const account = await ensureWalletConnected();
    await ensureWalletChain(params.chainId);
    const abi = businessAbiJson as Abi;
    const target = getAddress(params.businessAddress);
    const node = getAddress(params.account);
    await assertIsContractOwner({
      chainId: params.chainId,
      contractAddress: target,
      abi,
      account,
    });
    const provider = getEthereumProvider();
    if (!provider) throw new Error('未检测到钱包');
    const wallet = createWalletClient({
      account,
      chain: resolveChain(params.chainId),
      transport: custom(provider),
    });
    const hash = await wallet.writeContract({
      address: target,
      abi,
      functionName: 'setNodeWhitelist',
      args: [node, params.level, params.level > 0 ? params.uncapped : false],
      account,
      chain: resolveChain(params.chainId),
    });
    return hash;
  } catch (err) {
    if (isWalletUserRejected(err)) throw new Error('已取消钱包操作');
    throw err;
  }
}

/** 连接钱包并校验当前账户是否为 Token Owner，通过则返回账户地址 */
export async function verifyTokenOwner(params: {
  chainId: number;
  tokenAddress: string;
  tokenAbiKey: string;
}): Promise<`0x${string}`> {
  try {
    const account = await ensureWalletConnected();
    await ensureWalletChain(params.chainId);
    const abi = tokenAbi(params.tokenAbiKey);
    const target = getAddress(params.tokenAddress);
    await assertIsContractOwner({
      chainId: params.chainId,
      contractAddress: target,
      abi,
      account,
    });
    return account;
  } catch (err) {
    if (isWalletUserRejected(err)) throw new Error('已取消钱包操作');
    throw err;
  }
}

/** 滚动 TWAP 观察点（任何人可调用；开盘前若 TWAP 未就绪可先 roll） */
export async function writeRollObservations(params: {
  chainId: number;
  tokenAddress: string;
  tokenAbiKey: string;
}) {
  try {
    const account = await ensureWalletConnected();
    await ensureWalletChain(params.chainId);
    const abi = tokenAbi(params.tokenAbiKey);
    const target = getAddress(params.tokenAddress);
    const provider = getEthereumProvider();
    if (!provider) throw new Error('未检测到钱包');
    const chain = resolveChain(params.chainId);
    const publicClient = createPublicClient({
      chain,
      transport: custom(provider),
    });
    const { result: canRoll } = await publicClient.simulateContract({
      address: target,
      abi,
      functionName: 'rollObservations',
      account,
    });
    if (!canRoll) {
      throw new Error('TWAP 窗口尚未成熟，暂无法 rollObservations（需先 initializeObservations 并等待窗口）');
    }
    const wallet = createWalletClient({
      account,
      chain,
      transport: custom(provider),
    });
    const hash = await wallet.writeContract({
      address: target,
      abi,
      functionName: 'rollObservations',
      account,
      chain,
    });
    return hash;
  } catch (err) {
    if (isWalletUserRejected(err)) throw new Error('已取消钱包操作');
    throw err;
  }
}

/** Owner 调用 Token.enableTrading() 开盘（要求 TWAP protectedPrices 已就绪） */
export async function writeEnableTrading(params: {
  chainId: number;
  tokenAddress: string;
  tokenAbiKey: string;
}) {
  try {
    const account = await ensureWalletConnected();
    await ensureWalletChain(params.chainId);
    const abi = tokenAbi(params.tokenAbiKey);
    const target = getAddress(params.tokenAddress);
    await assertIsContractOwner({
      chainId: params.chainId,
      contractAddress: target,
      abi,
      account,
    });
    const provider = getEthereumProvider();
    if (!provider) throw new Error('未检测到钱包');
    const chain = resolveChain(params.chainId);
    const publicClient = createPublicClient({
      chain,
      transport: custom(provider),
    });
    const already = (await publicClient.readContract({
      address: target,
      abi,
      functionName: 'tradingEnabled',
    })) as boolean;
    if (already) {
      throw new Error('合约已开盘，无需重复操作');
    }
    const wallet = createWalletClient({
      account,
      chain,
      transport: custom(provider),
    });
    const hash = await wallet.writeContract({
      address: target,
      abi,
      functionName: 'enableTrading',
      account,
      chain,
    });
    return hash;
  } catch (err) {
    if (isWalletUserRejected(err)) throw new Error('已取消钱包操作');
    throw err;
  }
}
