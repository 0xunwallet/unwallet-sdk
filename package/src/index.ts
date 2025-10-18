import { CHAIN_MAPPING } from './utils/chains-constants';
import { type SupportedChain } from './types/supported-chains';
import { getStealthAddress } from './utils/stealth-address';
import { getTransactions as fetchTransactions } from './utils/transaction-utils';
import { type TransactionResult } from './types/withdrawal-data';
import { PublicClient, WalletClient } from 'viem';
import { singlePayment, transferWithAuthorization } from './utils/payment-utils';
import {
  signAccountConfig,
  getApiKey,
  getRecipientAccountData,
  checkBalanceGreaterThan,
  getBalance,
} from './utils/create-account';
import {
  type SinglePaymentResult,
  type TransferWithAuthorizationResult,
  type TransferWithAuthorizationData,
} from './types/payments';
import { type StealthAddressResponse } from './types/stealth-address';
import {
  type Module,
  type Texts,
  type EnsData,
  type CommonData,
  type RegisterRequest,
  type AccountConfig,
  type SignedAccountConfig,
} from './types/account-types';
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

export const createTransferWithAuthorization = async ({
  walletClient,
  chainId,
  tokenAddress,
  recipientAddress,
  amount,
  validAfter,
  validBefore,
}: {
  walletClient: WalletClient;
  chainId: SupportedChain;
  tokenAddress: string;
  recipientAddress: string;
  amount: string;
  validAfter?: string;
  validBefore?: string;
}): Promise<TransferWithAuthorizationResult> => {
  return await transferWithAuthorization({
    walletClient,
    chainId,
    tokenAddress,
    recipientAddress,
    amount,
    validAfter,
    validBefore,
  });
};

export { CHAIN_MAPPING };

export {
  signAccountConfig,
  getApiKey,
  getRecipientAccountData,
  checkBalanceGreaterThan,
  getBalance,
};

export type {
  PaymentStatus,
  PaymentStatusData,
  PollingOptions,
  StealthAddressResponse,
  SupportedChain,
  TransferWithAuthorizationResult,
  TransferWithAuthorizationData,
  Module,
  Texts,
  EnsData,
  CommonData,
  RegisterRequest,
  AccountConfig,
  SignedAccountConfig,
};
