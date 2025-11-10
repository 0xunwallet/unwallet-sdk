#!/usr/bin/env bun

/**
 * Test EIP-3009 Gasless Deposit - Bidirectional Base ↔ Arbitrum USDC Bridge
 *
 * This script tests both directions using EIP-3009 gasless transfers:
 * 1. Base → Arbitrum: Sign EIP-3009 authorization on Base, bridge to Arbitrum, earn on Arbitrum
 * 2. Arbitrum → Base: Sign EIP-3009 authorization on Arbitrum, bridge to Base, earn on Base
 *
 * Key Features:
 * - Uses TEST_PRIVATE_KEY (user account) directly for all operations
 * - EIP-3009 gasless signing (OFF-CHAIN - NO GAS!)
 * - Tests both directions in sequence
 * - Server sponsors all gas costs
 *
 * Prerequisites:
 * - Server must be running or use production server
 * - TEST_PRIVATE_KEY environment variable must be set (user account with USDC on both chains)
 * - Account must have USDC on both Base Sepolia and Arbitrum Sepolia
 * - Account does NOT need ETH for signing (EIP-3009 is off-chain!)
 *
 * Usage: bun run test/src/test-gasless-deposit-eip3009.ts
 */

import dotenv from 'dotenv';
import {
  createOrchestrationData,
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
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia, arbitrumSepolia } from 'viem/chains';
import type { Address, Hex } from 'viem';

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
  // Amount to bridge (0.1 USDC)
  bridgeAmount: parseUnits('0.1', 6),
  // API server URL
  apiUrl:
    process.env.TEST_SERVER_URL ||
    process.env.SERVER_URL ||
    'https://tee.wall8.xyz',
  // API key for orchestration
  apiKey: process.env.API_KEY || 'test-gasless-deposit-eip3009',
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface OrchestrationFlow {
  sourceChainId: number;
  destinationChainId: number;
  sourceChainName: string;
  destinationChainName: string;
  sourceTokenAddress: Address;
  destinationTokenAddress: Address;
  destinationAutoEarnModule: Address;
  destinationAavePool: Address;
}

/**
 * Test EIP-3009 Gasless Deposit Flow for a specific direction
 *
 * This function demonstrates:
 * 1. Creating orchestration request using SDK
 * 2. Signing EIP-3009 authorization with main wallet (OFF-CHAIN - NO GAS!)
 * 3. Notifying server with signed authorization (using SDK)
 * 4. Monitoring orchestration status (using SDK)
 *
 * Key features:
 * - Main wallet signs authorization directly (OFF-CHAIN - NO GAS!)
 * - No intermediate account needed
 * - Server executes transferWithAuthorization in Multicall3 batch
 * - TEE server sponsors all gas costs
 */
