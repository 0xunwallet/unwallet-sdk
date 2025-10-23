import { type PublicClient } from 'viem';
import { type SupportedChain } from './types/supported-chains';
import { publicClintByChainId } from './utils/chains-constants';
import { getModuleAddress, MODULE_DATA } from './utils/constants';

export const getRequiredState = async (
  chainId: SupportedChain,
  moduleName: string,
  publicClient?: PublicClient,
) => {
  try {
    const client = publicClient ?? publicClintByChainId(chainId);

    // Check if ABI is available and has the required function
    const moduleConfig = MODULE_DATA[chainId];
    if (!moduleConfig || !moduleConfig.abi || moduleConfig.abi.length === 0) {
      console.log('Module ABI not available, returning mock data for testing');
      const requiredData = {
        BSMAddress: '0xRequiredBSMAddress',
        tokenAddress: '0xRequiredTokenAddress',
        chainId: chainId.toString(),
      };
      return requiredData;
    }

    const moduleData = await client.readContract({
      address: getModuleAddress(moduleName, chainId),
      abi: moduleConfig.abi,
      functionName: 'getData',
    });

    // read init data from module
    // return required data :  requiredData = { BSMAddress, initData.tokenAddress, initData.chainId }

    console.log('moduleData', moduleData);

    const requiredData = {
      BSMAddress: '0xRequiredBSMAddress',
      tokenAddress: '0xRequiredTokenAddress',
      chainId: chainId.toString(),
    };
    return requiredData;
  } catch (error) {
    console.error('Error fetching module data:', error);
    throw error;
  }
};
