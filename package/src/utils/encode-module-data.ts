import { encodeAbiParameters, keccak256, type Hex, type Address } from 'viem';

/**
 * AutoEarn module configuration input
 */
export interface AutoEarnConfig {
  chainId: bigint;
  token: Address;
  vault: Address;
}

/**
 * Encodes AutoEarn module configuration data
 * 
 * The AutoEarn module expects a config hash encoded as uint256.
 * The encoding process:
 * 1. Encode the config data as a tuple array
 * 2. Calculate keccak256 hash of the encoded data
 * 3. Encode the hash as uint256
 * 
 * @param configs - Array of AutoEarn configurations (typically one config per chain)
 * @returns Encoded hex string ready for use in orchestration
 * 
 * @example
 * ```typescript
 * const encodedData = encodeAutoEarnModuleData([{
 *   chainId: BigInt(421614), // Arbitrum Sepolia
 *   token: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d' as Address,
 *   vault: '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff' as Address,
 * }]);
 * 
 * const orchestrationData = await createOrchestrationData(
 *   currentState,
 *   requiredState,
 *   userAddress,
 *   apiKey,
 *   encodedData
 * );
 * ```
 */
export const encodeAutoEarnModuleData = (configs: AutoEarnConfig[]): Hex => {
  // Step 1: Encode the config data as tuple array
  const configData = encodeAbiParameters(
    [
      {
        type: 'tuple[]',
        components: [
          { name: 'chainId', type: 'uint256' },
          { name: 'token', type: 'address' },
          { name: 'vault', type: 'address' },
        ],
      },
    ],
    [configs],
  );

  // Step 2: Calculate keccak256 hash
  const configHash = keccak256(configData);

  // Step 3: Encode the hash as uint256
  // Note: BigInt correctly parses hex strings (0x...) when converting
  const encodedData = encodeAbiParameters([{ type: 'uint256' }], [BigInt(configHash)]);

  return encodedData as Hex;
};

/**
 * Helper to create AutoEarn config for a single chain
 * 
 * @param chainId - The chain ID where the AutoEarn module will operate
 * @param tokenAddress - The token address to earn with (e.g., USDC)
 * @param vaultAddress - The vault/lending pool address (e.g., Aave pool)
 * @returns AutoEarnConfig ready for encoding
 * 
 * @example
 * ```typescript
 * const config = createAutoEarnConfig(
 *   421614, // Arbitrum Sepolia
 *   '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d', // USDC
 *   '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff' // Aave pool
 * );
 * const encodedData = encodeAutoEarnModuleData([config]);
 * ```
 */
export const createAutoEarnConfig = (
  chainId: number,
  tokenAddress: Address,
  vaultAddress: Address,
): AutoEarnConfig => {
  return {
    chainId: BigInt(chainId),
    token: tokenAddress,
    vault: vaultAddress,
  };
};

/**
 * BondModule configuration input
 */
export interface BondModuleConfig {
  tokenAddresses: Address[];
  totalAmounts: bigint[];
}

/**
 * Encodes BondModule configuration data
 * 
 * The BondModule expects initData encoded as:
 * - address[] tokenAddresses: Array of token addresses to bond
 * - uint256[] totalAmounts: Array of total amounts for each token (must match tokenAddresses length)
 * 
 * @param config - BondModule configuration with token addresses and amounts
 * @returns Encoded hex string ready for use in orchestration
 * 
 * @example
 * ```typescript
 * const config = createBondModuleConfig(
 *   ['0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d'], // USDC address
 *   [parseUnits('0.05', 6)] // 0.05 USDC (6 decimals)
 * );
 * const encodedData = encodeBondModuleData(config);
 * 
 * const orchestrationData = await createOrchestrationData(
 *   currentState,
 *   requiredState,
 *   userAddress,
 *   apiKey,
 *   encodedData
 * );
 * ```
 */
export const encodeBondModuleData = (config: BondModuleConfig): Hex => {
  // Validate that arrays have the same length
  if (config.tokenAddresses.length !== config.totalAmounts.length) {
    throw new Error(
      `Token addresses and amounts arrays must have the same length. Got ${config.tokenAddresses.length} addresses and ${config.totalAmounts.length} amounts`
    );
  }

  // Encode the BondModule initData: (address[] tokenAddresses, uint256[] totalAmounts)
  const encodedData = encodeAbiParameters(
    [
      { type: 'address[]', name: 'tokenAddresses' },
      { type: 'uint256[]', name: 'totalAmounts' },
    ],
    [config.tokenAddresses, config.totalAmounts],
  );

  return encodedData as Hex;
};

/**
 * Helper to create BondModule config
 * 
 * @param tokenAddresses - Array of token addresses to bond (e.g., USDC addresses)
 * @param totalAmounts - Array of total amounts for each token (must match tokenAddresses length)
 * @returns BondModuleConfig ready for encoding
 * 
 * @example
 * ```typescript
 * const config = createBondModuleConfig(
 *   ['0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d'], // USDC on Arbitrum Sepolia
 *   [parseUnits('0.05', 6)] // 0.05 USDC
 * );
 * const encodedData = encodeBondModuleData(config);
 * ```
 */
export const createBondModuleConfig = (
  tokenAddresses: Address[],
  totalAmounts: bigint[],
): BondModuleConfig => {
  if (tokenAddresses.length !== totalAmounts.length) {
    throw new Error(
      `Token addresses and amounts arrays must have the same length. Got ${tokenAddresses.length} addresses and ${totalAmounts.length} amounts`
    );
  }

  return {
    tokenAddresses,
    totalAmounts,
  };
};

