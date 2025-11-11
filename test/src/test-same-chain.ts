/**
 * Test Same-Chain Operations (No Bridge) - Using SDK
 *
 * This script tests same-chain operations with both transfer types using the SDK:
 * 
 * NORMAL (Type 0) - Direct Transfer:
 * 1. Base Sepolia → Base Sepolia: Transfer USDC from relayer to smart account on Base, earn on Base (no bridge)
 * 2. Arbitrum Sepolia → Arbitrum Sepolia: Transfer USDC from relayer to smart account on Arbitrum, earn on Arbitrum (no bridge)
 *
 * EIP-3009 (Type 1) - Gasless Transfer:
 * 3. Base Sepolia → Base Sepolia: Use transferWithAuthorization (gasless) from user account to smart account on Base
 * 4. Arbitrum Sepolia → Arbitrum Sepolia: Use transferWithAuthorization (gasless) from user account to smart account on Arbitrum
 *
 * Key Features:
 * - Tests both NORMAL (type 0) and EIP-3009 (type 1) transfer methods
 * - NORMAL: Uses TEST_PRIVATE_KEY (relayer account) directly for transfers
 * - EIP-3009: User account signs authorization (OFF-CHAIN - NO GAS!)
 * - Tests both chains in sequence for each transfer type
 * - No bridging involved - supply and earn on the same chain
 * - Server sponsors all gas costs
 * - Uses SDK functions for all operations
 *
 * Prerequisites:
 * - Server must be running or use production server
 * - TEST_PRIVATE_KEY environment variable must be set (account with USDC on both chains)
 * - Account must have USDC on both Base Sepolia and Arbitrum Sepolia
 * - Account does NOT need ETH for EIP-3009 signing (off-chain!)
 *
 * Usage: cd test && pnpm test:same-chain
 */

import dotenv from 'dotenv';
import {
  createOrchestrationData,
  transferToOrchestrationAccount,
  notifyDeposit,
  depositGasless,
  notifyDepositGasless,
  pollOrchestrationStatus,
  getRequiredState,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
  TransferType,
} from 'unwallet';
import type { CurrentState, OrchestrationStatus, GaslessDepositResult } from 'unwallet';
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arbitrumSepolia, baseSepolia } from 'viem/chains';

dotenv.config();

// ERC20 ABI for USDC operations
const ERC20_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// Network configurations
const NETWORKS = {
  baseSepolia: {
    name: 'Base Sepolia',
    chainId: 84532,
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org',
    contracts: {
      autoEarnModule: '0x6e1fAc6e36f01615ef0c0898Bf6c5F260Bf2609a' as Address,
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
      aavePool: '0x07eA79F68B2B3df564D0A34F8e19D9B1e339814b' as Address,
    },
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl:
      process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    contracts: {
      autoEarnModule: '0x42CF1b746F96D6cc59e84F87d26Ea64D3fbCa3a0' as Address,
      usdcToken: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d' as Address,
      aavePool: '0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff' as Address,
    },
  },
};

