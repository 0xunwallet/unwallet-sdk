import { getModules } from './modules-api';
import {
  type ModuleInfo,
  type RegistrationModule,
  type ModulesResponse,
} from '../types/account-types';

export interface ModuleUserInput {
  moduleId: string;
  chainId: number;
  inputs: Record<string, string | number>;
}

export interface ModuleGenerationResult {
  modules: RegistrationModule[];
  errors: string[];
}

/**
 * Generates module JSON format for registration from user inputs
 * @param userModuleInputs - Array of user module inputs
 * @returns Promise<ModuleGenerationResult> - Generated modules and any errors
 */
export const generateModulesForRegistration = async (
  userModuleInputs: ModuleUserInput[],
): Promise<ModuleGenerationResult> => {
  try {
    // Fetch available modules from API
    const modulesResponse: ModulesResponse = await getModules();

    if (!modulesResponse.success) {
      throw new Error('Failed to fetch modules from API');
    }

    const modules: RegistrationModule[] = [];
    const errors: string[] = [];

    for (const userInput of userModuleInputs) {
      try {
        const module = await generateSingleModule(userInput, modulesResponse);
        if (module) {
          modules.push(module);
        }
      } catch (error) {
        errors.push(
          `Module ${userInput.moduleId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    return { modules, errors };
  } catch (error) {
    throw new Error(
      `Failed to generate modules: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
};

/**
 * Generates a single module from user input
 * @param userInput - User module input
 * @param modulesResponse - Available modules from API
 * @returns Module or null if not found
 */
const generateSingleModule = async (
  userInput: ModuleUserInput,
  modulesResponse: ModulesResponse,
): Promise<RegistrationModule | null> => {
  // Find the module by ID
  const moduleInfo = modulesResponse.modules.find((m) => m.id === userInput.moduleId);

  if (!moduleInfo) {
    throw new Error(`Module '${userInput.moduleId}' not found`);
  }

  // Find deployment for the specified chain
  const deployment = moduleInfo.deployments.find((d) => d.chainId === userInput.chainId);

  if (!deployment) {
    throw new Error(`Module '${userInput.moduleId}' not deployed on chain ${userInput.chainId}`);
  }

  // Validate required fields
  const missingFields = moduleInfo.userInputs.requiredFields.filter(
    (field) => !(field.name in userInput.inputs),
  );

  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.map((f) => f.name).join(', ')}`);
  }

  // Get example request format from installation guide
  const exampleRequest = modulesResponse.installationGuide.exampleRequests[userInput.moduleId];

  if (!exampleRequest) {
    throw new Error(`No example request format found for module '${userInput.moduleId}'`);
  }

  // Generate encoded data from user inputs
  // Note: This is a simplified version. In production, you would need to:
  // 1. Encode the user inputs according to the module's ABI
  // 2. Use proper encoding libraries like viem's encodeFunctionData
  const encodedData = generateEncodedData(userInput, moduleInfo, exampleRequest);

  const module: RegistrationModule = {
    address: deployment.address,
    chainId: userInput.chainId.toString(),
    data: encodedData,
  };

  return module;
};

/**
 * Generates encoded data from user inputs
 * This is a simplified implementation. In production, you would use proper ABI encoding
 * @param userInput - User module input
 * @param moduleInfo - Module information
 * @param exampleRequest - Example request format
 * @returns Encoded hex string
 */
const generateEncodedData = (
  userInput: ModuleUserInput,
  moduleInfo: ModuleInfo,
  exampleRequest: { registerRequestFormat: { data: string } },
): string => {
  // For now, we'll use a simplified approach that maps user inputs to the example format
  // In production, this should use proper ABI encoding based on the module's contract

  const requiredFields = moduleInfo.userInputs.requiredFields;

  // Create a mapping of field names to their values
  const fieldValues: Record<string, string | number> = {};

  for (const field of requiredFields) {
    if (field.name in userInput.inputs) {
      fieldValues[field.name] = userInput.inputs[field.name];
    }
  }

  // For demonstration, we'll return the example data
  // In production, you would:
  // 1. Get the module's ABI from the API or a registry
  // 2. Use encodeFunctionData to encode the user inputs
  // 3. Return the properly encoded hex string

  console.warn(
    `⚠️  Using example encoded data for module ${userInput.moduleId}. In production, implement proper ABI encoding.`,
  );
  console.warn(`User inputs:`, fieldValues);

  return exampleRequest.registerRequestFormat.data;
};

/**
 * Gets available modules with their required fields for easy reference
 * @returns Promise<ModuleInfo[]> - Available modules with their requirements
 */
export const getAvailableModules = async (): Promise<ModuleInfo[]> => {
  const modulesResponse = await getModules();

  if (!modulesResponse.success) {
    throw new Error('Failed to fetch modules from API');
  }

  return modulesResponse.modules;
};

/**
 * Validates user input against module requirements
 * @param moduleId - Module ID to validate against
 * @param userInputs - User inputs to validate
 * @returns Promise<{valid: boolean, errors: string[]}> - Validation result
 */
export const validateModuleInputs = async (
  moduleId: string,
  userInputs: Record<string, string | number>,
): Promise<{ valid: boolean; errors: string[] }> => {
  try {
    const modules = await getAvailableModules();
    const module = modules.find((m) => m.id === moduleId);

    if (!module) {
      return { valid: false, errors: [`Module '${moduleId}' not found`] };
    }

    const errors: string[] = [];

    // Check required fields
    for (const requiredField of module.userInputs.requiredFields) {
      if (!(requiredField.name in userInputs)) {
        errors.push(`Missing required field: ${requiredField.name}`);
      }
    }

    // Check if chainId is supported
    const supportedChainIds = module.deployments.map((d) => d.chainId);
    if (userInputs.chainId && !supportedChainIds.includes(Number(userInputs.chainId))) {
      errors.push(
        `Chain ID ${userInputs.chainId} not supported. Supported chains: ${supportedChainIds.join(', ')}`,
      );
    }

    return { valid: errors.length === 0, errors };
  } catch (error) {
    return { valid: false, errors: [error instanceof Error ? error.message : 'Unknown error'] };
  }
};
