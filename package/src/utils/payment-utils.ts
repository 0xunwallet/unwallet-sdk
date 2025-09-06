import {
  createWalletClient,
  encodeFunctionData,
  http,
  parseUnits,
  PublicClient,
  WalletClient,
} from 'viem';
import { SupportedChain } from '../types/supported-chains';
import { generateInitialKeysOnClient } from './stealth-address';
import { privateKeyToAccount } from 'viem/accounts';
import {
  buildSafeTransaction,
  executeTransactionWithGasSponsorship,
  predictSafeAddress,
  safeSignTypedData,
} from './safe-utils';
import { RPC_CONFIG } from './chains-constants';
import Safe from '@safe-global/protocol-kit';
import { baseSepolia } from 'viem/chains';
import { SAFE_ABI, USDC_ABI } from './constants';
import { type SinglePaymentResult } from '../types/payments';

export const singlePayment = async ({
  username,
  walletClient,
  chainId,
  tokenAddress,
  amount,
  recipientAddress,
  publicClient,
  nonce,
}: {
  username: string;
  walletClient: WalletClient;
  chainId: SupportedChain;
  tokenAddress: string;
  amount: string;
  recipientAddress: string;
  publicClient: PublicClient;
  nonce: number;
}): Promise<SinglePaymentResult> => {
  try {
    console.log('🔢 Nonce:', nonce);

    // Generate stealth private key (same as before)
    const keys = await generateInitialKeysOnClient({
      walletClient,
      uniqueNonces: [nonce],
      chainId,
    });
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
      chain: baseSepolia, // TODO: remove hardcode chain
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
      args: [recipientAddress as `0x${string}`, parseUnits(amount.toString(), 6)],
    });

    // Build Safe transaction with correct nonce
    const safeTransaction = buildSafeTransaction({
      to: tokenAddress,
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

    console.log('📋 Combined multicall data:', {
      multicallLength: multicallData.length,
      calls: multicallData.map((call, i) => ({
        index: i,
        target: call.target,
        allowFailure: call.allowFailure,
        dataLength: call.callData.length,
        operation: i === 0 ? 'Safe Deployment' : 'USDC Transfer',
      })),
    });

    const metadata = {
      operationType: 'safe_deployment_and_transfer',
      nonce: nonce,
      stealthAddress: stealthAddress,
      safeAddress: predictedSafeAddress,
      recipientAddress: recipientAddress,
      tokenAddress: tokenAddress,
      amount: amount.toString(),
      symbol: 'USDC',
    };

    const sponsorshipResult = await executeTransactionWithGasSponsorship(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      multicallData as any,
      metadata,
      username,
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
        args: [recipientAddress as `0x${string}`],
      });

      if (!publicClient) {
        throw new Error('Public client not available');
      }

      console.log('🔍 Checking recipient balance at:', {
        recipientAddress,
        tokenAddress: tokenAddress,
      });

      const recipientBalanceResult = await publicClient.call({
        to: tokenAddress as `0x${string}`,
        data: recipientBalanceData,
      });

      const recipientBalance = BigInt(recipientBalanceResult.data || '0x0');
      recipientBalanceFormatted = (Number(recipientBalance) / Math.pow(10, 6)).toFixed(2);

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
      recipient: recipientAddress,
      receivedAmount: `${recipientBalanceFormatted} USDC`,
      transactionHash: sponsorshipResult.txHash,
      explorerUrl: sponsorshipResult.explorerUrl,
      sponsorAddress: sponsorshipResult.sponsorDetails.sponsorAddress,
      gasUsed: sponsorshipResult.gasUsed,
      gasCost: sponsorshipResult.gasCost,
    });

    // 🎉 Enhanced success response with sponsorship details
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
        safeAddress: predictedSafeAddress as `0x${string}`,
        recipient: recipientAddress,
        multicallCalls: isSafeDeployed ? 1 : 2, // 1 for transfer, 2 for deploy + transfer
        executed: true,
        txHash: sponsorshipResult.txHash,
        recipientBalance: `${recipientBalanceFormatted} USDC`,
        sponsoredBy: sponsorshipResult.sponsorDetails.sponsorAddress,
        gasUsed: sponsorshipResult.gasUsed,
        explorerUrl: sponsorshipResult.explorerUrl,
      },
    };
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
