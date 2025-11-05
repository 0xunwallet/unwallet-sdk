import type { WalletClient, PublicClient } from 'viem';
import type { OrchestrationData } from '../types/orchestration-data';
import { depositFromOrchestrationData, type DepositResult } from './deposit';

/**
 * Transfer ERC20 tokens to the orchestration source account
 * This is a convenience wrapper around depositFromOrchestrationData
 */
export const transferToOrchestrationAccount = async (
  orchestrationData: OrchestrationData,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<DepositResult> => {
  return depositFromOrchestrationData(orchestrationData, walletClient, publicClient);
};

