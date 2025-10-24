import { CHAIN_MAPPING } from './utils/chains-constants';
import { type SupportedChain } from './types/supported-chains';
import {
  type ModuleName,
  type RequiredStateData,
  type ConfigField,
  type GetRequiredStateInput,
  AVAILABLE_MODULES,
  type ValidModuleName,
} from './types/module-types';
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
import { getModules } from './utils/modules-api';
import {
  generateModulesForRegistration,
  getAvailableModules,
  validateModuleInputs,
  type ModuleUserInput,
  type ModuleGenerationResult,
} from './utils/module-generator';
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
  type ModuleInfo,
  type ModuleDeployment,
  type ModulesResponse,
  type RequiredField,
  type TokenInfo,
  type NetworkTokens,
  type UserInputs,
  type ModuleFormat,
  type ExampleRequest,
  type InstallationGuide,
  type RegistrationModule,
} from './types/account-types';
import {
  checkPaymentStatus as checkPaymentStatusUtil,
  pollPaymentStatus as pollPaymentStatusUtil,
  type PaymentStatus,
  type PaymentStatusData,
  type PollingOptions,
} from './utils/payment-status';
import {
  generatePrivacyKeys,
  buildEnsData,
  buildRegistrationData,
  signRegistrationData,
  prepareRegisterRequest,
  prettyPrintRegisterRequest,
} from './utils/registration-prep';
import { getRequiredState } from './get-required-data';
import { getRequiredAvailableModules } from './utils/constants';
import { createOrchestrationData } from './utils/create-orchestration-data';
import { deposit, depositFromOrchestrationData } from './utils/deposit';
import type { OrchestrationData, CurrentState, RequiredState } from './types/orchestration-data';
import type { DepositResult } from './utils/deposit';

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
  getModules,
  generateModulesForRegistration,
  getAvailableModules,
  getRequiredAvailableModules,
  validateModuleInputs,
  getRequiredState,
  createOrchestrationData,
  deposit,
  depositFromOrchestrationData,
  // Registration prep (no network)
  generatePrivacyKeys,
  buildEnsData,
  buildRegistrationData,
  signRegistrationData,
  prepareRegisterRequest,
  prettyPrintRegisterRequest,
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
  ModuleInfo,
  ModuleDeployment,
  ModulesResponse,
  RequiredField,
  TokenInfo,
  NetworkTokens,
  UserInputs,
  ModuleFormat,
  ExampleRequest,
  InstallationGuide,
  RegistrationModule,
  ModuleUserInput,
  ModuleGenerationResult,
  OrchestrationData,
  CurrentState,
  RequiredState,
  DepositResult,
  // Module types
  ModuleName,
  RequiredStateData,
  ConfigField,
  GetRequiredStateInput,
  AVAILABLE_MODULES,
  ValidModuleName,
};
