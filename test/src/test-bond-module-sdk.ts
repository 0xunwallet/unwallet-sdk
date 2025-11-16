/**
 * Test BondModule Installation - Using SDK
 *
 * This script tests BondModule installation using the unwallet SDK:
 * 
 * Tests all 4 scenarios:
 * 1. Base Sepolia → Base Sepolia (same chain)
 * 2. Arbitrum Sepolia → Arbitrum Sepolia (same chain)
 * 3. Base Sepolia → Arbitrum Sepolia (cross-chain)
 * 4. Arbitrum Sepolia → Base Sepolia (cross-chain)
 *
 * Key Features:
 * - Uses SDK functions for all operations
 * - Tests both same-chain and cross-chain scenarios
 * - Uses createBondModuleConfig and encodeBondModuleData from SDK
 * - Uses createOrchestrationData, transferToOrchestrationAccount, notifyDeposit
 * - Uses pollOrchestrationStatus to monitor deployment
 *
 * Prerequisites:
 * - Server must be running or use production server
 * - TEST_PRIVATE_KEY environment variable must be set (account with USDC on both chains)
 * - Account must have USDC on both Base Sepolia and Arbitrum Sepolia
 * - Account must have ETH on both chains for gas
 *
 * Usage: cd test && bun run src/test-bond-module-sdk.ts
 */

import dotenv from 'dotenv';
import {
  createOrchestrationData,
  notifyDeposit,
  pollOrchestrationStatus,
  getRequiredState,
  encodeBondModuleData,
  createBondModuleConfig,
  deposit,
} from 'unwallet';
import type { CurrentState, OrchestrationStatus } from 'unwallet';
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
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
      bondModule: '0xd68229d1e47ad39156766d71cde1787b64905dc5' as Address,
      usdcToken: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as Address,
    },
  },
  arbitrumSepolia: {
    name: 'Arbitrum Sepolia',
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl:
      process.env.ARBITRUM_SEPOLIA_RPC || 'https://sepolia-rollup.arbitrum.io/rpc',
    contracts: {
      bondModule: '0x2e56ca0a3212e1ebef0d7e33d7c33be55b50259d' as Address,
      usdcToken: '0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d' as Address,
    },
  },
};

