import type { Address, Hex, PublicClient, WalletClient } from 'viem';
import type { SupportedChain } from './supported-chains';

export interface Module {
  key: Address; // module address
  chainId: SupportedChain; // chain id
  value: {
    /** init data that might be required such as default token, default chain id, etc. */
  }; // this can be anything not restricted to any type
}

export interface Texts {
  url: string;
  avatar: string;
  email: string;
  website: string;
  description: string;
  encryptionPublicKey: string;
  'com.twitter': string;
  'com.github': string;
  'com.discord': string;
}

export interface EnsData {
  ensUsername: string; // should be unique
  eoaAddress: Address; // should be unique
  // i want this to be default 60 for ethereum
  addresses: {
    '60': Address;
  };
  texts: Texts;
  contenthash: Hex;
}

export interface CommonData {
  ensData: EnsData;
  supportedChains: SupportedChain[]; // chains that user wants to support, default is empty array
  modules: Module[];
  privacyEnabled: boolean; // user wants to enable privacy or not, default is false
  privacyData: {
    spendingPublicKey: Hex;
    viewingPrivateKey: Hex;
  };
  eigenAiEnabled: boolean; // user wants to enable eigen ai or not, default is false
}

export interface RegisterRequest extends CommonData {
  // this is a signature for the common data
  signature: {
    hash: Hex;
    message: string;
    expiration: number;
    signature: Hex;
  };
}

export type AccountConfig = {
  walletClient: WalletClient;
  chainId: SupportedChain;
  ens: string;
  modules: Module[];
  defaultToken: Address;
  needPrivacy?: boolean;
  eigenAiEnabled?: boolean;
  publicClient: PublicClient;
};

export type SignedAccountConfig = AccountConfig & {
  signature: `0x${string}`;
  configHash: `0x${string}`;
};

// Types for modules API response
export interface ModuleDeployment {
  network: string;
  chainId: number;
  address: string;
  networkName: string;
  blockExplorer: string;
}

export interface ModuleInfo {
  id: string;
  name: string;
  description: string;
  supportedTokens: string[];
  features: string[];
  deployments: ModuleDeployment[];
}

export interface SupportedNetwork {
  name: string;
  chainId: number;
  blockExplorer: string;
}

export interface ModulesResponse {
  success: boolean;
  modules: ModuleInfo[];
  totalModules: number;
  supportedNetworks: SupportedNetwork[];
}
