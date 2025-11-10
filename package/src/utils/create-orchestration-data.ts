import {
  type OrchestrationData,
  type CurrentState,
  type RequiredState,
} from '../types/orchestration-data';
import { type RequiredStateData } from '../types/module-types';
import { type Address, type Hex } from 'viem';
import { SERVER_URL_ENS } from './constants';

export interface OrchestrationApiResponse {
  success: boolean;
  error?: string;
  data?: {
    requestId: string;
    sourceChainOwner: string;
    destinationChainOwner: string;
    sourceChainId: number;
    destinationChainId: number;
    sourceTokenAddress: string;
    sourceTokenAmount: string;
    destinationTokenAddress: string;
    destinationTokenAmount: string;
    accountAddressOnSourceChain: string;
    sourceChainAccountModules: string[];
    accountAddressOnDestinationChain: string;
    destinationChainAccountModules: string[];
    sourceInitData?: string;
    sourceSalt?: string;
    destinationInitData?: string;
    destinationSalt?: string;
  };
}

export const createOrchestrationData = async (
  currentState: CurrentState,
  requiredState: RequiredState | RequiredStateData,
  ownerAddress: Address,
  apiKey: string,
  encodedData?: Hex,
): Promise<OrchestrationData> => {
  try {
    // Extract moduleAddress - it can be a direct property (RequiredStateData) or in configTemplate (RequiredState)
    // RequiredStateData has moduleAddress as a direct property, RequiredState has it in configTemplate
    let moduleAddress: string;
    if ('moduleAddress' in requiredState && typeof requiredState.moduleAddress === 'string') {
      // RequiredStateData case - moduleAddress is a direct property
      moduleAddress = requiredState.moduleAddress;
    } else {
      // RequiredState case - moduleAddress might be in configTemplate
      const configModuleAddress = requiredState.configTemplate.moduleAddress;
      moduleAddress =
        typeof configModuleAddress === 'string'
          ? configModuleAddress
          : '0x0000000000000000000000000000000000000000';
    }

    // Convert chainId to number - currentState.chainId can be string or number
    // but API expects number for consistency
    const sourceChainId = typeof currentState.chainId === 'string' 
      ? parseInt(currentState.chainId) 
      : currentState.chainId;
    const destChainId = parseInt(requiredState.chainId);
    
    // Prepare the API request payload
    const apiRequestPayload = {
      currentState: [
        {
          chainId: sourceChainId, // Ensure it's a number
          tokenAddress: currentState.tokenAddress,
          amount: currentState.tokenAmount,
        },
      ],
      requiredStateData: [
        {
          moduleAddress,
          chainId: destChainId, // Already a number
          encodedData: encodedData || '0x',
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
      const errorText = await response.text();
      throw new Error(`API call failed with status: ${response.status} - ${response.statusText}\n${errorText}`);
    }

    const apiResult = (await response.json()) as OrchestrationApiResponse;
    console.log('API Response:', JSON.stringify(apiResult, null, 2));

    if (!apiResult.success || !apiResult.data) {
      throw new Error(`Orchestration failed: ${apiResult.error || 'Unknown error'}`);
    }

    const data = apiResult.data;

    // Extract token decimals from addresses (heuristic: 6 for USDC, 18 for others)
    // In production, you'd fetch this from the token contract using ERC20 decimals() function
    const isSourceUSDC = 
      currentState.tokenAddress.toLowerCase().includes('usdc') ||
      currentState.tokenAddress.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e' ||
      currentState.tokenAddress.toLowerCase() === '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d';
    
    const isDestUSDC = 
      data.destinationTokenAddress.toLowerCase().includes('usdc') ||
      data.destinationTokenAddress.toLowerCase() === '0x036cbd53842c5426634e7929541ec2318f3dcf7e' ||
      data.destinationTokenAddress.toLowerCase() === '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d';

    const sourceTokenDecimals = isSourceUSDC ? 6 : 18;
    const destinationTokenDecimals = isDestUSDC ? 6 : 18;

    // Parse token amounts to bigint
    // Server returns amounts as strings in smallest unit (wei-equivalent), so we just convert to bigint
    const sourceTokenAmount = BigInt(data.sourceTokenAmount);
    const destinationTokenAmount = BigInt(data.destinationTokenAmount);

    // Create orchestration data structure from server response
    const orchestrationData: OrchestrationData = {
      requestId: data.requestId as Hex,
      sourceChainOwner: data.sourceChainOwner as Address,
      destinationChainOwner: data.destinationChainOwner as Address,
      sourceChainId: data.sourceChainId,
      destinationChainId: data.destinationChainId,
      sourceTokenAddress: data.sourceTokenAddress as Address,
      sourceTokenAmount,
      destinationTokenAddress: data.destinationTokenAddress as Address,
      destinationTokenAmount,
      accountAddressOnSourceChain: data.accountAddressOnSourceChain as Address,
      sourceChainAccountModules: data.sourceChainAccountModules as Address[],
      accountAddressOnDestinationChain: data.accountAddressOnDestinationChain as Address,
      destinationChainAccountModules: data.destinationChainAccountModules as Address[],
    };

    return orchestrationData;
  } catch (error) {
    console.error('Error creating orchestration data:', error);
    throw error;
  }
};
