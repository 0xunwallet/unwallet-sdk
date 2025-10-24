import type { Address, Hex } from 'viem';
import type { SupportedChain } from './supported-chains';

export interface OrchestrationData {
  requestId: Hex; // bytes32 - to track in future
  sourceChainOwner: Address; // owner of account SC
  destinationChainOwner: Address; // owner of account DC
  sourceChainId: number; // polygon
  destinationChainId: number; // base
  sourceTokenAddress: Address; // DAI
  sourceTokenAmount: bigint; // 5.1
  destinationTokenAddress: Address; // USDC
  destinationTokenAmount: bigint; // QUOTED AMOUNT
  accountAddressOnSourceChain: Address; // computed by Server
  sourceChainAccountModules: Address[]; // provided by server for SC (SWAP, CROSS)
  accountAddressOnDestinationChain: Address; // computed by Server on DC
  destinationChainAccountModules: Address[]; // provided by server for DC (BOND)
}

export interface CurrentState {
  chainId: SupportedChain;
  tokenAddress: Address;
  tokenAmount: string;
  ownerAddress: Address;
}

export interface RequiredState {
  chainId: string;
  moduleName: string;
  configInputType: string;
  requiredFields: Array<{
    type: string;
    name: string;
  }>;
  configTemplate: Record<string, string | number | null>;
}
