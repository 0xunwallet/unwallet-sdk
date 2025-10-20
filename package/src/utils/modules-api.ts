import { SERVER_URL_ENS } from './constants';
import { type ModulesResponse } from '../types/account-types';

/**
 * Fetches all available smart contract modules from the API
 * @returns Promise<ModulesResponse> - The modules data including deployments and supported networks
 * @throws Error if the API request fails
 */
export const getModules = async (): Promise<ModulesResponse> => {
  try {
    const response = await fetch(`${SERVER_URL_ENS}/modules`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch modules: ${response.status} ${response.statusText}`);
    }

    const data: ModulesResponse = await response.json();

    if (!data.success) {
      throw new Error('API returned unsuccessful response');
    }

    return data;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Error fetching modules: ${error.message}`);
    }
    throw new Error('Unknown error occurred while fetching modules');
  }
};
