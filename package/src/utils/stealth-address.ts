import axios from 'axios';
import { type SupportedChain } from '../types/supported-chains';
import { CHAIN_MAPPING } from './chains-constants';
import { BACKEND_URL } from './constants';

export const getStealthAddress = async (
  tokenAddress: string,
  username: string,
  chainId: SupportedChain,
) => {
  const stealthAddresses: string[] = [];
  const safeAddresses: string[] = [];

  const chain = CHAIN_MAPPING[chainId];
  const usernameStr = username as string;

  let res = {};

  try {
    // Headers to match the curl request exactly
    const headers = {
      accept: '*/*',
      'accept-language': 'en-GB,en-US;q=0.9,en;q=0.8,hi;q=0.7',
      'content-type': 'application/json',
      dnt: '1',
    };

    const stealthResponse = await axios.post(
      `${BACKEND_URL}/api/user/${username}/stealth`,
      {
        chainId: chain?.chainId,
        tokenAddress: tokenAddress,
        tokenAmount: (50 * 5).toString(),
      },
      { headers },
    );

    const stealthResponseData = stealthResponse.data;

    const stealthData = stealthResponseData.data;
    stealthAddresses.push(stealthData.address);

    // Only use safeAddress if it exists in the response
    if (stealthData.safeAddress && stealthData.safeAddress.address) {
      safeAddresses.push(stealthData.safeAddress.address);
    } else {
      throw new Error('No safeAddress in response');
    }

    const nonceResponse = await axios.get(`${BACKEND_URL}/api/user/${usernameStr}/nonce`, {
      headers: { 'Content-Type': 'application/json' },
    });

    const nonceResponseData = nonceResponse.data;
    const currentNonce = nonceResponseData.data.currentNonce;
    const usedNonce = currentNonce - 1;

    res = {
      ...stealthData,
      usedNonce: usedNonce,
      currentNonce: currentNonce,
    };
  } catch (error) {
    console.error(
      `    ❌ Failed to generate stealth address:`,
      error instanceof Error ? error.message : String(error),
    );

    // Additional debugging for network errors
    if (error instanceof TypeError && error.message === 'Failed to fetch') {
      console.error('🌐 Network Error Details:');
      console.error('- Check if the server is running');
      console.error('- Check CORS settings');
      console.error('- Check network connectivity');
      console.error('- Server URL:', `${BACKEND_URL}/api/user/${usernameStr}/stealth`);
    }

    throw error;
  }

  return res;
};
