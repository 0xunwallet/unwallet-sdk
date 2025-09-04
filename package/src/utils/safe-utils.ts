import Safe from '@safe-global/protocol-kit';
import { RPC_CONFIG } from './chains-constants';

// Helper function to build Safe transaction
export const buildSafeTransaction = (txData: {
  to: string;
  value?: string;
  data?: string;
  operation?: number;
  safeTxGas?: string;
  baseGas?: string;
  gasPrice?: string;
  gasToken?: string;
  refundReceiver?: string;
  nonce?: number;
}) => {
  return {
    to: txData.to,
    value: txData.value || '0',
    data: txData.data || '0x',
    operation: txData.operation || 0,
    safeTxGas: txData.safeTxGas || '0',
    baseGas: txData.baseGas || '0',
    gasPrice: txData.gasPrice || '0',
    gasToken: txData.gasToken || '0x0000000000000000000000000000000000000000',
    refundReceiver: txData.refundReceiver || '0x0000000000000000000000000000000000000000',
    nonce: txData.nonce || 0,
  };
};

// Helper function to sign typed data
export const safeSignTypedData = async (
  walletClient: {
    signTypedData: (params: {
      account: { address: string };
      domain: { chainId: number; verifyingContract: string };
      types: Record<string, Array<{ type: string; name: string }>>;
      primaryType: string;
      message: Record<string, string | number>;
    }) => Promise<string>;
  },
  account: { address: string },
  safeAddress: string,
  safeTx: {
    to: string;
    value: string;
    data: string;
    operation: number;
    safeTxGas: string;
    baseGas: string;
    gasPrice: string;
    gasToken: string;
    refundReceiver: string;
    nonce: number;
  },
  chainId: number,
) => {
  const domain = {
    chainId: chainId,
    verifyingContract: safeAddress,
  };

  const types = {
    SafeTx: [
      { type: 'address', name: 'to' },
      { type: 'uint256', name: 'value' },
      { type: 'bytes', name: 'data' },
      { type: 'uint8', name: 'operation' },
      { type: 'uint256', name: 'safeTxGas' },
      { type: 'uint256', name: 'baseGas' },
      { type: 'uint256', name: 'gasPrice' },
      { type: 'address', name: 'gasToken' },
      { type: 'address', name: 'refundReceiver' },
      { type: 'uint256', name: 'nonce' },
    ],
  };

  const message = {
    to: safeTx.to,
    value: safeTx.value.toString(),
    data: safeTx.data,
    operation: safeTx.operation,
    safeTxGas: safeTx.safeTxGas.toString(),
    baseGas: safeTx.baseGas.toString(),
    gasPrice: safeTx.gasPrice.toString(),
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    nonce: Number(safeTx.nonce),
  };

  return await walletClient.signTypedData({
    account,
    domain,
    types,
    primaryType: 'SafeTx',
    message,
  });
};

// Predict safe address based on stealth address
export async function predictSafeAddress(stealthAddress: string, rpcUrl?: string) {
  // Use centralized RPC configuration with QuickNode as primary
  const rpcEndpoints = rpcUrl
    ? [rpcUrl, ...RPC_CONFIG.BASE_SEPOLIA.fallbacks]
    : [RPC_CONFIG.BASE_SEPOLIA.primary, ...RPC_CONFIG.BASE_SEPOLIA.fallbacks];

  try {
    console.log('🔍 Predicting Safe address using Protocol Kit for:', stealthAddress);

    // Use Safe Protocol Kit's built-in prediction with custom contract addresses for Sei Testnet
    const predictedSafe = {
      safeAccountConfig: {
        owners: [stealthAddress],
        threshold: 1,
      },
      safeDeploymentConfig: {
        saltNonce: '0',
      },
    };

    // For Base Sepolia we rely on RPC URI only; do not use contractNetworks

    // Try multiple RPC endpoints
    for (let i = 0; i < rpcEndpoints.length; i++) {
      const currentRpcUrl = rpcEndpoints[i];
      console.log(`🔄 Trying RPC endpoint ${i + 1}/${rpcEndpoints.length}: ${currentRpcUrl}`);

      try {
        const protocolKit = await Safe.init({
          provider: currentRpcUrl,
          predictedSafe,
        });

        const predictedAddress = await protocolKit.getAddress();
        console.log(`✅ Safe address predicted successfully with RPC ${i + 1}:`, predictedAddress);
        return predictedAddress;
      } catch (rpcError) {
        console.warn(`❌ RPC endpoint ${i + 1} failed:`, rpcError);
        if (i === rpcEndpoints.length - 1) {
          // This was the last RPC endpoint, throw the error
          throw rpcError;
        }
        // Continue to next RPC endpoint
        continue;
      }
    }
  } catch (error) {
    console.error('❌ Error predicting safe address:', error);

    // Final fallback: Calculate Safe address manually if Protocol Kit fails
    console.log('🔄 Attempting manual Safe address calculation...');
    // Final rethrow with helpful message; removing unused manual variables
    throw new Error(
      `Safe address prediction failed. Please check RPC connectivity and contract addresses. Original error: ${error}`,
    );
  }
}
