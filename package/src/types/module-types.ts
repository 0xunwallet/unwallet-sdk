import type { PublicClient } from 'viem';
import { type SupportedChain } from './supported-chains';

// Available module names
export type ModuleName =
  | 'AUTOEARN'
  | 'AUTOSWAP'
  | 'AUTOBRIDGE'
  | 'BOND'
  | 'INVEST_IN_VERIFIABLE_AGENTS'
  | 'INVEST_IN_AAVE';

// Field type definitions
export interface ConfigField {
  type: 'uint256' | 'address' | 'uint24' | 'string' | 'bool';
  name: string;
}

// Return type for getRequiredState function
export interface RequiredStateData {
  chainId: string;
  moduleName: ModuleName;
  moduleAddress: string;
  configInputType: string;
  requiredFields: ConfigField[];
  configTemplate: Record<string, string | number | null>;
}

// Module configuration input type for getRequiredState
export interface GetRequiredStateInput {
  sourceChainId: SupportedChain;
  moduleName: ModuleName;
  publicClient?: PublicClient;
}

// Available modules constant for autocomplete
export const AVAILABLE_MODULES: readonly ModuleName[] = [
  'AUTOEARN',
  'AUTOSWAP',
  'AUTOBRIDGE',
  'BOND',
  'INVEST_IN_VERIFIABLE_AGENTS',
  'INVEST_IN_AAVE',
] as const;

// Helper type for module validation
export type ValidModuleName<T extends string> = T extends ModuleName ? T : never;
