import axios from 'axios';
import { type SupportedChain } from '../types/supported-chains';
import { CHAIN_MAPPING } from './chains-constants';
import { BACKEND_URL, getStealthAddressGenerationMessage } from './constants';
import { type StealthAddressResponse } from '../types/stealth-address';
import {
  generateEphemeralPrivateKey,
  extractViewingPrivateKeyNode,
  generateKeysFromSignature,
  generateStealthPrivateKey,
} from '@fluidkey/stealth-account-kit';
import { type Account, type WalletClient } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const getStealthAddress = async (
  tokenAddress: string,
  username: string,
  chainId: SupportedChain,
): Promise<StealthAddressResponse> => {
  const stealthAddresses: string[] = [];
  const safeAddresses: string[] = [];

  const chain = CHAIN_MAPPING[chainId];
  const usernameStr = username as string;

  let res: StealthAddressResponse = {} as StealthAddressResponse;

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
      success: stealthResponseData.success,
      timestamp: stealthResponseData.timestamp,
      data: {
        address: stealthData.address,
        chainId: stealthData.chainId,
        chainName: stealthData.chainName,
        tokenAddress: stealthData.tokenAddress,
        tokenAmount: stealthData.tokenAmount,
        paymentId: stealthData.paymentId,
        safeAddress: stealthData.safeAddress,
        eventListener: stealthData.eventListener,
        usedNonce: usedNonce,
        currentNonce: currentNonce,
      },
      message: stealthResponseData.message,
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

// TODO: fetch sign message from contract
export const generateInitialKeysOnClient = async ({
  uniqueNonces,
  walletClient,
  chainId,
}: {
  uniqueNonces: number[];
  walletClient: WalletClient;
  chainId: SupportedChain;
}) => {
  if (!walletClient) {
    throw new Error('Wallet client not available');
  }

  // STEP 1: Create a deterministic message for signing
  const message = getStealthAddressGenerationMessage(chainId);

  const signature = await walletClient.signMessage({
    message,
    account: walletClient.account as Account,
  });

  const keys = generateKeysFromSignature(signature);

  // STEP 5: Extract the viewing key node (used for address generation)
  const viewKeyNodeNumber = 0; // Use the first node
  const viewingPrivateKeyNode = extractViewingPrivateKeyNode(
    keys.viewingPrivateKey,
    viewKeyNodeNumber,
  );

  const processedKeys = uniqueNonces.map((nonce) => {
    const ephemeralPrivateKey = generateEphemeralPrivateKey({
      viewingPrivateKeyNode: viewingPrivateKeyNode,
      nonce: BigInt(nonce.toString()), // convert to bigint
      chainId: chainId,
    });

    const ephemeralPrivateKeyRaw = ephemeralPrivateKey;
    console.log('ephemeralPrivateKeyRaw', ephemeralPrivateKeyRaw);

    const ephemeralPrivateKeyHex = ephemeralPrivateKey.ephemeralPrivateKey;

    console.log('ephemeralPrivateKeyHex', ephemeralPrivateKeyHex);

    // Ensure it's in the correct format (0x prefixed hex string)
    const formattedEphemeralPrivateKey = `${ephemeralPrivateKeyHex}` as `0x${string}`;

    console.log('formattedEphemeralPrivateKey', formattedEphemeralPrivateKey);

    // Generate the ephemeral public key
    const ephemeralPublicKey = privateKeyToAccount(formattedEphemeralPrivateKey).publicKey;

    console.log('ephemeralPublicKey', ephemeralPublicKey);

    // Generate spending private key for this nonce
    const spendingPrivateKey = generateStealthPrivateKey({
      spendingPrivateKey: keys.spendingPrivateKey,
      ephemeralPublicKey: ephemeralPublicKey,
    });

    // Handle the case where spendingPrivateKey might be an object, Uint8Array, or string
    const spendingPrivateKeyRaw =
      (spendingPrivateKey as { stealthPrivateKey?: string }).stealthPrivateKey ||
      (spendingPrivateKey as { privateKey?: string }).privateKey ||
      (spendingPrivateKey as { spendingPrivateKey?: string }).spendingPrivateKey ||
      (spendingPrivateKey as { key?: string }).key ||
      (spendingPrivateKey as { value?: string }).value ||
      spendingPrivateKey;

    let formattedSpendingPrivateKey;
    if (
      (typeof spendingPrivateKeyRaw === 'object' && 'byteLength' in spendingPrivateKeyRaw) ||
      (typeof Buffer !== 'undefined' && Buffer.isBuffer(spendingPrivateKeyRaw))
    ) {
      const spendingPrivateKeyHex = Array.from(spendingPrivateKeyRaw as Uint8Array)
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
      formattedSpendingPrivateKey = `0x${spendingPrivateKeyHex}` as `0x${string}`;
    } else if (typeof spendingPrivateKeyRaw === 'string') {
      const cleanHex = spendingPrivateKeyRaw.replace('0x', '');
      formattedSpendingPrivateKey = `0x${cleanHex}` as `0x${string}`;
    } else {
      // If we still have an object, try to find the actual key
      console.error('Unable to extract private key from:', spendingPrivateKeyRaw);
      throw new Error('Cannot extract private key from spendingPrivateKey object');
    }

    return formattedSpendingPrivateKey;
  });

  return processedKeys;
};