// Test configuration
const TEST_CONFIG = {
  // Amount to bond (0.05 USDC)
  bondAmount: parseUnits('0.05', 6),
  // API server URL
  apiUrl:
    process.env.TEST_SERVER_URL ||
    process.env.SERVER_URL ||
    'https://tee.unwallet.io',
  // API key for orchestration
  apiKey: process.env.API_KEY || 'test-api-bond-module',
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface BondModuleFlow {
  sourceChainId: number;
  destinationChainId: number;
  sourceChainName: string;
  destinationChainName: string;
  sourceTokenAddress: Address;
  destinationTokenAddress: Address;
  destinationBondModule: Address;
  isCrossChain: boolean;
}

/**
 * Test BondModule Flow using SDK
 * Uses SDK functions for orchestration, transfer, and notification
 */
async function testBondModuleFlow(
  testAccount: ReturnType<typeof privateKeyToAccount>,
  fundingAccount: ReturnType<typeof privateKeyToAccount>,
  flow: BondModuleFlow,
  flowNumber: number
): Promise<{ success: boolean; requestId?: string; error?: string }> {
  console.log(`\n${'='.repeat(80)}`);
  console.log(
    `💰 FLOW ${flowNumber}: ${flow.sourceChainName} → ${flow.destinationChainName} (${flow.isCrossChain ? 'Cross-Chain' : 'Same Chain'})`
  );
  console.log('='.repeat(80));

  try {
    // Create clients for source chain
    const sourceNetwork =
      flow.sourceChainId === 84532 ? NETWORKS.baseSepolia : NETWORKS.arbitrumSepolia;
    const sourceChain = flow.sourceChainId === 84532 ? baseSepolia : arbitrumSepolia;

    const sourceClient = createPublicClient({
      chain: sourceChain,
      transport: http(sourceNetwork.rpcUrl),
    }) as any;

    const sourceWalletClient = createWalletClient({
      account: fundingAccount,
      chain: sourceChain,
      transport: http(sourceNetwork.rpcUrl),
    });

    // Create client for destination chain
    const destNetwork =
      flow.destinationChainId === 84532
        ? NETWORKS.baseSepolia
        : NETWORKS.arbitrumSepolia;
    const destChain = flow.destinationChainId === 84532 ? baseSepolia : arbitrumSepolia;

    const destClient = createPublicClient({
      chain: destChain,
      transport: http(destNetwork.rpcUrl),
    }) as any;

    // Check USDC balance on source chain
    console.log(`\n💵 Checking USDC Balance on ${flow.sourceChainName}`);
    console.log('--------------------------------------------------');

    const usdcBalance = (await sourceClient.readContract({
      address: flow.sourceTokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [fundingAccount.address],
    })) as bigint;

    console.log(`Funding Account Balance: ${formatUnits(usdcBalance, 6)} USDC`);

    if (usdcBalance < TEST_CONFIG.bondAmount) {
      throw new Error(
        `Insufficient USDC balance. Need ${formatUnits(TEST_CONFIG.bondAmount, 6)}, have ${formatUnits(usdcBalance, 6)}`
      );
    }

    // ===== CREATE ORCHESTRATION REQUEST (using SDK) =====
    console.log(`\n===== CREATE ORCHESTRATION REQUEST (using SDK) =====`);

    // Get required state using SDK
    console.log(
      `\n📊 Getting required state for BondModule on ${flow.destinationChainName} (chainId: ${flow.destinationChainId})...`
    );
    const requiredState = await getRequiredState({
      sourceChainId: String(flow.destinationChainId) as any,
      moduleName: 'BOND',
    });
    console.log(`✅ Module Address: ${requiredState.moduleAddress}`);
    console.log(`   Chain ID: ${requiredState.chainId}`);

    // Create BondModule config using SDK helper functions
    console.log('\n🔧 Creating BondModule configuration using SDK...');
    const bondConfig = createBondModuleConfig(
      [flow.destinationTokenAddress], // Token addresses to bond
      [TEST_CONFIG.bondAmount] // Total amounts for each token
    );
    console.log(`✅ Created BondModule config:`);
    console.log(`   Token Addresses: ${bondConfig.tokenAddresses.join(', ')}`);
    console.log(
      `   Total Amounts: ${bondConfig.totalAmounts.map((a) => formatUnits(a, 6)).join(', ')} USDC`
    );

    // Encode BondModule data using SDK
    console.log('\n🔧 Encoding BondModule data using SDK...');
    const encodedData = encodeBondModuleData(bondConfig);
    console.log(`✅ Encoded BondModule data: ${encodedData.substring(0, 66)}...`);

    const currentState: CurrentState = {
      chainId: String(flow.sourceChainId) as any,
      tokenAddress: flow.sourceTokenAddress,
      tokenAmount: TEST_CONFIG.bondAmount.toString(),
      ownerAddress: fundingAccount.address,
    };

    console.log('\n📝 User Intent:');
    console.log(
      `   Current: ${formatUnits(TEST_CONFIG.bondAmount, 6)} USDC on ${flow.sourceChainName}`
    );
    console.log(
      `   Target: Install BondModule on ${flow.destinationChainName}${flow.isCrossChain ? ' (cross-chain)' : ' (same chain)'}`
    );
    console.log(`   Test User Account: ${testAccount.address}`);
    console.log(`   Funding Account: ${fundingAccount.address}`);

    // Create orchestration data using SDK
    console.log('\n📤 Creating orchestration request using SDK...');
    const orchestrationData = await createOrchestrationData(
      currentState,
      requiredState,
      testAccount.address, // Use random test account as user address
      TEST_CONFIG.apiKey,
      encodedData as Hex
    );

    console.log('\n✅ Orchestration Created Successfully!');
    console.log('--------------------------------------');
    console.log(`📌 Request ID: ${orchestrationData.requestId}`);
    console.log(`📍 Source Chain: ${orchestrationData.sourceChainId} (${flow.sourceChainName})`);
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
    console.log(`Amount: ${formatUnits(TEST_CONFIG.bondAmount, 6)} USDC`);
    console.log(`From: ${fundingAccount.address} (Funding Account)`);
    
    // ALWAYS send to source account address (regardless of same-chain or cross-chain)
    const recipientAddress = orchestrationData.accountAddressOnSourceChain as Address;
    
    console.log(`To: ${recipientAddress} (Source Account)`);
    console.log(`\n💡 Transfer strategy:`);
    console.log(`   Always send to source account address: ${recipientAddress}`);

    // Manually send USDC to the source account address
    const depositResult = await deposit(
      recipientAddress,
      flow.sourceTokenAddress,
      TEST_CONFIG.bondAmount,
      sourceWalletClient,
      sourceClient
    );

    if (!depositResult.success || !depositResult.txHash) {
      throw new Error(`Transfer failed: ${depositResult.error}`);
    }

    console.log(`✅ Transfer submitted: ${depositResult.txHash}`);

    // Get transaction receipt
    console.log('⏳ Waiting for transaction confirmation...');
    const receipt = await sourceClient.waitForTransactionReceipt({
      hash: depositResult.txHash as `0x${string}`,
    });

    console.log(`✅ Transfer confirmed! Block: ${receipt.blockNumber}`);

    // Verify balance
    const accountBalance = (await sourceClient.readContract({
      address: flow.sourceTokenAddress,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [recipientAddress],
    })) as bigint;
    console.log(
      `   Account Balance: ${formatUnits(accountBalance, 6)} USDC`
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
    if (flow.isCrossChain) {
      console.log('   1. Bridge tokens from source to destination chain');
      console.log('   2. Execute Multicall3 batch on destination chain:');
      console.log('      - Deploy Nexus account on destination chain');
      console.log('      - Execute BondModule (bond tokens)');
    } else {
      console.log('   1. Execute Multicall3 batch:');
      console.log('      - Deploy Nexus account on chain');
      console.log('      - Execute BondModule (bond tokens)');
    }
    console.log('   3. Update status to COMPLETED');
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

    // Verify deployment on destination chain
    if (completed && finalStatus) {
      console.log(`\n🔍 Verifying deployment on ${flow.destinationChainName}...`);
      const destAccountAddress = orchestrationData.accountAddressOnDestinationChain as Address;
      const code = await destClient.getCode({ address: destAccountAddress });
      const isDeployed = code && code !== '0x';
      
      if (isDeployed) {
        console.log(`✅ Destination account is deployed`);
        console.log(`   Account: ${destAccountAddress}`);
        console.log(`   Code length: ${code.length} bytes`);
        
        // Check balance on destination chain
        const destBalance = (await destClient.readContract({
          address: flow.destinationTokenAddress,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [destAccountAddress],
        })) as bigint;
        console.log(`   USDC Balance: ${formatUnits(destBalance, 6)} USDC`);
      } else {
        console.log(`⚠️  Destination account not yet deployed`);
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
  console.log('🚀 BondModule SDK Test Suite');
  console.log('='.repeat(80));
  console.log('💰 Testing BondModule Installation Using SDK');
  console.log('='.repeat(80));
  console.log(`API URL: ${TEST_CONFIG.apiUrl}`);
  console.log(`Test Amount: ${formatUnits(TEST_CONFIG.bondAmount, 6)} USDC`);

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

    // Setup accounts
    console.log('\n🔐 Setting up Accounts');
    console.log('-----------------------------');
    
    // Funding account (has USDC and ETH)
    const fundingPrivateKey = process.env.TEST_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!fundingPrivateKey) {
      throw new Error(
        'TEST_PRIVATE_KEY or PRIVATE_KEY environment variable is required'
      );
    }
    const fundingAccount = privateKeyToAccount(fundingPrivateKey as Hex);
    console.log(`💰 Funding Account: ${fundingAccount.address}`);
    console.log(`   This account has USDC and ETH for transfers`);
    
    // Generate random test account (for orchestration user address)
    const testPrivateKey = generatePrivateKey();
    const testAccount = privateKeyToAccount(testPrivateKey);
    console.log(`✅ Test Account: ${testAccount.address}`);
    console.log(`   Private Key: ${testPrivateKey}`);
    console.log(`   ⚠️  Save this private key to use the smart accounts later!`);

    // Define flows
    const flow1: BondModuleFlow = {
      sourceChainId: 84532, // Base Sepolia
      destinationChainId: 84532, // Base Sepolia
      sourceChainName: 'Base Sepolia',
      destinationChainName: 'Base Sepolia',
      sourceTokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      destinationTokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      destinationBondModule: NETWORKS.baseSepolia.contracts.bondModule,
      isCrossChain: false,
    };

    const flow2: BondModuleFlow = {
      sourceChainId: 421614, // Arbitrum Sepolia
      destinationChainId: 421614, // Arbitrum Sepolia
      sourceChainName: 'Arbitrum Sepolia',
      destinationChainName: 'Arbitrum Sepolia',
      sourceTokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      destinationTokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      destinationBondModule: NETWORKS.arbitrumSepolia.contracts.bondModule,
      isCrossChain: false,
    };

    const flow3: BondModuleFlow = {
      sourceChainId: 84532, // Base Sepolia
      destinationChainId: 421614, // Arbitrum Sepolia
      sourceChainName: 'Base Sepolia',
      destinationChainName: 'Arbitrum Sepolia',
      sourceTokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      destinationTokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      destinationBondModule: NETWORKS.arbitrumSepolia.contracts.bondModule,
      isCrossChain: true,
    };

    const flow4: BondModuleFlow = {
      sourceChainId: 421614, // Arbitrum Sepolia
      destinationChainId: 84532, // Base Sepolia
      sourceChainName: 'Arbitrum Sepolia',
      destinationChainName: 'Base Sepolia',
      sourceTokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      destinationTokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      destinationBondModule: NETWORKS.baseSepolia.contracts.bondModule,
      isCrossChain: true,
    };

    // Execute Flow 1: Base Sepolia → Base Sepolia (Same Chain)
    const result1 = await testBondModuleFlow(testAccount, fundingAccount, flow1, 1);

    // Wait a bit before starting flow 2
    if (result1.success) {
      console.log('\n⏳ Waiting 5 seconds before starting next flow...');
      await delay(5000);
    }

    // Execute Flow 2: Arbitrum Sepolia → Arbitrum Sepolia (Same Chain)
    const result2 = await testBondModuleFlow(testAccount, fundingAccount, flow2, 2);

    // Wait a bit before starting cross-chain tests
    if (result2.success) {
      console.log('\n⏳ Waiting 5 seconds before starting cross-chain tests...');
      await delay(5000);
    }

    // Execute Flow 3: Base Sepolia → Arbitrum Sepolia (Cross-Chain)
    const result3 = await testBondModuleFlow(testAccount, fundingAccount, flow3, 3);

    // Wait a bit before starting next cross-chain test
    if (result3.success) {
      console.log('\n⏳ Waiting 5 seconds before starting next cross-chain test...');
      await delay(5000);
    }

    // Execute Flow 4: Arbitrum Sepolia → Base Sepolia (Cross-Chain)
    const result4 = await testBondModuleFlow(testAccount, fundingAccount, flow4, 4);

    // Final summary
    console.log('\n' + '='.repeat(80));
    console.log('📝 TEST SUMMARY - BONDMODULE SDK TEST');
    console.log('='.repeat(80));

    console.log('\n✅ Flow 1: Base Sepolia → Base Sepolia (Same Chain)');
    if (result1.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result1.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result1.error) console.log(`   Error: ${result1.error}`);
    }

    console.log('\n✅ Flow 2: Arbitrum Sepolia → Arbitrum Sepolia (Same Chain)');
    if (result2.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result2.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result2.error) console.log(`   Error: ${result2.error}`);
    }

    console.log('\n✅ Flow 3: Base Sepolia → Arbitrum Sepolia (Cross-Chain)');
    if (result3.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result3.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result3.error) console.log(`   Error: ${result3.error}`);
    }

    console.log('\n✅ Flow 4: Arbitrum Sepolia → Base Sepolia (Cross-Chain)');
    if (result4.success) {
      console.log(`   Status: ✅ COMPLETED`);
      console.log(`   Request ID: ${result4.requestId}`);
    } else {
      console.log(`   Status: ❌ FAILED`);
      if (result4.error) console.log(`   Error: ${result4.error}`);
    }

    console.log('\n🔄 SDK Functions Used:');
    console.log('   1. getRequiredState() - Get BondModule requirements');
    console.log('   2. createBondModuleConfig() - Create BondModule config');
    console.log('   3. encodeBondModuleData() - Encode module data');
    console.log('   4. createOrchestrationData() - Create orchestration request');
    console.log('   5. transferToOrchestrationAccount() - Transfer tokens');
    console.log('   6. notifyDeposit() - Notify server of deposit');
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

    if (
      result1.success &&
      result2.success &&
      result3.success &&
      result4.success
    ) {
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

