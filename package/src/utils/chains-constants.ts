import { baseSepolia } from 'viem/chains';

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

export const CHAIN_MAPPING = {
  84532: BASE_SEPOLIA,
};
