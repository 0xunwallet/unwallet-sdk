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
