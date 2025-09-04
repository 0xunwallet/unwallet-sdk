import { CHAIN_MAPPING } from './utils/chains-constants';
import { type SupportedChain } from './types/supported-chains';
import { getStealthAddress, processSingleRedemptionWithSponsorship } from './utils/stealth-address';
import { type RedemptionResult } from './types/redemption-result';
import { PublicClient, WalletClient } from 'viem';

export const createStealthAddress = async ({
  username,
  chainId,
  tokenAddress,
}: {
  username: string;
  chainId: SupportedChain;
  tokenAddress?: string;
}) => {
  const chain = CHAIN_MAPPING[chainId];
  if (!chain) {
    throw new Error(`Chain ${chainId} not supported yet!`);
  }

  const address = await getStealthAddress(tokenAddress as string, username, chainId);
  return address;
};

export const processOnePayment = async ({
  walletClient,
  publicClient,
  chainId,
  username,
  tokenAddress,
  amount,
  decimals,
  token,
  nonce,
  recipientAddress,
}: {
  walletClient: WalletClient;
  publicClient: PublicClient;
  username: string;
  chainId: SupportedChain;
  tokenAddress: string;
  amount: string;
  decimals: number;
  token: string;
  nonce: number;
  recipientAddress: string;
}): Promise<RedemptionResult> => {
  const payment = {
    username,
    tokenAddress,
    amount,
    decimals,
    token,
    recipientAddress,
  };
  const address = await processSingleRedemptionWithSponsorship(
    nonce,
    chainId,
    walletClient,
    publicClient,
    payment,
  );
  return address;
};
