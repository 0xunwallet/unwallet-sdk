import { type WalletClient, type PublicClient, type Address } from 'viem';
import { type OrchestrationData } from '../types/orchestration-data';

export interface DepositResult {
  success: boolean;
  txHash?: string;
  gasUsed?: string;
  gasCost?: string;
  explorerUrl?: string;
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
