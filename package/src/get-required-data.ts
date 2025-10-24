import {
  type RequiredStateData,
  type ConfigField,
  type GetRequiredStateInput,
} from './types/module-types';
import { publicClintByChainId } from './utils/chains-constants';
import { getModuleAddress, MODULE_DATA, AAVE_POOL_ADDRESSES } from './utils/constants';

export const getRequiredState = async ({
  sourceChainId,
  moduleName,
  publicClient,
}: GetRequiredStateInput): Promise<RequiredStateData> => {
  try {
    // Handle fixed fields for INVEST_IN_VERIFIABLE_AGENTS and INVEST_IN_AAVE modules
    if (moduleName === 'INVEST_IN_VERIFIABLE_AGENTS' || moduleName === 'INVEST_IN_AAVE') {
      // Get token address based on chain ID
      const getTokenAddress = (chainId: number) => {
        switch (chainId) {
          case 84532: // Base Sepolia
            return '0x036cbd53842c5426634e7929541ec2318f3dcf7e';
          case 421614: // Arbitrum Sepolia
            return '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d';
          default:
            return '0x0000000000000000000000000000000000000000'; // Default placeholder
        }
      };

      const tokenAddress = getTokenAddress(sourceChainId);

      const fixedFields: ConfigField[] = [
        { type: 'uint256', name: 'chainId' },
        { type: 'address', name: 'tokenAddress' },
      ];

      const fixedConfigTemplate = {
        chainId: sourceChainId.toString(),
        tokenAddress: tokenAddress,
      };

      return {
        chainId: sourceChainId.toString(),
        moduleName: moduleName,
        configInputType: 'tuple[](uint256 chainId, address tokenAddress)',
        requiredFields: fixedFields,
        configTemplate: fixedConfigTemplate,
      };
    }

    const client = publicClient ?? publicClintByChainId(sourceChainId);

    // Check if ABI is available and has the required function
    const moduleConfig = MODULE_DATA[sourceChainId];

    const configInputTypeData = await client.readContract({
      address: getModuleAddress(moduleName, sourceChainId),
      abi: moduleConfig.abi,
      functionName: 'getConfigInputTypeData',
    });

    console.log('configInputTypeData', configInputTypeData);

    // Parse the config input type to extract field names and types
    const parseConfigInputType = (configType: string) => {
      // Extract the tuple content from "tuple[](field1,field2,field3)"
      const tupleMatch = configType.match(/tuple\[\]\(([^)]+)\)/);
      if (!tupleMatch) {
        return { fields: [], readableFormat: {} };
      }

      const fieldsString = tupleMatch[1];
      const fields: ConfigField[] = fieldsString.split(',').map((field) => {
        const parts = field.trim().split(' ');
        return {
          type: parts[0] as ConfigField['type'],
          name: parts[1] || 'unknown',
        };
      });

      // Create readable format with actual values where possible
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const readableFormat: Record<string, any> = {};
      fields.forEach((field) => {
        switch (field.type) {
          case 'uint256':
            if (field.name === 'sourceChainId') {
              readableFormat[field.name] = sourceChainId.toString();
            } else {
              readableFormat[field.name] = '0'; // Placeholder for other uint256
            }
            break;
          case 'address':
            if (field.name === 'vaultAddress') {
              // Use the actual AAVE pool address as the vault address for all modules
              readableFormat[field.name] = AAVE_POOL_ADDRESSES[sourceChainId];
            } else {
              readableFormat[field.name] = '0x0000000000000000000000000000000000000000'; // Placeholder for other addresses
            }
            break;
          case 'uint24':
            readableFormat[field.name] = '0'; // Placeholder for uint24
            break;
          default:
            readableFormat[field.name] = null; // Unknown type
        }
      });

      return { fields, readableFormat };
    };

    const { fields, readableFormat } = parseConfigInputType(configInputTypeData as string);

    const requiredData: RequiredStateData = {
      chainId: sourceChainId.toString(),
      moduleName: moduleName,
      configInputType: configInputTypeData as string,
      requiredFields: fields,
      configTemplate: readableFormat,
    };
    return requiredData;
  } catch (error) {
    console.error('Error fetching module data:', error);
    throw error;
  }
};
