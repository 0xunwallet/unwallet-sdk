import { arbitrumSepolia, baseSepolia, Chain } from 'viem/chains';
import { type SupportedChain } from '../types/supported-chains';
import { createPublicClient, http, PublicClient } from 'viem';

export const BASE_SEPOLIA = {
  name: 'Base Sepolia',
  chainId: baseSepolia.id,
  network: baseSepolia.name,
  explorerUrl: 'https://sepolia.basescan.org',
  logo: '/chains/base-logo.png',
  rpcUrl: baseSepolia.rpcUrls.default.http[0],
  // fallbackRpcUrls: RPC_CONFIG.BASE_SEPOLIA.fallbacks,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Base Sepolia Explorer',
    url: 'https://sepolia.basescan.org/',
  },
  tokens: [
    {
      enabled: true,
      symbol: 'USDC',
      name: 'USDC',
      address: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
      iconUri: '/tokens/usdc.png',
    },
  ],
  testnet: true,
};

export const ARBITRUM_SEPOLIA = {
  name: 'Arbitrum Sepolia',
  chainId: arbitrumSepolia.id,
  network: 'arbitrum-sepolia',
  explorerUrl: 'https://sepolia.arbiscan.io',
  logo: '/chains/base-logo.png', // TODO: change to arbitrum logo
  rpcUrl: arbitrumSepolia.rpcUrls.default.http[0],
  // fallbackRpcUrls: RPC_CONFIG.ARB_SEPOLIA.fallbacks,
  nativeCurrency: {
    name: 'Ether',
    symbol: 'ETH',
    decimals: 18,
  },
  blockExplorer: {
    name: 'Arbitrum Sepolia Explorer',
    url: 'https://sepolia.arbiscan.io/',
  },
  tokens: [
    {
      enabled: true,
      symbol: 'USDC',
      name: 'USDC',
      address: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
      iconUri: '/tokens/usdc.png',
    },
  ],
  testnet: true,
};

export const CHAIN_MAPPING = {
  84532: BASE_SEPOLIA,
  421614: ARBITRUM_SEPOLIA,
};

export const RPC_CONFIG = {
  // SEI_TESTNET: {
  //   primary:
  //     'https://quiet-crimson-ensemble.sei-atlantic.quiknode.pro/69718db72dcf9d1828053e82dbeeeb283319782e/',
  //   fallbacks: [
  //     'https://sei-testnet.drpc.org',
  //     'https://rpc.sei-testnet.seinetwork.io',
  //     'https://testnet-rpc.sei.io',
  //   ],
  // },
  [baseSepolia.id]: {
    primary: 'https://sepolia.base.org',
    fallbacks: [
      'https://base-sepolia.api.onfinality.io/public',
      'https://base-sepolia-public.nodies.app',
    ],
  },
  [arbitrumSepolia.id]: {
    primary: 'https://arbitrum-sepolia.drpc.org',
    fallbacks: [
      'https://arbitrum-sepolia.therpc.io',
      'https://arbitrum-sepolia-rpc.publicnode.com',
    ],
  },
} as const;

export const getRpcUrlById = (chainId: SupportedChain): string => {
  const chainConfig = CHAIN_MAPPING[chainId];
  return chainConfig?.rpcUrl;
};

export const getRpcUrlsById = (chainId: SupportedChain): string[] => {
  const rpcConfig = RPC_CONFIG[chainId as keyof typeof RPC_CONFIG];

  if (!rpcConfig) {
    throw new Error(`RPC configuration not found for chain ID: ${chainId}`);
  }

  return [rpcConfig.primary, ...rpcConfig.fallbacks];
};

export const getViemChainById = (chainId: SupportedChain): Chain | undefined => {
  const chainConfig = CHAIN_MAPPING[chainId];

  if (!chainConfig) {
    return undefined;
  }

  return {
    id: chainConfig.chainId,
    name: chainConfig.name,
    network: chainConfig.network,
    nativeCurrency: chainConfig.nativeCurrency,
    rpcUrls: {
      default: {
        http: [chainConfig.rpcUrl],
      },
      public: {
        http: [chainConfig.rpcUrl],
      },
    },
    blockExplorers: {
      default: {
        name: chainConfig.blockExplorer.name,
        url: chainConfig.blockExplorer.url,
      },
    },
    testnet: chainConfig.testnet,
  } as Chain;
};

export const publicClintByChainId = (chainId: SupportedChain): PublicClient => {
  const chainConfig = getViemChainById(chainId);
  const rpcUrl = chainConfig?.rpcUrls.default.http[0];
  if (!rpcUrl) {
    throw new Error(`RPC URL not found for chain ${chainId}`);
  }
  return createPublicClient({
    chain: chainConfig,
    transport: http(rpcUrl),
  });
};
