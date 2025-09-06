import { CHAIN_MAPPING } from './utils/chains-constants';
import { type SupportedChain } from './types/supported-chains';
import { getStealthAddress } from './utils/stealth-address';
import { getTransactions as fetchTransactions } from './utils/transaction-utils';
import { type TransactionResult } from './types/withdrawal-data';
import { PublicClient, WalletClient } from 'viem';
import { singlePayment } from './utils/payment-utils';
import { type SinglePaymentResult } from './types/payments';
import { type StealthAddressResponse } from './types/stealth-address';
import {
  checkPaymentStatus as checkPaymentStatusUtil,
  pollPaymentStatus as pollPaymentStatusUtil,
  type PaymentStatus,
  type PaymentStatusData,
  type PollingOptions,
} from './utils/payment-status';

export const createStealthAddress = async ({
  username,
  chainId,
  tokenAddress,
}: {
  username: string;
  chainId: SupportedChain;
  tokenAddress?: string;
}): Promise<StealthAddressResponse> => {
  const chain = CHAIN_MAPPING[chainId];
  if (!chain) {
    throw new Error(`Chain ${chainId} not supported yet!`);
  }

  const address = await getStealthAddress(tokenAddress as string, username, chainId);
  return address;
};

export const getTransactions = async ({
  username,
  publicClient,
}: {
  username: string;
  publicClient: PublicClient;
}): Promise<TransactionResult> => {
  return await fetchTransactions({ username, publicClient });
};

export const processSinglePayment = async ({
  walletClient,
  publicClient,
  chainId,
  tokenAddress,
  requestedAmount,
  recipientAddress,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  chainId: SupportedChain;
  tokenAddress: string;
  requestedAmount: string;
  recipientAddress: string;
}): Promise<SinglePaymentResult> => {
  const result = await singlePayment({
    walletClient,
    publicClient,
    chainId,
    tokenAddress,
    requestedAmount,
    recipientAddress,
  });
  return result;
};

export const checkPaymentStatus = checkPaymentStatusUtil;
export const pollPaymentStatus = pollPaymentStatusUtil;
export type { PaymentStatus, PaymentStatusData, PollingOptions, StealthAddressResponse };