// Test configuration
const TEST_CONFIG = {
  // Amount to supply (0.1 USDC)
  supplyAmount: parseUnits('0.1', 6),
  // API server URL
  apiUrl:
    process.env.TEST_SERVER_URL ||
    process.env.SERVER_URL ||
    'https://tee.wall8.xyz',
  // API key for orchestration
  apiKey: process.env.API_KEY || 'test-api-orchestration-same-chain',
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SameChainFlow {
  chainId: number;
  chainName: string;
  tokenAddress: Address;
  autoEarnModule: Address;
  aavePool: Address;
}

/**
 * Test Same-Chain Flow with NORMAL Transfer (Type 0)
 * Uses SDK functions for orchestration, transfer, and notification
 */
async function testSameChainFlow(
  relayerAccount: ReturnType<typeof privateKeyToAccount>,
  flow: SameChainFlow,
  flowNumber: number
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`💰 FLOW ${flowNumber}: ${flow.chainName} → ${flow.chainName} (Same Chain - NORMAL)`);
  console.log('='.repeat(80));

  try {
    // Create clients for the chain
    const network =
      flow.chainId === 84532 ? NETWORKS.baseSepolia : NETWORKS.arbitrumSepolia;
    const chain = flow.chainId === 84532 ? baseSepolia : arbitrumSepolia;

    const client = createPublicClient({
      chain: chain,
      transport: http(network.rpcUrl),
    }) as any;

    const walletClient = createWalletClient({
      account: relayerAccount,
      chain: chain,
      transport: http(network.rpcUrl),
    });

    // Check USDC balance
    console.log(`\n💵 Checking USDC Balance on ${flow.chainName}`);
    console.log('--------------------------------------------------');

    const usdcBalance = (await client.readContract({
      address: flow.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [relayerAccount.address],
    })) as bigint;

    console.log(`Relayer Account Balance: ${formatUnits(usdcBalance, 6)} USDC`);

    if (usdcBalance < TEST_CONFIG.supplyAmount) {
      throw new Error(
        `Insufficient USDC balance. Need ${formatUnits(TEST_CONFIG.supplyAmount, 6)}, have ${formatUnits(usdcBalance, 6)}`
      );
    }

    // ===== CREATE ORCHESTRATION REQUEST (using SDK) =====
    console.log(`\n===== CREATE ORCHESTRATION REQUEST (using SDK) =====`);

    // Get required state using SDK
    console.log(
      `\n📊 Getting required state for AutoEarn module on ${flow.chainName} (chainId: ${flow.chainId})...`
    );
    const requiredState = await getRequiredState({
      sourceChainId: String(flow.chainId) as any,
      moduleName: 'AUTOEARN',
    });
    console.log(`✅ Module Address: ${requiredState.moduleAddress}`);
    console.log(`   Chain ID: ${requiredState.chainId}`);

    // Encode AutoEarn module data using SDK helper functions
    console.log('\n🔧 Encoding AutoEarn module configuration...');
    const autoEarnConfig = createAutoEarnConfig(
      flow.chainId,
      flow.tokenAddress,
      flow.aavePool
    );
    const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`);

    const currentState: CurrentState = {
      chainId: String(flow.chainId) as any,
      tokenAddress: flow.tokenAddress,
      tokenAmount: TEST_CONFIG.supplyAmount.toString(),
      ownerAddress: relayerAccount.address,
    };

    console.log('📝 User Intent:');
    console.log(
      `   Current: ${formatUnits(TEST_CONFIG.supplyAmount, 6)} USDC on ${flow.chainName}`
    );
    console.log(`   Target: Invest in Aave on ${flow.chainName} (same chain)`);
    console.log(`   Owner: ${relayerAccount.address}`);

    // Create orchestration data using SDK
    console.log('\n📤 Creating orchestration request...');
    const orchestrationData = await createOrchestrationData(
      currentState,
      requiredState,
      relayerAccount.address,
      TEST_CONFIG.apiKey,
      encodedData as Hex
    );

    console.log('\n✅ Orchestration Created Successfully!');
    console.log('--------------------------------------');
    console.log(`📌 Request ID: ${orchestrationData.requestId}`);
    console.log(`📍 Chain: ${orchestrationData.sourceChainId} (${flow.chainName})`);
    console.log(
      `💼 Source Account: ${orchestrationData.accountAddressOnSourceChain}`
    );
    console.log(
      `💼 Destination Smart Account: ${orchestrationData.accountAddressOnDestinationChain}`
    );
    console.log(
      `🔧 Destination Modules: ${orchestrationData.destinationChainAccountModules.join(', ') || 'None'}`
    );

    // ===== TRANSFER USDC (using SDK) =====
    console.log(
      `\n===== TRANSFER USDC TO ORCHESTRATION ACCOUNT (using SDK) =====`
    );
    console.log(
      `Amount: ${formatUnits(TEST_CONFIG.supplyAmount, 6)} USDC`
    );
    console.log(`From: ${relayerAccount.address} (Relayer)`);
    console.log(
      `To: ${orchestrationData.accountAddressOnDestinationChain} (Destination Smart Account)`
    );

    const depositResult = await transferToOrchestrationAccount(
      orchestrationData,
      walletClient,
      client
    );

    if (!depositResult.success || !depositResult.txHash) {
      throw new Error(`Transfer failed: ${depositResult.error}`);
    }

    console.log(`✅ Transfer submitted: ${depositResult.txHash}`);

    // Get transaction receipt
    console.log('⏳ Waiting for transaction confirmation...');
    const receipt = await client.waitForTransactionReceipt({
      hash: depositResult.txHash as `0x${string}`,
    });

    console.log(`✅ Transfer confirmed! Block: ${receipt.blockNumber}`);

    // Verify destination smart account balance
    const smartAccountBalance = (await client.readContract({
      address: flow.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [orchestrationData.accountAddressOnDestinationChain as Address],
    })) as bigint;
    console.log(
      `   Destination Smart Account Balance: ${formatUnits(smartAccountBalance, 6)} USDC`
    );

    // ===== NOTIFY SERVER (using SDK) =====
    console.log(`\n===== NOTIFY SERVER OF DEPOSIT (using SDK) =====`);
    console.log(`   Request ID: ${orchestrationData.requestId}`);
    await notifyDeposit({
      requestId: orchestrationData.requestId,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
    });

    console.log('✅ Server notified successfully!');

    // ===== MONITOR ORCHESTRATION STATUS (using SDK) =====
    console.log(`\n===== MONITOR ORCHESTRATION STATUS (using SDK) =====`);
    console.log('⏳ Server will now:');
    console.log('   1. Execute Multicall3 batch:');
    console.log('      - Deploy Nexus account on chain');
    console.log('      - Execute AutoEarn module (deposit to Aave)');
    console.log('   2. Update status to COMPLETED');
    console.log('\n⏳ Polling orchestration status...');

    let completed = false;
    let finalStatus: OrchestrationStatus | null = null;

    try {
      const polledStatus = await pollOrchestrationStatus({
        requestId: orchestrationData.requestId,
        interval: 3000,
        maxAttempts: 40,
        onStatusUpdate: (status: OrchestrationStatus) => {
          console.log(`\n[Status Update] ${status.status}`);
          if (status.updated_at || status.created_at) {
            console.log(
              `   Updated: ${new Date(status.updated_at || status.created_at || Date.now()).toLocaleString()}`
            );
          }
          if (status.error_message) {
            console.log(`   Error: ${status.error_message}`);
          }
        },
        onComplete: (status: OrchestrationStatus) => {
          console.log('\n🎉 Orchestration completed successfully!');
          console.log(`   Final Status: ${status.status}`);
          completed = true;
          finalStatus = status;
        },
        onError: (error: Error) => {
          console.log(`\n❌ Orchestration error: ${error.message}`);
        },
      });
      // If polling completed without calling onComplete, use the returned status
      if (!finalStatus) {
        finalStatus = polledStatus;
        completed =
          polledStatus.status === 'COMPLETED' ||
          polledStatus.status === 'FAILED';
      }
    } catch (error) {
      console.log(`\n⚠️  Status polling completed or timed out`);
      if (error instanceof Error) {
        console.log(`   ${error.message}`);
      }
    }

    if (completed && finalStatus) {
      if (finalStatus.status === 'COMPLETED') {
        console.log(`\n🎉 Flow ${flowNumber} completed successfully!`);
        return { success: true, requestId: orchestrationData.requestId };
      } else if (finalStatus.status === 'FAILED') {
        console.log(`\n❌ Flow ${flowNumber} failed!`);
        return {
          success: false,
          requestId: orchestrationData.requestId,
          error: finalStatus.error_message || 'Unknown error',
        };
      }
    }

    console.log(`\n⏱️  Flow ${flowNumber} still in progress or timed out`);
    return {
      success: false,
      requestId: orchestrationData.requestId,
      error: 'Timeout',
    };
  } catch (error: any) {
    console.error(`\n❌ Flow ${flowNumber} Failed!`);
    console.error('================');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test Same-Chain Flow with EIP-3009 Gasless Transfer (Type 1)
 * Uses SDK functions for orchestration, gasless deposit, and notification
 */
async function testSameChainFlowWithEIP3009(
  userAccount: ReturnType<typeof privateKeyToAccount>,
  flow: SameChainFlow,
  flowNumber: number
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(
    `💰 FLOW ${flowNumber}: ${flow.chainName} → ${flow.chainName} (Same Chain - EIP-3009)`
  );
  console.log('='.repeat(80));

  try {
    // Create clients for the chain
    const network =
      flow.chainId === 84532 ? NETWORKS.baseSepolia : NETWORKS.arbitrumSepolia;
    const chain = flow.chainId === 84532 ? baseSepolia : arbitrumSepolia;

    const client = createPublicClient({
      chain: chain,
      transport: http(network.rpcUrl),
    }) as any;

    const walletClient = createWalletClient({
      account: userAccount,
      chain: chain,
      transport: http(network.rpcUrl),
    });

    console.log(`\n👤 User Account: ${userAccount.address}`);
    console.log(`   ⚡ This account will sign EIP-3009 authorization (OFF-CHAIN - NO GAS!)`);

    // Check USDC balance
    console.log(`\n💵 Checking USDC Balance on ${flow.chainName}`);
    console.log('--------------------------------------------------');

    const usdcBalance = (await client.readContract({
      address: flow.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAccount.address],
    })) as bigint;

    console.log(`User Account Balance: ${formatUnits(usdcBalance, 6)} USDC`);

    if (usdcBalance < TEST_CONFIG.supplyAmount) {
      throw new Error(
        `Insufficient USDC balance. Need ${formatUnits(TEST_CONFIG.supplyAmount, 6)}, have ${formatUnits(usdcBalance, 6)}`
      );
    }

    // ===== CREATE ORCHESTRATION REQUEST (using SDK) =====
    console.log(`\n===== CREATE ORCHESTRATION REQUEST (using SDK) =====`);

    // Get required state using SDK
    console.log(
      `\n📊 Getting required state for AutoEarn module on ${flow.chainName} (chainId: ${flow.chainId})...`
    );
    const requiredState = await getRequiredState({
      sourceChainId: String(flow.chainId) as any,
      moduleName: 'AUTOEARN',
    });
    console.log(`✅ Module Address: ${requiredState.moduleAddress}`);
    console.log(`   Chain ID: ${requiredState.chainId}`);

    // Encode AutoEarn module data using SDK helper functions
    console.log('\n🔧 Encoding AutoEarn module configuration...');
    const autoEarnConfig = createAutoEarnConfig(
      flow.chainId,
      flow.tokenAddress,
      flow.aavePool
    );
    const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`);

    const currentState: CurrentState = {
      chainId: String(flow.chainId) as any,
      tokenAddress: flow.tokenAddress,
      tokenAmount: TEST_CONFIG.supplyAmount.toString(),
      ownerAddress: userAccount.address,
    };

    console.log('📝 User Intent:');
    console.log(
      `   Current: ${formatUnits(TEST_CONFIG.supplyAmount, 6)} USDC on ${flow.chainName}`
    );
    console.log(`   Target: Invest in Aave on ${flow.chainName} (same chain)`);
    console.log(`   Owner: ${userAccount.address} (will sign EIP-3009 authorization)`);

    // Create orchestration data using SDK
    console.log('\n📤 Creating orchestration request...');
    const orchestrationData = await createOrchestrationData(
      currentState,
      requiredState,
      userAccount.address,
      TEST_CONFIG.apiKey,
      encodedData as Hex
    );

    console.log('\n✅ Orchestration Created Successfully!');
    console.log('--------------------------------------');
    console.log(`📌 Request ID: ${orchestrationData.requestId}`);
    console.log(`📍 Chain: ${orchestrationData.sourceChainId} (${flow.chainName})`);
    console.log(
      `💼 Source Account: ${orchestrationData.accountAddressOnSourceChain} (User Account - EOA)`
    );
    console.log(
      `💼 Destination Smart Account: ${orchestrationData.accountAddressOnDestinationChain}`
    );
    console.log(
      `🔧 Destination Modules: ${orchestrationData.destinationChainAccountModules.join(', ') || 'None'}`
    );

    // ===== GASLESS DEPOSIT WITH EIP-3009 (using SDK) =====
    console.log(
      `\n===== GASLESS DEPOSIT WITH EIP-3009 (using SDK) =====`
    );
    console.log(`Amount: ${formatUnits(TEST_CONFIG.supplyAmount, 6)} USDC`);
    console.log(`Smart Account: ${orchestrationData.accountAddressOnDestinationChain}`);

    console.log('\nSigning EIP-3009 authorization (GASLESS!)...');
    console.log(`   From: ${userAccount.address} (user wallet with USDC)`);
    console.log(
      `   To: ${orchestrationData.accountAddressOnDestinationChain} (smart account)`
    );
    console.log(`   ⚠️  Signing is OFF-CHAIN - NO GAS NEEDED!`);

    // Use SDK depositGasless function - user wallet signs directly
    const gaslessResult: GaslessDepositResult = await depositGasless(
      userAccount.address, // from - user wallet that owns USDC
      orchestrationData.accountAddressOnDestinationChain, // to - smart account address
      flow.tokenAddress, // token address
      TEST_CONFIG.supplyAmount, // amount
      walletClient, // wallet client (signs authorization, NO ETH needed for signing!)
      client // public client
    );

    if (!gaslessResult.success || !gaslessResult.signedAuthorization) {
      throw new Error(`Gasless deposit failed: ${gaslessResult.error}`);
    }

    console.log('\n✅ EIP-3009 authorization signed successfully (gasless)!');
    console.log(
      `   Authorization From: ${gaslessResult.signedAuthorization.from}`
    );
    console.log(`   Authorization To: ${gaslessResult.signedAuthorization.to}`);
    console.log(
      `   Authorization Value: ${formatUnits(gaslessResult.signedAuthorization.value, 6)} USDC`
    );
    console.log(
      `   Authorization Nonce: ${gaslessResult.signedAuthorization.nonce}`
    );

    // Verify user still has USDC (no transfer happened yet - server will do it)
    const userBalanceAfter = (await client.readContract({
      address: flow.tokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAccount.address],
    })) as bigint;
    console.log(
      `\n💰 User USDC balance: ${formatUnits(userBalanceAfter, 6)} USDC (unchanged - server will transfer)`
    );

    // ===== NOTIFY SERVER WITH SIGNED AUTHORIZATION (using SDK) =====
    console.log(
      `\n===== NOTIFY SERVER WITH SIGNED AUTHORIZATION (using SDK) =====`
    );
    console.log(
      `   Transfer Type: TRANSFER_WITH_AUTHORIZATION (${TransferType.TRANSFER_WITH_AUTHORIZATION})`
    );
    console.log(`   Request ID: ${orchestrationData.requestId}`);
    console.log(`   ⚠️  Note: No transaction hash needed - signing was off-chain!`);

    // Use SDK notifyDepositGasless function
    await notifyDepositGasless(
      orchestrationData.requestId,
      '0x' as Hex, // No transaction hash - signing was off-chain
      '0', // No block number - signing was off-chain
      gaslessResult.signedAuthorization
    );

    console.log('✅ Server notified successfully!');
    console.log('   Server will execute transferWithAuthorization in Multicall3 batch');
    console.log(`   Server will execute Multicall3 batch:`);
    console.log(`   • Deploy Nexus account on chain`);
    console.log(
      `   • transferWithAuthorization (from user account to destination smart account)`
    );
    console.log(`   • Execute AutoEarn module (deposit to Aave)`);

    // ===== MONITOR ORCHESTRATION STATUS (using SDK) =====
    console.log(`\n===== MONITOR ORCHESTRATION STATUS (using SDK) =====`);
    console.log('⏳ Polling orchestration status...');
    console.log('   ✅ Completely gasless - user only signed off-chain!');

    let completed = false;
    let finalStatus: OrchestrationStatus | null = null;

    try {
      const polledStatus = await pollOrchestrationStatus({
        requestId: orchestrationData.requestId,
        interval: 3000,
        maxAttempts: 40,
        onStatusUpdate: (status: OrchestrationStatus) => {
          console.log(`\n[Status Update] ${status.status}`);
          if (status.updated_at || status.created_at) {
            console.log(
              `   Updated: ${new Date(status.updated_at || status.created_at || Date.now()).toLocaleString()}`
            );
          }
          if (status.error_message) {
            console.log(`   Error: ${status.error_message}`);
          }
        },
        onComplete: (status: OrchestrationStatus) => {
          console.log('\n🎉 Orchestration completed successfully!');
          console.log(`   Final Status: ${status.status}`);
          completed = true;
          finalStatus = status;
        },
        onError: (error: Error) => {
          console.log(`\n❌ Orchestration error: ${error.message}`);
        },
      });
      // If polling completed without calling onComplete, use the returned status
      if (!finalStatus) {
        finalStatus = polledStatus;
        completed =
          polledStatus.status === 'COMPLETED' ||
          polledStatus.status === 'FAILED';
      }
    } catch (error) {
      console.log(`\n⚠️  Status polling completed or timed out`);
      if (error instanceof Error) {
        console.log(`   ${error.message}`);
      }
    }

    if (completed && finalStatus) {
      if (finalStatus.status === 'COMPLETED') {
        console.log(`\n🎉 Flow ${flowNumber} (EIP-3009) completed successfully!`);
        return { success: true, requestId: orchestrationData.requestId };
      } else if (finalStatus.status === 'FAILED') {
        console.log(`\n❌ Flow ${flowNumber} (EIP-3009) failed!`);
        return {
          success: false,
          requestId: orchestrationData.requestId,
          error: finalStatus.error_message || 'Unknown error',
        };
      }
    }

    console.log(
      `\n⏱️  Flow ${flowNumber} (EIP-3009) still in progress or timed out`
    );
    return {
      success: false,
      requestId: orchestrationData.requestId,
      error: 'Timeout',
    };
  } catch (error: any) {
    console.error(`\n❌ Flow ${flowNumber} (EIP-3009) Failed!`);
    console.error('================');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🚀 Starting Same-Chain Orchestration Test (SDK)');
  console.log('='.repeat(80));
  console.log('💰 Testing Supply → Earn on Same Chain (No Bridge)');
  console.log('='.repeat(80));

  try {
    // Check if server is running
    console.log('\n📡 Checking Server Status...');
    console.log('-----------------------------');
    try {
      const healthResponse = await fetch(
        `${TEST_CONFIG.apiUrl}/api/v1/orchestration/chains`
      );
      if (!healthResponse.ok) {
        throw new Error(`Server not responding: ${healthResponse.status}`);
      }
      const chains = (await healthResponse.json()) as {
        data: Array<{ name: string }>;
      };
      console.log('✅ Server is running');
      console.log(
        `   Available chains: ${chains.data.map((c) => c.name).join(', ')}`
      );
    } catch (error) {
      console.error('❌ Server is not running!');
      console.error(
        `   Please start the server or use production: ${TEST_CONFIG.apiUrl}`
      );
      process.exit(1);
    }

    // Setup user account
    console.log('\n🔐 Setting up User Account');
    console.log('-----------------------------');
    const privateKey = process.env.TEST_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(
        'TEST_PRIVATE_KEY or PRIVATE_KEY environment variable is required'
      );
    }
    const userAccount = privateKeyToAccount(privateKey as Hex);
    console.log(`💰 User Account: ${userAccount.address}`);
    console.log(
      `   This account will be used for all operations (transfers and EIP-3009 signing)`
    );

    // Define flows
    const flow1: SameChainFlow = {
      chainId: 84532, // Base Sepolia
      chainName: 'Base Sepolia',
      tokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      autoEarnModule: NETWORKS.baseSepolia.contracts.autoEarnModule,
      aavePool: NETWORKS.baseSepolia.contracts.aavePool,
    };

    const flow2: SameChainFlow = {
      chainId: 421614, // Arbitrum Sepolia
      chainName: 'Arbitrum Sepolia',
      tokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      autoEarnModule: NETWORKS.arbitrumSepolia.contracts.autoEarnModule,
      aavePool: NETWORKS.arbitrumSepolia.contracts.aavePool,
    };

    // Execute Flow 1: Base Sepolia → Base Sepolia (NORMAL)
    const result1 = await testSameChainFlow(userAccount, flow1, 1);

    // Wait a bit before starting flow 2
    if (result1.success) {
      console.log('\n⏳ Waiting 5 seconds before starting next flow...');
      await delay(5000);
    }

    // Execute Flow 2: Arbitrum Sepolia → Arbitrum Sepolia (NORMAL)
    const result2 = await testSameChainFlow(userAccount, flow2, 2);

    // Wait a bit before starting EIP-3009 tests
    if (result2.success) {
      console.log('\n⏳ Waiting 5 seconds before starting EIP-3009 tests...');
      await delay(5000);
    }

    // Execute Flow 3: Base Sepolia → Base Sepolia (EIP-3009)
    const result3 = await testSameChainFlowWithEIP3009(userAccount, flow1, 3);

    // Wait a bit before starting next EIP-3009 test
    if (result3.success) {
      console.log('\n⏳ Waiting 5 seconds before starting next EIP-3009 test...');
      await delay(5000);
    }

    // Execute Flow 4: Arbitrum Sepolia → Arbitrum Sepolia (EIP-3009)
    const result4 = await testSameChainFlowWithEIP3009(userAccount, flow2, 4);

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📝 TEST SUMMARY - SAME-CHAIN OPERATIONS (SDK)');
    console.log('='.repeat(80));

    console.log('\n✅ Flow 1: Base Sepolia → Base Sepolia (NORMAL - Type 0)');
    if (result1.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result1.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result1.error) console.log(`   Error: ${result1.error}`);
    }

    console.log('\n✅ Flow 2: Arbitrum Sepolia → Arbitrum Sepolia (NORMAL - Type 0)');
    if (result2.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result2.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result2.error) console.log(`   Error: ${result2.error}`);
    }

    console.log('\n✅ Flow 3: Base Sepolia → Base Sepolia (EIP-3009 - Type 1)');
    if (result3.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result3.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result3.error) console.log(`   Error: ${result3.error}`);
    }

    console.log('\n✅ Flow 4: Arbitrum Sepolia → Arbitrum Sepolia (EIP-3009 - Type 1)');
    if (result4.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result4.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result4.error) console.log(`   Error: ${result4.error}`);
    }

    console.log('\n🔄 Orchestration Process for NORMAL Flows (Type 0):');
    console.log('   • Create orchestration request (SDK)');
    console.log('   • Transfer USDC to destination smart account (SDK)');
    console.log('   • Notify server of deposit (SDK)');
    console.log('   • Server executes Multicall3 batch:');
    console.log('     - Deploy Nexus account on chain');
    console.log('     - Execute AutoEarn module (deposit to Aave)');
    console.log('   • Server updates status to COMPLETED');
    console.log('   • ⚠️  No bridge needed - same chain!');

    console.log('\n🔄 Orchestration Process for EIP-3009 Flows (Type 1):');
    console.log('   • Create orchestration request (SDK)');
    console.log('   • Sign EIP-3009 authorization (OFF-CHAIN - NO GAS!) (SDK)');
    console.log('   • Notify server with transferType: 1 and signedData (SDK)');
    console.log('   • Server executes Multicall3 batch:');
    console.log('     - Deploy Nexus account on chain');
    console.log(
      '     - transferWithAuthorization (from user account to destination smart account)'
    );
    console.log('     - Execute AutoEarn module (deposit to Aave)');
    console.log('   • Server updates status to COMPLETED');
    console.log('   • ⚠️  No bridge needed - same chain!');
    console.log('   • ⚡ Truly gasless - user only signed off-chain!');

    console.log('\n✅ SDK Functions Used:');
    console.log('   1. getRequiredState() - Get module requirements');
    console.log('   2. createAutoEarnConfig() - Create AutoEarn config');
    console.log('   3. encodeAutoEarnModuleData() - Encode module data');
    console.log('   4. createOrchestrationData() - Create orchestration request');
    console.log('   5. transferToOrchestrationAccount() - Transfer tokens (NORMAL)');
    console.log('   6. notifyDeposit() - Notify server (NORMAL)');
    console.log('   7. depositGasless() - Sign EIP-3009 authorization (off-chain)');
    console.log('   8. notifyDepositGasless() - Notify server with signed data (EIP-3009)');
    console.log('   9. pollOrchestrationStatus() - Monitor orchestration');

    console.log('\n📌 Important URLs:');
    if (result1.requestId) {
      console.log(
        `   Flow 1 Status: ${TEST_CONFIG.apiUrl}/api/v1/orchestration/status/${result1.requestId}`
      );
    }
    if (result2.requestId) {
      console.log(
        `   Flow 2 Status: ${TEST_CONFIG.apiUrl}/api/v1/orchestration/status/${result2.requestId}`
      );
    }
    if (result3.requestId) {
      console.log(
        `   Flow 3 Status: ${TEST_CONFIG.apiUrl}/api/v1/orchestration/status/${result3.requestId}`
      );
    }
    if (result4.requestId) {
      console.log(
        `   Flow 4 Status: ${TEST_CONFIG.apiUrl}/api/v1/orchestration/status/${result4.requestId}`
      );
    }

    if (result1.success && result2.success && result3.success && result4.success) {
      console.log('\n✨ All flows completed successfully!');
      process.exit(0);
    } else {
      console.log('\n⚠️  Some flows failed. Check the logs above for details.');
      process.exit(1);
    }
  } catch (error: any) {
    console.error('\n❌ Test Failed!');
    console.error('================');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
main()
  .then(() => {
    console.log('\n👍 Script execution completed');
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error);
    process.exit(1);
  });
