import { type Address, type Hex } from 'viem';
import { SERVER_URL_ENS } from './constants';

/**
 * Module Builder API - Server-side module abstraction
 * 
 * This module provides functions to use the server-side Module Builder API
 * which handles module address lookup, ABI encoding, and validation.
 */

export interface ModuleBuilderConfig {
  baseUrl?: string;
  apiKey?: string;
}

export interface AutoEarnParams {
  chainId: number;
  tokenAddress: Address;
  vaultAddress?: Address;
}

export interface AutoSwapParams {
  chainId: number;
  defaultTokenAddress: Address;
}

export interface AutoBridgeParams {
  chainId: number; // Source chain
  sourceTokenAddress: Address;
  destinationChainId: number;
}

export interface BuiltModule {
  address: Address;
  chainId: number;
  data: Hex;
}

export interface BuildModuleResponse {
  success: boolean;
  module?: BuiltModule;
  metadata?: {
    name: string;
    description: string;
    supportedTokens?: string[];
  };
  error?: string;
  details?: {
    message: string;
    field?: string;
  };
}

export interface BuildBatchResponse {
  success: boolean;
  modules?: BuiltModule[];
  errors?: Array<{
    index: number;
    error: string;
  }>;
}

/**
 * Build an AutoEarn module using the server-side API
 * 
 * @param params - AutoEarn module parameters
 * @param config - Optional configuration (baseUrl, apiKey)
 * @returns Built module with address and encoded data
 * 
 * @example
 * ```typescript
 * const module = await buildAutoEarnModule({
 *   chainId: 421614,
 *   tokenAddress: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d',
 * });
 * ```
 */
export const buildAutoEarnModule = async (
  params: AutoEarnParams,
  config: ModuleBuilderConfig = {},
): Promise<BuiltModule> => {
  const baseUrl = config.baseUrl || SERVER_URL_ENS;
  
  const response = await fetch(`${baseUrl}/api/v1/modules/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({
      moduleType: 'autoEarn',
      chainId: params.chainId,
      params: {
        tokenAddress: params.tokenAddress,
        ...(params.vaultAddress && { vaultAddress: params.vaultAddress }),
      },
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string; details?: any };
    throw new Error(error.error || `Failed to build module: ${response.status}`);
  }

  const data = (await response.json()) as BuildModuleResponse;
  
  if (!data.success || !data.module) {
    throw new Error(data.error || 'Failed to build module');
  }

  return data.module;
};

/**
 * Build an AutoSwap module using the server-side API
 */
export const buildAutoSwapModule = async (
  params: AutoSwapParams,
  config: ModuleBuilderConfig = {},
): Promise<BuiltModule> => {
  const baseUrl = config.baseUrl || SERVER_URL_ENS;
  
  const response = await fetch(`${baseUrl}/api/v1/modules/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({
      moduleType: 'autoSwap',
      chainId: params.chainId,
      params: {
        defaultTokenAddress: params.defaultTokenAddress,
      },
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string; details?: any };
    throw new Error(error.error || `Failed to build module: ${response.status}`);
  }

  const data = (await response.json()) as BuildModuleResponse;
  
  if (!data.success || !data.module) {
    throw new Error(data.error || 'Failed to build module');
  }

  return data.module;
};

/**
 * Build an AutoBridge module using the server-side API
 */
export const buildAutoBridgeModule = async (
  params: AutoBridgeParams,
  config: ModuleBuilderConfig = {},
): Promise<BuiltModule> => {
  const baseUrl = config.baseUrl || SERVER_URL_ENS;
  
  const response = await fetch(`${baseUrl}/api/v1/modules/build`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({
      moduleType: 'autoBridge',
      chainId: params.chainId,
      params: {
        sourceTokenAddress: params.sourceTokenAddress,
        destinationChainId: params.destinationChainId,
      },
    }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string; details?: any };
    throw new Error(error.error || `Failed to build module: ${response.status}`);
  }

  const data = (await response.json()) as BuildModuleResponse;
  
  if (!data.success || !data.module) {
    throw new Error(data.error || 'Failed to build module');
  }

  return data.module;
};

/**
 * Build multiple modules in one batch request
 */
export const buildModulesBatch = async (
  modules: Array<{
    moduleType: 'autoEarn' | 'autoSwap' | 'autoBridge';
    chainId: number;
    params: Record<string, any>;
  }>,
  config: ModuleBuilderConfig = {},
): Promise<BuiltModule[]> => {
  const baseUrl = config.baseUrl || SERVER_URL_ENS;
  
  const response = await fetch(`${baseUrl}/api/v1/modules/build-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({ modules }),
  });

  if (!response.ok) {
    const error = (await response.json()) as { error?: string; details?: any };
    throw new Error(error.error || `Failed to build modules: ${response.status}`);
  }

  const data = (await response.json()) as BuildBatchResponse;
  
  if (!data.success || !data.modules) {
    throw new Error('Failed to build modules');
  }

  return data.modules;
};

/**
 * Validate a module configuration
 */
export const validateModule = async (
  module: BuiltModule,
  config: ModuleBuilderConfig = {},
): Promise<{
  valid: boolean;
  moduleType: string;
  decoded?: any;
  errors?: string[];
}> => {
  const baseUrl = config.baseUrl || SERVER_URL_ENS;
  
  const response = await fetch(`${baseUrl}/api/v1/modules/validate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey && { Authorization: `Bearer ${config.apiKey}` }),
    },
    body: JSON.stringify({ module }),
  });

  if (!response.ok) {
    throw new Error('Failed to validate module');
  }

  return response.json();
};

