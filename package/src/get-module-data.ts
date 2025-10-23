import { type PublicClient } from 'viem';
import { type SupportedChain } from './types/supported-chains';
import { publicClintByChainId } from './utils/chains-constants';
import { MODULE_DATA } from './utils/constants';

export const getModuleData = async (
  chainId: SupportedChain,
  moduleId: string,
  publicClient?: PublicClient,
) => {
  try {
    const client = publicClient ?? publicClintByChainId(chainId);

    const moduleData = await client.readContract({
      address: moduleId,
      abi: MODULE_DATA[chainId].abi,
      functionName: 'getData',
    });

    // read init data from module data and return init data

    return moduleData;
  } catch (error) {
    console.error('Error fetching module data:', error);
    throw error;
  }
};
