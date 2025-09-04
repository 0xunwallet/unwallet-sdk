import axios from 'axios';
import { type SupportedChain } from '../types/supported-chains';
import { CHAIN_MAPPING, getViemChainById } from './chains-constants';
import { BACKEND_URL, SAFE_ABI, STEALTH_ADDRESS_GENERATION_MESSAGE, USDC_ABI } from './constants';
import {
  generateEphemeralPrivateKey,
  extractViewingPrivateKeyNode,
  generateKeysFromSignature,
  generateStealthPrivateKey,
} from '@fluidkey/stealth-account-kit';
import {
  createWalletClient,
  encodeFunctionData,
  http,
  parseUnits,
  PublicClient,
  WalletClient,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { buildSafeTransaction, predictSafeAddress, safeSignTypedData } from './safe-utils';
import Safe from '@safe-global/protocol-kit';
import { RPC_CONFIG } from './chains-constants';
import { type RedemptionResult } from '../types/redemption-result';

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

export const generateInitialKeysOnClient = async (
  uniqueNonces: number[],
  walletClient: WalletClient,
  chainId: SupportedChain,
) => {
  if (!walletClient) {
    throw new Error('Wallet client not available');
  }

  // STEP 1: Create a deterministic message for signing
  const message = STEALTH_ADDRESS_GENERATION_MESSAGE;

  const signature = await walletClient.signMessage({ account: walletClient.account!, message });

  const keys = generateKeysFromSignature(signature);

  // STEP 5: Extract the viewing key node (used for address generation)
  const viewKeyNodeNumber = 0;
  const viewingPrivateKeyNode = extractViewingPrivateKeyNode(
    keys.viewingPrivateKey,
    viewKeyNodeNumber,
  );

  const processedKeys = uniqueNonces.map((nonce) => {
    const ephemeralPrivateKey = generateEphemeralPrivateKey({
      viewingPrivateKeyNode: viewingPrivateKeyNode,
      nonce: BigInt(nonce.toString()),
      chainId: chainId,
    });

    const ephemeralPrivateKeyHex = ephemeralPrivateKey.ephemeralPrivateKey;

    // Ensure it's in the correct format (0x prefixed hex string)
    const formattedEphemeralPrivateKey = `${ephemeralPrivateKeyHex}` as `0x${string}`;

    // Generate the ephemeral public key
    const ephemeralPublicKey = privateKeyToAccount(formattedEphemeralPrivateKey).publicKey;

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

const executeTransactionWithGasSponsorship = async (
  multicallData: Array<{
    target: string;
    allowFailure: boolean;
    callData: string;
  }>,
  metadata: Record<string, unknown> = {},
  username: string,
  chainId: SupportedChain,
) => {
  try {
    console.log('🌟 Requesting gas sponsorship for transaction...');
    console.log('📋 Multicall data:', {
      numberOfCalls: multicallData.length,
      calls: multicallData.map((call, index) => ({
        index: index + 1,
        target: call.target,
        allowFailure: call.allowFailure,
        dataLength: call.callData.length,
      })),
    });

    // Make request to gas sponsorship endpoint
    const response = await fetch(`${BACKEND_URL}/api/user/${username}/gas-sponsorship`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        multicallData,
        metadata: {
          ...metadata,
          userAgent: navigator.userAgent,
          timestamp: new Date().toISOString(),
          requestId: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
      }),
    });

    const result = await response.json();
    console.log('📄 Backend response:', result);

    if (!response.ok) {
      throw new Error(result.message || result.error || 'Gas sponsorship request failed');
    }

    if (!result.success) {
      throw new Error(result.message || 'Gas sponsorship service returned failure');
    }

    console.log('✅ Gas sponsored transaction completed successfully!');
    console.log('📊 Transaction details:', result);

    const currentNetwork = CHAIN_MAPPING[chainId];
    // Handle the backend response structure
    const txHash = result.data?.transactionHash || 'pending';
    const explorerUrl =
      result.data?.executionDetails?.explorerUrl || `${currentNetwork?.explorerUrl}/tx/${txHash}`;

    return {
      success: true,
      txHash: txHash,
      blockNumber: result.data?.blockNumber || 0,
      gasUsed: result.data?.gasUsed || 'N/A',
      gasCost: result.data?.gasCost || 'N/A',
      explorerUrl: explorerUrl,
      receipt: {
        status: 'success',
        transactionHash: txHash,
        blockNumber: BigInt(result.data?.blockNumber || 0),
        gasUsed: BigInt(result.data?.gasUsed || 0),
      },
      sponsorDetails: {
        sponsorAddress: result.data?.sponsorAddress || 'Unknown',
        chainName: result.data?.executionDetails?.chainName || 'Sei Testnet',
      },
    };
  } catch (error) {
    console.error('❌ Gas sponsorship request failed:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    throw new Error(`Gas sponsorship failed: ${errorMessage}`);
  }
};

export const processSingleRedemptionWithSponsorship = async (
  nonce: number,
  chainId: SupportedChain,
  walletClient: WalletClient,
  publicClient: PublicClient,
  payment: {
    username: string;
    tokenAddress: string;
    amount: string;
    decimals: number;
    token: string;
    recipientAddress: string;
  },
): Promise<RedemptionResult> => {
  try {
    // Generate stealth private key (same as before)
    const keys = await generateInitialKeysOnClient([nonce], walletClient, chainId);
    const spendingPrivateKey = keys[0];
    const stealthAddress = privateKeyToAccount(spendingPrivateKey).address;

    console.log('🔐 Stealth address derived:', stealthAddress);

    // Predict Safe address using centralized RPC configuration
    const predictedSafeAddress = await predictSafeAddress(
      stealthAddress,
      RPC_CONFIG.BASE_SEPOLIA.primary,
    );
    console.log('🏦 Predicted Safe address:', predictedSafeAddress);

    const predictedSafe = {
      safeAccountConfig: {
        owners: [stealthAddress],
        threshold: 1,
      },
      safeDeploymentConfig: {
        saltNonce: '0',
      },
    };

    const RPC_URL = RPC_CONFIG.BASE_SEPOLIA.primary;

    const protocolKit = await Safe.init({
      provider: RPC_URL as string,
      signer: stealthAddress,
      predictedSafe,
    });

    const isSafeDeployed = await protocolKit.isSafeDeployed();
    console.log('isSafeDeployed', isSafeDeployed);

    let deploymentTransaction;
    let safeNonce = 0;

    if (!isSafeDeployed) {
      console.log('🔄 Safe needs to be deployed first');
      deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
      console.log('✅ Safe deployment transaction created', deploymentTransaction);
    } else {
      console.log('✅ Safe is already deployed, getting current nonce...');
      // Get the current nonce from the deployed Safe
      if (!publicClient) {
        throw new Error('Public client not available');
      }

      const safeNonceData = encodeFunctionData({
        abi: [
          {
            inputs: [],
            name: 'nonce',
            outputs: [{ name: '', type: 'uint256' }],
            stateMutability: 'view',
            type: 'function',
          },
        ],
        functionName: 'nonce',
      });

      let safeNonceResult;
      try {
        safeNonceResult = await publicClient.call({
          to: predictedSafeAddress as `0x${string}`,
          data: safeNonceData,
        });
      } catch (error) {
        console.warn('⚠️ RPC call failed, retrying with delay...', error);
        // Wait a bit and retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
        safeNonceResult = await publicClient.call({
          to: predictedSafeAddress as `0x${string}`,
          data: safeNonceData,
        });
      }

      safeNonce = Number(BigInt(safeNonceResult.data || '0x0'));
      console.log('🔢 Safe nonce:', safeNonce);
    }

    // Create USDC transfer transaction (same as before)
    console.log('💸 Creating USDC transfer transaction from Safe...');

    // Create wallet client with spending private key
    const spendingWalletClient = createWalletClient({
      account: privateKeyToAccount(spendingPrivateKey as `0x${string}`),
      chain: getViemChainById(chainId),
      transport: http(RPC_URL),
    });

    // Encode USDC transfer function data
    const transferData = encodeFunctionData({
      abi: [
        {
          inputs: [
            { name: 'to', type: 'address' },
            { name: 'amount', type: 'uint256' },
          ],
          name: 'transfer',
          outputs: [{ name: '', type: 'bool' }],
          stateMutability: 'nonpayable',
          type: 'function',
        },
      ],
      functionName: 'transfer',
      args: [
        payment.recipientAddress as `0x${string}`,
        parseUnits(payment.amount.toString(), payment.decimals),
      ],
    });

    // Build Safe transaction with correct nonce
    const safeTransaction = buildSafeTransaction({
      to: payment.tokenAddress,
      value: '0',
      data: transferData,
      operation: 0,
      safeTxGas: '0',
      nonce: safeNonce,
    });

    // Sign the Safe transaction with proper account type
    const account = privateKeyToAccount(spendingPrivateKey);
    const signature = await safeSignTypedData(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      spendingWalletClient as any,
      account,
      predictedSafeAddress as `0x${string}`,
      safeTransaction,
      chainId,
    );

    console.log('✅ Safe transaction signed successfully');

    // Encode execTransaction call (same as before)
    const execTransactionData = encodeFunctionData({
      abi: SAFE_ABI,
      functionName: 'execTransaction',
      args: [
        safeTransaction.to as `0x${string}`,
        BigInt(safeTransaction.value || '0'),
        safeTransaction.data as `0x${string}`,
        safeTransaction.operation,
        BigInt(safeTransaction.safeTxGas || '0'),
        BigInt(safeTransaction.baseGas || '0'),
        BigInt(safeTransaction.gasPrice || '0'),
        (safeTransaction.gasToken || '0x0000000000000000000000000000000000000000') as `0x${string}`,
        (safeTransaction.refundReceiver ||
          '0x0000000000000000000000000000000000000000') as `0x${string}`,
        signature as `0x${string}`,
      ],
    });

    console.log('✅ execTransaction data encoded');

    console.log('🔄 Deploying Safe AND executing transfer in single multicall...');

    let multicallData = [];

    if (isSafeDeployed) {
      // Safe is already deployed, only do the transfer
      console.log('✅ Safe is already deployed - executing transfer only...');
      multicallData = [
        {
          target: predictedSafeAddress,
          allowFailure: false,
          callData: execTransactionData,
        },
      ];
    } else if (deploymentTransaction) {
      // Safe needs to be deployed, do both deployment and transfer
      console.log(
        '🔄 Safe not deployed - Deploying Safe AND executing transfer in single multicall...',
      );
      multicallData = [
        // Step 1: Deploy the Safe
        {
          target: deploymentTransaction.to,
          allowFailure: false,
          callData: deploymentTransaction.data,
        },
        // Step 2: Execute the USDC transfer from Safe (in same transaction)
        {
          target: predictedSafeAddress,
          allowFailure: false,
          callData: execTransactionData,
        },
      ];
    } else {
      throw new Error('Failed to create Safe deployment transaction');
    }

    const sponsorshipResult = await executeTransactionWithGasSponsorship(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      multicallData as any,
      {
        operationType: 'safe_deployment_and_transfer',
        nonce: nonce,
        stealthAddress: stealthAddress,
        safeAddress: predictedSafeAddress,
        recipientAddress: payment.recipientAddress,
        tokenAddress: payment.tokenAddress,
        amount: payment.amount.toString(),
        symbol: payment.token,
      },
      payment.username,
      chainId,
    );

    console.log(
      '✅ Safe deployment AND transfer completed in single transaction:',
      sponsorshipResult.txHash,
    );

    console.log('✅ Gas sponsored transaction completed successfully!');

    // Verify the transfer worked (enhanced with sponsorship details)
    console.log('🔍 Verifying USDT transfer results...');

    let recipientBalanceFormatted = '0.00';

    try {
      // Check recipient balance
      const recipientBalanceData = encodeFunctionData({
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [payment.recipientAddress as `0x${string}`],
      });

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      console.log('🔍 Checking recipient balance at:', {
        recipientAddress: payment.recipientAddress,
        tokenAddress: payment.tokenAddress,
      });

      const recipientBalanceResult = await publicClient.call({
        to: payment.tokenAddress as `0x${string}`,
        data: recipientBalanceData,
      });

      const recipientBalance = BigInt(recipientBalanceResult.data || '0x0');
      recipientBalanceFormatted = (
        Number(recipientBalance) / Math.pow(10, payment.decimals)
      ).toFixed(2);

      console.log('✅ Balance check successful:', {
        recipientBalance: recipientBalance.toString(),
        recipientBalanceFormatted,
      });
    } catch (balanceError) {
      console.warn('⚠️ Balance verification failed, but transaction was successful:', balanceError);
      // Don't fail the entire process if balance check fails
      // The transaction was successful, so we'll continue
    }

    console.log('✅ Gas sponsored transfer verification:', {
      recipient: payment.recipientAddress,
      receivedAmount: `${recipientBalanceFormatted} ${payment.token}`,
      transactionHash: sponsorshipResult.txHash,
      explorerUrl: sponsorshipResult.explorerUrl,
      sponsorAddress: sponsorshipResult.sponsorDetails.sponsorAddress,
      gasUsed: sponsorshipResult.gasUsed,
      gasCost: sponsorshipResult.gasCost,
    });

    return {
      success: true,
      deploymentTransaction,
      safeTransaction,
      signature,
      txHash: sponsorshipResult.txHash,
      gasUsed: sponsorshipResult.gasUsed,
      gasCost: sponsorshipResult.gasCost,
      explorerUrl: sponsorshipResult.explorerUrl,
      sponsorDetails: sponsorshipResult.sponsorDetails,
      summary: {
        stealthAddress,
        safeAddress: predictedSafeAddress,
        recipient: payment.recipientAddress,
        multicallCalls: isSafeDeployed ? 1 : 2, // 1 for transfer, 2 for deploy + transfer
        executed: true,
        txHash: sponsorshipResult.txHash,
        recipientBalance: `${recipientBalanceFormatted} ${payment.token}`,
        sponsoredBy: sponsorshipResult.sponsorDetails.sponsorAddress,
        gasUsed: sponsorshipResult.gasUsed,
        explorerUrl: sponsorshipResult.explorerUrl,
      },
    } as RedemptionResult;
  } catch (error) {
    console.error('❌ Sponsored redemption failed:', error);

    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name,
      });
    } else {
      console.error('Unknown error type:', typeof error, error);
    }

    // Re-throw with more context
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Withdrawal failed: ${errorMessage}`);
  }
};
