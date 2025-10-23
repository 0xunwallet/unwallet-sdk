import { arbitrumSepolia, baseSepolia } from 'viem/chains';
import { SupportedChain } from '../types/supported-chains';
import { type Abi } from 'viem';

export const BACKEND_URL = 'https://unwallet-production.up.railway.app';

export const FACILITATOR_URL = 'https://arbsep.facilitator.unwallet.me';

export const SERVER_URL_ENS = 'https://tee.wall8.xyz';

type ModuleConfig = {
  abi: Abi; // or unknown[] or readonly unknown[]
  contractAddress: string;
};

export const MODULE_DATA = {
  [baseSepolia.id as SupportedChain]: {
    abi: [],
    contractAddress: '0x....',
  },
} as const satisfies Partial<Record<SupportedChain, ModuleConfig>>;

export const getStealthAddressGenerationMessage = (chainId: SupportedChain) => {
  switch (chainId) {
    case baseSepolia.id:
      return 'STEALTH_ADDRESS_GENERATION_ZZZZZ_BASE_SEPOLIA';
    case arbitrumSepolia.id:
      return 'STEALTH_ADDRESS_GENERATION_ZZZZZ_ARB_SEPOLIA';
    default:
      throw new Error(`Unsupported chain ID: ${chainId}`);
  }
};

export const SAFE_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
      { name: 'operation', type: 'uint8' },
      { name: 'safeTxGas', type: 'uint256' },
      { name: 'baseGas', type: 'uint256' },
      { name: 'gasPrice', type: 'uint256' },
      { name: 'gasToken', type: 'address' },
      { name: 'refundReceiver', type: 'address' },
      { name: 'signatures', type: 'bytes' },
    ],
    name: 'execTransaction',
    outputs: [{ name: 'success', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export const USDC_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'mint',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    name: 'transfer',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
];