async function testGaslessDepositFlow(
  userAccount: ReturnType<typeof privateKeyToAccount>,
  flow: OrchestrationFlow,
  flowNumber: number
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  const sourceNetwork =
    flow.sourceChainId === 84532 ? NETWORKS.baseSepolia : NETWORKS.arbitrumSepolia;
  const destNetwork =
    flow.destinationChainId === 84532
      ? NETWORKS.baseSepolia
      : NETWORKS.arbitrumSepolia;
  const flowName = `${flow.sourceChainName} → ${flow.destinationChainName}`;

  console.log(`\n${'='.repeat(80)}`);
  console.log(`🌉 FLOW ${flowNumber}: ${flowName}`);
  console.log('='.repeat(80));

  try {
    // ===== 1. SETUP =====
    console.log('\n===== 1. SETUP =====');

    // Create clients for source chain
    const sourcePublicClient = createPublicClient({
      chain: sourceNetwork.chain,
      transport: http(sourceNetwork.rpcUrl),
    }) as any;

    const userWalletClient = createWalletClient({
      account: userAccount,
      chain: sourceNetwork.chain,
      transport: http(sourceNetwork.rpcUrl),
    });

    // Check user's USDC balance on source chain
    const userBalance = (await sourcePublicClient.readContract({
      address: sourceNetwork.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAccount.address],
    })) as bigint;
    console.log(
      `💰 User USDC balance on ${sourceNetwork.name}:`,
      formatUnits(userBalance, 6),
      'USDC'
    );

    if (userBalance < TEST_CONFIG.bridgeAmount) {
      throw new Error(
        `Insufficient USDC on ${sourceNetwork.name}. Need ${formatUnits(
          TEST_CONFIG.bridgeAmount,
          6
        )}, have ${formatUnits(userBalance, 6)}`
      );
    }

    // ===== 2. CREATE ORCHESTRATION REQUEST =====
    console.log('\n===== 2. CREATE ORCHESTRATION REQUEST (using SDK) =====');

    // Get required state using SDK (destination chain)
    console.log(
      `\n📊 Getting required state for AutoEarn module on ${destNetwork.name} (chainId: ${destNetwork.chainId})...`
    );
    const requiredState = await getRequiredState({
      sourceChainId: String(destNetwork.chainId) as any, // Convert to string (SupportedChain is '84532' | '421614')
      moduleName: 'AUTOEARN',
    });
    console.log(`✅ Module Address: ${requiredState.moduleAddress}`);
    console.log(`   Chain ID: ${requiredState.chainId}`);

    // Encode AutoEarn module data using SDK helper functions
    console.log('\n🔧 Encoding AutoEarn module configuration...');
    const autoEarnConfig = createAutoEarnConfig(
      destNetwork.chainId, // Destination chain ID
      destNetwork.contracts.usdcToken,
      destNetwork.contracts.aavePool
    );
    const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`);

    
    const currentState: CurrentState = {
      chainId: String(sourceNetwork.chainId) as any,
      tokenAddress: sourceNetwork.contracts.usdcToken,
      tokenAmount: TEST_CONFIG.bridgeAmount.toString(),
      ownerAddress: userAccount.address, // User account owns the smart accounts
    };

    console.log('📝 User Intent:');
    console.log(
      `   Current: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC on ${sourceNetwork.name}`
    );
    console.log(`   Target: Invest in Aave on ${destNetwork.name}`);
    console.log(`   Owner: ${userAccount.address}`);

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
    console.log(
      `📍 Source Chain: ${orchestrationData.sourceChainId} (${sourceNetwork.name})`
    );
    console.log(
      `📍 Destination Chain: ${orchestrationData.destinationChainId} (${destNetwork.name})`
    );
    console.log(
      `💼 Source Account: ${orchestrationData.accountAddressOnSourceChain}`
    );
    console.log(
      `💼 Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`
    );
    console.log(
      `🔧 Source Modules: ${orchestrationData.sourceChainAccountModules.join(', ') || 'None'}`
    );
    console.log(
      `🔧 Destination Modules: ${orchestrationData.destinationChainAccountModules.join(', ') || 'None'}`
    );

    // Verify bridge module is present when bridging between different chains
    if (orchestrationData.sourceChainId !== orchestrationData.destinationChainId) {
      // Known bridge module addresses
      const bridgeModuleAddresses = [
        '0xe8Da54c7056680FF1b7FF6E9dfD0721dDcAd3F14', // Base Sepolia AUTOBRIDGE
        '0xDdAd6d1084fF9e8CaBf579358A95666Bf5515F51', // Arbitrum Sepolia AUTOBRIDGE
      ];

      const hasBridgeModule = orchestrationData.sourceChainAccountModules.some(
        (addr) =>
          bridgeModuleAddresses.some(
            (bridgeAddr) => addr.toLowerCase() === bridgeAddr.toLowerCase()
          )
      );

      if (!hasBridgeModule) {
        console.warn('\n⚠️  WARNING: No AUTOBRIDGE module detected on source chain!');
        console.warn(
          `   Source Chain: ${orchestrationData.sourceChainId} (${sourceNetwork.name})`
        );
        console.warn(
          `   Destination Chain: ${orchestrationData.destinationChainId} (${destNetwork.name})`
        );
        console.warn(
          '   The server should automatically add AUTOBRIDGE when bridging between different chains.'
        );
        console.warn(
          `   Source modules returned: ${orchestrationData.sourceChainAccountModules.length > 0 ? orchestrationData.sourceChainAccountModules.join(', ') : 'Empty array'}`
        );
        console.warn('   Expected bridge module addresses:');
        bridgeModuleAddresses.forEach((addr) => console.warn(`     - ${addr}`));
      } else {
        console.log(
          '\n✅ AUTOBRIDGE module detected on source chain (server will handle bridging)'
        );
      }
    } else {
      console.log('\nℹ️  Same source and destination chain - no bridge needed');
    }

    // ===== 3. GASLESS DEPOSIT WITH EIP-3009 =====
    console.log('\n===== 3. GASLESS DEPOSIT WITH EIP-3009 (using SDK) =====');
    console.log(`Amount: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC`);
    console.log(`Smart Account: ${orchestrationData.accountAddressOnSourceChain}`);

    console.log('\nSigning EIP-3009 authorization (GASLESS!)...');
    console.log(`   From: ${userAccount.address} (main wallet with USDC)`);
    console.log(
      `   To: ${orchestrationData.accountAddressOnSourceChain} (smart account)`
    );
    console.log(`   ⚠️  Signing is OFF-CHAIN - NO GAS NEEDED!`);

    // Use SDK depositGasless function - main wallet signs directly
    const gaslessResult: GaslessDepositResult = await depositGasless(
      userAccount.address, // from - main wallet that owns USDC
      orchestrationData.accountAddressOnSourceChain, // to - smart account address
      sourceNetwork.contracts.usdcToken, // token address (source chain USDC)
      TEST_CONFIG.bridgeAmount, // amount
      userWalletClient, // wallet client (signs authorization, NO ETH needed for signing!)
      sourcePublicClient // public client
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
    const userBalanceAfter = (await sourcePublicClient.readContract({
      address: sourceNetwork.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAccount.address],
    })) as bigint;
    console.log(
      `\n💰 User USDC balance: ${formatUnits(userBalanceAfter, 6)} USDC (unchanged - server will transfer)`
    );

    // ===== 4. NOTIFY SERVER WITH SIGNED AUTHORIZATION =====
    console.log(
      '\n===== 4. NOTIFY SERVER WITH SIGNED AUTHORIZATION (using SDK) ====='
    );
    console.log(
      `   Transfer Type: TRANSFER_WITH_AUTHORIZATION (${TransferType.TRANSFER_WITH_AUTHORIZATION})`
    );
    console.log(`   Request ID: ${orchestrationData.requestId}`);
    console.log(`   ⚠️  Note: No transaction hash needed - signing was off-chain!`);

    // Use SDK notifyDepositGasless function
    // Note: transactionHash and blockNumber are not needed for gasless transfers
    // We pass empty values as placeholders since the server will execute the transfer
    await notifyDepositGasless(
      orchestrationData.requestId,
      '0x' as Hex, // No transaction hash - signing was off-chain
      '0', // No block number - signing was off-chain
      gaslessResult.signedAuthorization
    );

    console.log('✅ Server notified successfully!');
    console.log('   Server will execute transferWithAuthorization in Multicall3 batch');

    // ===== 5. MONITOR ORCHESTRATION STATUS =====
    console.log('\n===== 5. MONITOR ORCHESTRATION STATUS (using SDK) =====');
    console.log('⏳ Server will now:');
    console.log('   1. Execute Multicall3 batch:');
    console.log(
      '      - transferWithAuthorization (move from user wallet to smart account)'
    );
    console.log('      - Deploy Nexus account on source chain');
    console.log('      - Execute bridge operation');
    console.log('   2. Monitor destination chain for funds');
    console.log('   3. Deploy Nexus account on destination chain');
    console.log('   4. Execute AutoEarn module');
    console.log('\n⏳ Polling orchestration status...');
    console.log('   (This may take 2-3 minutes for bridge transfer)');
    console.log('   ✅ Completely gasless - user only signed off-chain!');

    let completed = false;
    let finalStatus: OrchestrationStatus | null = null;

    try {
      const polledStatus = await pollOrchestrationStatus({
        requestId: orchestrationData.requestId,
        interval: 5000, // 5 seconds
        maxAttempts: 60, // 5 minutes
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
        completed = polledStatus.status === 'COMPLETED' || polledStatus.status === 'FAILED';
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

async function main() {
  console.log('🚀 Starting Bidirectional EIP-3009 Gasless Deposit Test');
  console.log('='.repeat(80));
  console.log('⚡ Using User Account for EIP-3009 Gasless Signing');
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
    console.log(`   This account will sign EIP-3009 authorizations (OFF-CHAIN - NO GAS!)`);

    // Define flows
    const flow1: OrchestrationFlow = {
      sourceChainId: 84532, // Base Sepolia
      destinationChainId: 421614, // Arbitrum Sepolia
      sourceChainName: 'Base Sepolia',
      destinationChainName: 'Arbitrum Sepolia',
      sourceTokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      destinationTokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      destinationAutoEarnModule: NETWORKS.arbitrumSepolia.contracts.autoEarnModule,
      destinationAavePool: NETWORKS.arbitrumSepolia.contracts.aavePool,
    };

    const flow2: OrchestrationFlow = {
      sourceChainId: 421614, // Arbitrum Sepolia
      destinationChainId: 84532, // Base Sepolia
      sourceChainName: 'Arbitrum Sepolia',
      destinationChainName: 'Base Sepolia',
      sourceTokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      destinationTokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      destinationAutoEarnModule: NETWORKS.baseSepolia.contracts.autoEarnModule,
      destinationAavePool: NETWORKS.baseSepolia.contracts.aavePool,
    };

    // Execute Flow 1: Base → Arbitrum
    const result1 = await testGaslessDepositFlow(userAccount, flow1, 1);

    // Wait a bit before starting flow 2
    if (result1.success) {
      console.log('\n⏳ Waiting 5 seconds before starting reverse flow...');
      await delay(5000);
    }

    // Execute Flow 2: Arbitrum → Base
    const result2 = await testGaslessDepositFlow(userAccount, flow2, 2);

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📝 TEST SUMMARY - BIDIRECTIONAL EIP-3009 GASLESS DEPOSIT');
    console.log('='.repeat(80));
    console.log('\n✅ Flow 1: Base → Arbitrum');
    if (result1.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result1.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result1.error) console.log(`   Error: ${result1.error}`);
    }

    console.log('\n✅ Flow 2: Arbitrum → Base');
    if (result2.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result2.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result2.error) console.log(`   Error: ${result2.error}`);
    }

    console.log('\n🔄 Orchestration Process for Each Flow:');
    console.log('   • Create orchestration request (SDK)');
    console.log('   • Sign EIP-3009 authorization (OFF-CHAIN - NO GAS!)');
    console.log('   • Notify server with signed authorization (SDK)');
    console.log('   • Server executes Multicall3 batch:');
    console.log('     - transferWithAuthorization (move USDC from user to smart account)');
    console.log('     - Deploy Nexus account on source chain');
    console.log('     - Execute bridge operation');
    console.log('   • Server monitors destination chain for funds');
    console.log('   • Server deploys Nexus account on destination chain');
    console.log('   • Server executes AutoEarn module');
    console.log('   • Server updates status to COMPLETED');

    console.log('\n✅ SDK Functions Used:');
    console.log('   1. getRequiredState() - Get module requirements');
    console.log('   2. createAutoEarnConfig() - Create AutoEarn config');
    console.log('   3. encodeAutoEarnModuleData() - Encode module data');
    console.log('   4. createOrchestrationData() - Create orchestration request');
    console.log('   5. depositGasless() - Sign EIP-3009 authorization (off-chain)');
    console.log('   6. notifyDepositGasless() - Notify server with signed data');
    console.log('   7. pollOrchestrationStatus() - Monitor orchestration');

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

    if (result1.success && result2.success) {
      console.log('\n✨ Both flows completed successfully!');
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
