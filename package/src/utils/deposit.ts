import { type WalletClient, type PublicClient, type Address } from 'viem';
import { type OrchestrationData } from '../types/orchestration-data';
import { type SignedTransferAuthorization } from './eip3009';

export interface DepositResult {
  success: boolean;
  txHash?: string;
  gasUsed?: string;
  gasCost?: string;
  explorerUrl?: string;
  error?: string;
}

export interface GaslessDepositResult {
  success: boolean;
  signedAuthorization?: SignedTransferAuthorization;
  intermediateAddress?: Address;
  txHash?: string; // Hash of transfer to intermediate address
  error?: string;
}

export const deposit = async (
  accountAddress: Address,
  tokenAddress: Address,
  tokenAmount: bigint,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<DepositResult> => {
  try {
    console.log('Initiating deposit transfer...');
    console.log('Account Address:', accountAddress);
    console.log('Token Address:', tokenAddress);
    console.log('Token Amount:', tokenAmount.toString());

    // Check if it's a native token (ETH) or ERC20 token
    const isNativeToken =
      tokenAddress === '0x0000000000000000000000000000000000000000' ||
      tokenAddress === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    let txHash: string;

    if (isNativeToken) {
      // Native token transfer (ETH)
      console.log('Processing native token transfer...');

      const hash = await walletClient.sendTransaction({
        to: accountAddress,
        value: tokenAmount,
        account: walletClient.account!,
        chain: walletClient.chain,
      });

      txHash = hash;
    } else {
      // ERC20 token transfer
      console.log('Processing ERC20 token transfer...');

      // ERC20 transfer function ABI
      const erc20TransferAbi = [
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
      ] as const;

      const hash = await walletClient.writeContract({
        address: tokenAddress,
        abi: erc20TransferAbi,
        functionName: 'transfer',
        args: [accountAddress, tokenAmount],
        account: walletClient.account!,
        chain: walletClient.chain,
      });

      txHash = hash;
    }

    console.log('Transfer transaction hash:', txHash);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    console.log('Transaction confirmed:', {
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Get chain info for explorer URL
    const chain = walletClient.chain;
    const explorerUrl = chain?.blockExplorers?.default?.url
      ? `${chain.blockExplorers.default.url}/tx/${txHash}`
      : undefined;

    const result: DepositResult = {
      success: true,
      txHash,
      gasUsed: receipt.gasUsed.toString(),
      gasCost: '0', // Would need gas price to calculate actual cost
      explorerUrl,
    };

    console.log('✅ Deposit completed successfully:', result);
    return result;
  } catch (error) {
    console.error('❌ Deposit failed:', error);

    const result: DepositResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return result;
  }
};

// Convenience function that takes orchestration data
export const depositFromOrchestrationData = async (
  od: OrchestrationData,
  walletClient: WalletClient,
  publicClient: PublicClient,
): Promise<DepositResult> => {
  return deposit(
    od.accountAddressOnSourceChain,
    od.sourceTokenAddress,
    od.sourceTokenAmount,
    walletClient,
    publicClient,
  );
};

/**
 * Gasless deposit using EIP-3009 transferWithAuthorization
 * This allows a user to transfer tokens to an intermediate address and sign an authorization
 * for the server to move tokens from the intermediate address to the smart account (gasless).
 *
 * Flow:
 * 1. User transfers tokens to an intermediate address (could be a random/TEE wallet)
 * 2. Intermediate account signs EIP-3009 authorization (NO ETH NEEDED)
 * 3. User sends signed authorization to server
 * 4. Server executes transferWithAuthorization in Multicall3 batch (server pays gas)
 *
 * @param intermediateAddress - Address that will receive tokens and sign authorization (can have 0 ETH)
 * @param smartAccountAddress - Smart account address to receive tokens
 * @param tokenAddress - Token contract address
 * @param tokenAmount - Amount of tokens to transfer
 * @param userWalletClient - User's wallet client (must have tokens and ETH for initial transfer)
 * @param intermediateWalletClient - Intermediate wallet client (can have 0 ETH, only for signing)
 * @param publicClient - Public client for reading token info and waiting for receipts
 */
export const depositGasless = async (
  intermediateAddress: Address,
  smartAccountAddress: Address,
  tokenAddress: Address,
  tokenAmount: bigint,
  userWalletClient: WalletClient,
  intermediateWalletClient: WalletClient,
  publicClient: PublicClient,
): Promise<GaslessDepositResult> => {
  try {
    console.log('Initiating gasless deposit with EIP-3009...');
    console.log('Intermediate Address:', intermediateAddress);
    console.log('Smart Account Address:', smartAccountAddress);
    console.log('Token Address:', tokenAddress);
    console.log('Token Amount:', tokenAmount.toString());

    // Step 1: Transfer tokens from user to intermediate address
    console.log('Step 1: Transferring tokens to intermediate address...');

    const erc20TransferAbi = [
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
    ] as const;

    const txHash = await userWalletClient.writeContract({
      address: tokenAddress,
      abi: erc20TransferAbi,
      functionName: 'transfer',
      args: [intermediateAddress, tokenAmount],
      account: userWalletClient.account!,
      chain: userWalletClient.chain,
    });

    console.log('Transfer transaction hash:', txHash);

    // Wait for transaction confirmation
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    console.log('Transfer confirmed:', {
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
    });

    // Step 2: Sign EIP-3009 authorization with intermediate account (GASLESS!)
    console.log('Step 2: Signing EIP-3009 authorization (gasless)...');

    const { signTransferWithAuthorization } = await import('./eip3009');

    const signedAuthorization = await signTransferWithAuthorization(
      intermediateAddress, // from
      smartAccountAddress, // to
      tokenAmount, // value
      tokenAddress, // token
      userWalletClient.chain!.id, // chainId
      intermediateWalletClient, // signer (can have 0 ETH!)
      publicClient, // for reading token info
      3600, // 1 hour validity
    );

    console.log('✅ EIP-3009 authorization signed (gasless)!');
    console.log('   From:', signedAuthorization.from);
    console.log('   To:', signedAuthorization.to);
    console.log('   Value:', signedAuthorization.value.toString());
    console.log('   Nonce:', signedAuthorization.nonce);

    const result: GaslessDepositResult = {
      success: true,
      signedAuthorization,
      intermediateAddress,
      txHash,
    };

    console.log('✅ Gasless deposit prepared successfully');
    return result;
  } catch (error) {
    console.error('❌ Gasless deposit failed:', error);

    const result: GaslessDepositResult = {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };

    return result;
  }
};

/**
 * Convenience function for gasless deposit that takes orchestration data
 */
export const depositGaslessFromOrchestrationData = async (
  od: OrchestrationData,
  intermediateAddress: Address,
  userWalletClient: WalletClient,
  intermediateWalletClient: WalletClient,
  publicClient: PublicClient,
): Promise<GaslessDepositResult> => {
  return depositGasless(
    intermediateAddress,
    od.accountAddressOnSourceChain,
    od.sourceTokenAddress,
    od.sourceTokenAmount,
    userWalletClient,
    intermediateWalletClient,
    publicClient,
  );
};
