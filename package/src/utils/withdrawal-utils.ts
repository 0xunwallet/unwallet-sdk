import axios from 'axios';
import { formatUnits, parseAbi, PublicClient } from 'viem';
import { BACKEND_URL } from './constants';
import {
  type TransactionResult,
  type BalanceData,
  type FundedAddress,
} from '../types/withdrawal-data';

// ERC20 ABI for the functions we need
const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]);

// Common Multicall3 address
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

export const getTransactions = async ({
  username,
  publicClient,
}: {
  username: string;
  publicClient: PublicClient;
}): Promise<TransactionResult> => {
  try {
    console.log(`🔍 Fetching withdrawals for username: ${username}`);

    // Fetch funding stats from backend
    const response = await axios.get(`${BACKEND_URL}/api/user/${username}/funding-stats`);

    const data = response.data;
    console.log('Funding stats response:', data);

    const fundedAddresses: FundedAddress[] = data.data.fundedAddresses || [];

    if (fundedAddresses.length === 0) {
      console.log('No funded addresses found.');
      return {
        balanceData: [],
        success: true,
      };
    }

    // Collect all address-token pairs that need to be checked
    const addressTokenPairs: Array<{
      walletAddress: string;
      tokenAddress: string;
      index: number;
      originalData: FundedAddress;
      isFunded: boolean;
    }> = [];

    fundedAddresses.forEach((funded, index) => {
      const fromAddress = funded.fromAddress;
      const safeAddress = funded.safeAddress;
      const tokenAddress = funded.tokenAddress;

      // Add fromAddress if it exists (funded addresses)
      if (fromAddress) {
        addressTokenPairs.push({
          walletAddress: safeAddress, // Check balance at safe address
          tokenAddress: tokenAddress,
          index: index,
          originalData: funded,
          isFunded: true,
        });
      }

      // Also add safeAddress for unfunded addresses
      if (!fromAddress && safeAddress) {
        addressTokenPairs.push({
          walletAddress: safeAddress,
          tokenAddress: tokenAddress,
          index: index,
          originalData: funded,
          isFunded: false,
        });
      }
    });

    console.log(`Checking ${addressTokenPairs.length} address-token pairs...`);

    // Use multicall to fetch all token data
    const contracts = addressTokenPairs.flatMap((pair) => [
      {
        address: pair.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [pair.walletAddress as `0x${string}`],
      },
      {
        address: pair.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'decimals',
      },
      {
        address: pair.tokenAddress as `0x${string}`,
        abi: erc20Abi,
        functionName: 'symbol',
      },
    ]);

    const results = await publicClient.multicall({
      contracts,
      allowFailure: true,
      multicallAddress: MULTICALL3_ADDRESS as `0x${string}`,
    });

    console.log('✅ Multicall successful');

    // Process multicall results
    const finalBalanceData: BalanceData[] = [];

    for (let i = 0; i < addressTokenPairs.length; i++) {
      const balanceResult = results[i * 3];
      const decimalsResult = results[i * 3 + 1];
      const symbolResult = results[i * 3 + 2];
      const originalPair = addressTokenPairs[i];

      if (
        balanceResult?.status === 'success' &&
        decimalsResult?.status === 'success' &&
        symbolResult?.status === 'success'
      ) {
        const rawBalance = BigInt(balanceResult.result as string | number);
        const decimals = decimalsResult.result as number;
        const symbol = symbolResult.result as string;

        const formattedBalance = formatUnits(rawBalance, decimals);

        if (rawBalance > BigInt(0)) {
          finalBalanceData.push({
            address: originalPair.isFunded
              ? originalPair.originalData.fromAddress || originalPair.walletAddress
              : originalPair.walletAddress,
            balance: formattedBalance,
            symbol: symbol,
            rawBalance: rawBalance.toString(),
            nonce: originalPair.originalData.nonce || 0,
            decimals: decimals,
            tokenAddress: originalPair.tokenAddress,
            transactionHash: originalPair.originalData.transactionHash,
            stealthAddress: originalPair.originalData.stealthAddress,
            safeAddress: originalPair.originalData.safeAddress,
            isFunded: originalPair.isFunded,
          });

          console.log(`💰 Found funds:`, {
            address: originalPair.walletAddress,
            balance: formattedBalance,
            symbol: symbol,
            isFunded: originalPair.isFunded,
          });
        }
      }
    }

    console.log(
      `✅ Balance check complete. Found ${finalBalanceData.length} addresses with balances.`,
    );

    return {
      balanceData: finalBalanceData,
      success: true,
    };
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch withdrawals';

    return {
      balanceData: [],
      success: false,
      error: errorMessage,
    };
  }
};
