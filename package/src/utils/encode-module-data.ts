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

