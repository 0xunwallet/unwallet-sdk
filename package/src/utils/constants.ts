import { arbitrumSepolia, baseSepolia } from 'viem/chains';
import { SupportedChain } from '../types/supported-chains';
import { type Address, type Abi } from 'viem';

export const BACKEND_URL = 'https://unwallet-production.up.railway.app';

export const FACILITATOR_URL = 'https://arbsep.facilitator.unwallet.me';

export const SERVER_URL_ENS = 'https://tee.unwallet.io';
// export const SERVER_URL_ENS = 'http://localhost:3000';

// AAVE Pool Addresses (vault addresses for all modules)
export const AAVE_POOL_ADDRESSES = {
  [baseSepolia.id]: '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b',
  [arbitrumSepolia.id]: '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff',
} as const;

type ModuleConfig = {
  abi: Abi; // or unknown[] or readonly unknown[]
  bondContractAddress: Address;
  autoEarnContractAddress: Address;
  autoSwapContractAddress: Address;
  autoBridgeContractAddress: Address;
};

export const BOND_ABI = [
  {
    name: 'getConfigInputTypeData',
    type: 'function',
    stateMutability: 'pure',
    inputs: [],
    outputs: [
      {
        name: 'configInputTypeData',
        type: 'string',
      },
    ],
  },
];

export const MODULE_DATA = {
  [baseSepolia.id as SupportedChain]: {
    abi: BOND_ABI,
    bondContractAddress: '0x6e1fAc6e36f01615ef0c0898Bf6c5F260Bf2609a', // autoEarn on Base Sepolia
    autoEarnContractAddress: '0x6e1fAc6e36f01615ef0c0898Bf6c5F260Bf2609a',
    autoSwapContractAddress: '0x564B1354Af4D3EA51eE3a9eFaD608E9aa78d3905',
    autoBridgeContractAddress: '0xe8Da54c7056680FF1b7FF6E9dfD0721dDcAd3F14',
    investInVerifiableAgentsContractAddress: '0xVerifiableAgentsContractAddress',
    investInAaveContractAddress: '0xAaveContractAddress',
  },
  [arbitrumSepolia.id as SupportedChain]: {
    abi: BOND_ABI,
    bondContractAddress: '0x748Cb019ffF904482e8518124F2BbFF0Ea7Ec7d6',
    autoEarnContractAddress: '0x42CF1b746F96D6cc59e84F87d26Ea64D3fbCa3a0', // Correct AutoEarn module address
    autoSwapContractAddress: '0x537a0aB5A0172E69EC824cD1048A57eca95c696B',
    autoBridgeContractAddress: '0xDdAd6d1084fF9e8CaBf579358A95666Bf5515F51',
    investInVerifiableAgentsContractAddress: '0xVerifiableAgentsContractAddress',
    investInAaveContractAddress: '0xAaveContractAddress',
  },
} as const satisfies Partial<Record<SupportedChain, ModuleConfig>>;

export const AVAILABLE_MODULES = [
  'AUTOEARN',
  'AUTOSWAP',
  'AUTOBRIDGE',
  'BOND',
  'INVEST_IN_VERIFIABLE_AGENTS',
  'INVEST_IN_AAVE',
] as const;

export const getRequiredAvailableModules = (): readonly string[] => {
  return AVAILABLE_MODULES;
};

export const getModuleAddress = (moduleName: string, chainId: SupportedChain) => {
  const upperModuleName = moduleName.toUpperCase();

  switch (upperModuleName) {
    case 'AUTOEARN':
      return MODULE_DATA[chainId].autoEarnContractAddress;
    case 'AUTOSWAP':
      return MODULE_DATA[chainId].autoSwapContractAddress;
    case 'AUTOBRIDGE':
      return MODULE_DATA[chainId].autoBridgeContractAddress;
    case 'BOND':
      return MODULE_DATA[chainId].bondContractAddress;
    case 'INVEST_IN_VERIFIABLE_AGENTS':
      return MODULE_DATA[chainId].investInVerifiableAgentsContractAddress;
    case 'INVEST_IN_AAVE':
      return MODULE_DATA[chainId].investInAaveContractAddress;
    default:
      throw new Error(`Invalid module name: ${moduleName}`);
  }
};

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
