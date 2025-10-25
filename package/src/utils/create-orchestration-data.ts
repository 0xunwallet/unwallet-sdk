import { keccak256, toHex, parseEther } from 'viem';
import {
  type OrchestrationData,
  type CurrentState,
  type RequiredState,
} from '../types/orchestration-data';
import { type Address } from 'viem';
import { SERVER_URL_ENS } from './constants';

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

    // Prepare the API request payload
    const apiRequestPayload = {
      currentState: [
        {
          chainId: currentState.chainId,
          tokenAddress: currentState.tokenAddress,
          amount: currentState.tokenAmount,
        },
      ],
      requiredStateData: [
        {
          moduleAddress:
            requiredState.configTemplate.moduleAddress ||
            '0x0000000000000000000000000000000000000000',
          chainId: parseInt(requiredState.chainId),
          encodedData: '0x', // Placeholder for encoded data
        },
      ],
      userAddress: ownerAddress,
      apiKey: apiKey,
    };

    console.log(
      'Making API call to orchestration endpoint with payload:',
      JSON.stringify(apiRequestPayload, null, 2),
    );

    // Make the API call to the orchestration endpoint
    const response = await fetch(`${SERVER_URL_ENS}/api/v1/orchestration/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(apiRequestPayload),
    });

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status} - ${response.statusText}`);
    }

    const apiResult = await response.json();
    console.log('API Response:', JSON.stringify(apiResult, null, 2));

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
