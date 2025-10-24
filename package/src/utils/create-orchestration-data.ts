import { keccak256, toHex, parseEther } from 'viem';
import {
  type OrchestrationData,
  type CurrentState,
  type RequiredState,
} from '../types/orchestration-data';
import { type Address } from 'viem';

export const createOrchestrationData = async (
  currentState: CurrentState,
  requiredState: RequiredState,
  ownerAddress: Address,
  apiKey: string,
): Promise<OrchestrationData> => {
  try {
    // Generate a unique request ID using keccak256 hash
    const requestId = keccak256(
      toHex(
        `${currentState.chainId}-${currentState.tokenAddress}-${currentState.tokenAmount}-${Date.now()}-${Math.random()}`,
      ),
    );

    console.log('apiKey', apiKey);

    // Parse token amounts to bigint
    const sourceTokenAmount = parseEther(currentState.tokenAmount);
    const destinationTokenAmount = parseEther('0'); // Default to 0 since requiredState doesn't have tokenAmount

    // Extract destination token address from configTemplate if available
    // Look for common token address field names in the config template
    const tokenAddressField =
      requiredState.configTemplate.sourceTokenAddress ||
      requiredState.configTemplate.destinationTokenAddress ||
      requiredState.configTemplate.tokenAddress;

    const destinationTokenAddress =
      (tokenAddressField as Address) || ('0x0000000000000000000000000000000000000000' as Address);

    // Create orchestration data structure
    const orchestrationData: OrchestrationData = {
      requestId,
      sourceChainOwner: currentState.ownerAddress,
      destinationChainOwner: ownerAddress,
      sourceChainId: currentState.chainId,
      destinationChainId: parseInt(requiredState.chainId),
      sourceTokenAddress: currentState.tokenAddress,
      sourceTokenAmount,
      destinationTokenAddress,
      destinationTokenAmount,
      accountAddressOnSourceChain: '0x0000000000000000000000000000000000000000' as Address, // Will be computed by server
      sourceChainAccountModules: [], // Will be provided by server for SC (SWAP, CROSS)
      accountAddressOnDestinationChain: '0x0000000000000000000000000000000000000000' as Address, // Will be computed by server
      destinationChainAccountModules: [], // Will be provided by server for DC (BOND)
    };

    return orchestrationData;
  } catch (error) {
    console.error('Error creating orchestration data:', error);
    throw error;
  }
};
