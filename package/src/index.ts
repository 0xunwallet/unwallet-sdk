import { CHAIN_MAPPING } from './utils/chains-constants';
import { type SupportedChain } from './types/supported-chains';
import { getStealthAddress } from './utils/stealth-address';

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
