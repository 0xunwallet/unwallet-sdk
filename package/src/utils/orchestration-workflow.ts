import type { WalletClient, PublicClient, Address, Hex } from 'viem';
import type { OrchestrationData } from '../types/orchestration-data';
import { depositFromOrchestrationData, type DepositResult } from './deposit';
import { notifyDeposit, type NotifyDepositResponse } from './orchestration-utils';

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

/**
 * Complete orchestration workflow:
 * 1. Transfer tokens to orchestration account
 * 2. Notify server of deposit
 * 
 * @param orchestrationData - The orchestration data from createOrchestrationData
 * @param walletClient - Wallet client for signing transactions
 * @param publicClient - Public client for reading blockchain state
 * @returns Result with deposit and notification details
 */
export interface ExecuteOrchestrationResult {
  deposit: DepositResult;
  notification: NotifyDepositResponse;
  receipt?: {
    transactionHash: Hex;
    blockNumber: bigint;
  };
}

export const executeOrchestration = async (
  orchestrationData: OrchestrationData,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<ExecuteOrchestrationResult> => {
  // Step 1: Transfer tokens to orchestration account
  const depositResult = await transferToOrchestrationAccount(
    orchestrationData,
    walletClient,
    publicClient,
  );

  if (!depositResult.success || !depositResult.txHash) {
    throw new Error(`Deposit failed: ${depositResult.error || 'Unknown error'}`);
  }

  // Get transaction receipt for block number
  const receipt = await publicClient.waitForTransactionReceipt({
    hash: depositResult.txHash as Hex,
  });

  // Step 2: Notify server of deposit
  const notification = await notifyDeposit({
    requestId: orchestrationData.requestId,
    transactionHash: depositResult.txHash as Hex,
    blockNumber: receipt.blockNumber.toString(),
  });

  return {
    deposit: depositResult,
    notification,
    receipt: {
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
    },
  };
};

