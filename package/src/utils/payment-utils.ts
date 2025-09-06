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
import { publicClintByChainId, RPC_CONFIG } from './chains-constants';
import Safe from '@safe-global/protocol-kit';
import { baseSepolia } from 'viem/chains';
import { SAFE_ABI, USDC_ABI } from './constants';
import { type SinglePaymentResult } from '../types/payments';
import { getTransactions } from './transaction-utils';

export const singlePayment = async ({
  username,
  walletClient,
  chainId,
  tokenAddress,
  requestedAmount,
  recipientAddress,
  publicClient,
}: {
  username: string;
  walletClient: WalletClient;
  chainId: SupportedChain;
  tokenAddress: string;
  requestedAmount: string;
  recipientAddress: string;
  publicClient: PublicClient;
}): Promise<SinglePaymentResult> => {
  try {
    const txnsResult = await getTransactions({
      username,
      publicClient: publicClintByChainId(chainId),
    });

    if (!txnsResult.success || !txnsResult.balanceData) {
      throw new Error('Failed to fetch transactions');
    }

    const txns = txnsResult.balanceData;

    console.log('🚀 Starting multicall payment process...');
    console.log('📋 Available transactions:', txns.length);
    console.log('🎯 Requested amount:', requestedAmount);
    console.log('💰 Recipient address:', recipientAddress);

    // Filter transactions for the specific token and sort by balance (highest first)
    const relevantTxns = txns
      .filter((txn) => txn.tokenAddress.toLowerCase() === tokenAddress.toLowerCase())
      .sort((a, b) => parseFloat(b.balance) - parseFloat(a.balance));

    console.log('🔍 Relevant transactions for token:', relevantTxns.length);

    // Select transactions to fulfill the requested amount
    const selectedTxns = [];
    let remainingAmount = parseFloat(requestedAmount);
    const requestedAmountFloat = parseFloat(requestedAmount);

    for (const txn of relevantTxns) {
      if (remainingAmount <= 0) break;

      const txnBalance = parseFloat(txn.balance);
      const amountToTransfer = Math.min(remainingAmount, txnBalance);

      selectedTxns.push({
        ...txn,
        amountToTransfer: amountToTransfer.toString(),
      });

      remainingAmount -= amountToTransfer;
    }

    if (remainingAmount > 0) {
      const availableAmount = requestedAmountFloat - remainingAmount;
      throw new Error(
        `Insufficient balance. Available: ${availableAmount}, Requested: ${requestedAmount}`,
      );
    }

    console.log('✅ Selected transactions:', selectedTxns.length);
    console.log('💰 Requested amount to transfer:', requestedAmount);

    // Generate stealth keys for all selected transactions
    const nonces = selectedTxns.map((txn) => txn.nonce);
    const keys = await generateInitialKeysOnClient({
      walletClient,
      uniqueNonces: nonces,
      chainId,
    });

    console.log(`🔐 Generated ${keys.length} stealth keys`);

    // Prepare multicall data for all transactions
    const allMulticallData = [];
    const batchMetadata = [];

    for (let i = 0; i < selectedTxns.length; i++) {
      const txn = selectedTxns[i];
      const spendingPrivateKey = keys[i];
      const stealthAddress = privateKeyToAccount(spendingPrivateKey).address;

      console.log(`\n🔍 Processing transaction ${i + 1}/${selectedTxns.length}:`);
      console.log(`   - Nonce: ${txn.nonce}`);
      console.log(`   - Stealth Address: ${stealthAddress}`);
      console.log(
        `   - Amount: ${txn.balance} ${txn.symbol} (transferring: ${txn.amountToTransfer})`,
      );

      // Predict Safe address
      const predictedSafeAddress = await predictSafeAddress(
        stealthAddress,
        RPC_CONFIG.BASE_SEPOLIA.primary,
      );
      console.log(`   - Predicted Safe: ${predictedSafeAddress}`);

      // Initialize Safe Protocol Kit
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
        provider: RPC_URL,
        signer: stealthAddress,
        predictedSafe,
      });

      // Check if Safe is deployed
      const isSafeDeployed = await protocolKit.isSafeDeployed();
      console.log(`   - Safe deployed: ${isSafeDeployed}`);

      let deploymentTransaction;
      let safeNonce = 0;

      if (!isSafeDeployed) {
        console.log('   - Creating Safe deployment transaction...');
        deploymentTransaction = await protocolKit.createSafeDeploymentTransaction();
      } else {
        console.log('   - Getting Safe nonce...');
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

        const safeNonceResult = await publicClient.call({
          to: predictedSafeAddress as `0x${string}`,
          data: safeNonceData,
        });

        safeNonce = Number(BigInt(safeNonceResult.data || '0x0'));
        console.log(`   - Safe nonce: ${safeNonce}`);
      }

      // Create wallet client and transfer data
      const spendingWalletClient = createWalletClient({
        account: privateKeyToAccount(spendingPrivateKey as `0x${string}`),
        chain: baseSepolia,
        transport: http(RPC_URL),
      });

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
        args: [recipientAddress as `0x${string}`, parseUnits(txn.amountToTransfer, txn.decimals)],
      });

      // Build and sign Safe transaction
      const safeTransaction = buildSafeTransaction({
        to: txn.tokenAddress,
        value: '0',
        data: transferData,
        operation: 0,
        safeTxGas: '0',
        nonce: safeNonce,
      });

      const account = privateKeyToAccount(spendingPrivateKey);
      const signature = await safeSignTypedData(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        spendingWalletClient as any,
        account,
        predictedSafeAddress as `0x${string}`,
        safeTransaction,
        chainId,
      );

      // Encode execTransaction call
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
          (safeTransaction.gasToken ||
            '0x0000000000000000000000000000000000000000') as `0x${string}`,
          (safeTransaction.refundReceiver ||
            '0x0000000000000000000000000000000000000000') as `0x${string}`,
          signature as `0x${string}`,
        ],
      });

      // Add transactions to multicall data
      if (!isSafeDeployed && deploymentTransaction) {
        allMulticallData.push({
          target: deploymentTransaction.to,
          allowFailure: false,
          callData: deploymentTransaction.data,
        });
        console.log(`   - Added Safe deployment for transaction ${i + 1}`);
      }

      allMulticallData.push({
        target: predictedSafeAddress,
        allowFailure: false,
        callData: execTransactionData,
      });
      console.log(`   - Added transfer for transaction ${i + 1}`);

      // Store metadata for this transaction
      batchMetadata.push({
        nonce: txn.nonce,
        stealthAddress,
        predictedSafeAddress,
        amount: txn.amountToTransfer,
        symbol: txn.symbol,
        isSafeDeployed,
      });
    }

    console.log('\n📋 Batch multicall data prepared:', {
      totalTransactions: selectedTxns.length,
      totalCalls: allMulticallData.length,
      calls: allMulticallData.map((call, i) => ({
        index: i + 1,
        target: call.target,
        allowFailure: call.allowFailure,
        dataLength: call.callData.length,
      })),
    });

    // Execute batch transaction with gas sponsorship
    console.log('🌟 Executing batch transaction with gas sponsorship...');

    const metadata = {
      operationType: 'batch_redemption',
      paymentCount: selectedTxns.length,
      nonces: nonces,
      recipientAddress: recipientAddress,
      tokenAddress: tokenAddress,
      symbol: selectedTxns[0].symbol,
      batchMetadata: batchMetadata,
    };

    const sponsorshipResult = await executeTransactionWithGasSponsorship(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allMulticallData as any,
      metadata,
      username,
      chainId,
    );

    console.log('✅ Batch redemption completed successfully!');

    // Verify the transfer worked
    console.log('🔍 Verifying transfer results...');

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

    // Return success response with sponsorship details
    return {
      success: true,
      deploymentTransaction: undefined, // Not applicable for batch
      safeTransaction: {
        to: tokenAddress,
        value: '0',
        data: '',
        operation: 0,
        safeTxGas: '0',
        baseGas: '0',
        gasPrice: '0',
        gasToken: '0x0000000000000000000000000000000000000000',
        refundReceiver: '0x0000000000000000000000000000000000000000',
        nonce: 0,
      },
      signature: '',
      txHash: sponsorshipResult.txHash,
      gasUsed: sponsorshipResult.gasUsed,
      gasCost: sponsorshipResult.gasCost,
      explorerUrl: sponsorshipResult.explorerUrl,
      sponsorDetails: sponsorshipResult.sponsorDetails,
      summary: {
        stealthAddress: batchMetadata[0]?.stealthAddress || '',
        safeAddress: batchMetadata[0]?.predictedSafeAddress || '',
        recipient: recipientAddress,
        multicallCalls: allMulticallData.length,
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
