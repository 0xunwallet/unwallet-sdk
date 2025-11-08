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
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
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

/**
 * Test EIP-3009 Gasless Deposit with SDK
 *
 * This test demonstrates:
 * 1. Creating orchestration request using SDK
 * 2. Generating random account with ZERO ETH (intermediate account)
 * 3. Transferring USDC to random account and signing EIP-3009 authorization (using SDK)
 * 4. Notifying server with signed authorization (using SDK)
 * 5. Monitoring orchestration status (using SDK)
 *
 * Key features:
 * - Random account OWNS smart accounts but has ZERO ETH
 * - All operations use SDK functions
 * - Server executes transferWithAuthorization in Multicall3 batch
 * - TEE server sponsors all gas costs
 */
async function testGaslessDepositEIP3009() {
  console.log('🚀 Testing EIP-3009 Gasless Deposit with UnWallet SDK');
  console.log('='.repeat(60));

  try {
    // ===== 1. SETUP =====
    console.log('\n===== 1. SETUP =====');

    // Get user account (has USDC and ETH)
    const userPrivateKey = (process.env.TEST_PRIVATE_KEY ||
      process.env.PRIVATE_KEY) as Hex;
    if (!userPrivateKey) {
      throw new Error(
        'TEST_PRIVATE_KEY or PRIVATE_KEY environment variable is required'
      );
    }
    const userAccount = privateKeyToAccount(userPrivateKey);
    console.log('✅ User account:', userAccount.address);

    // Generate random account (will have ZERO ETH - completely gasless!)
    const randomPrivateKey = generatePrivateKey();
    const randomAccount = privateKeyToAccount(randomPrivateKey);
    console.log('✅ Random intermediate account:', randomAccount.address);
    console.log('   Private Key:', randomPrivateKey);
    console.log('   (This account has ZERO ETH - completely gasless!)');
    console.log('   ⚠️  IMPORTANT: This account owns both smart accounts!');
    console.log(
      '   Save the private key if you want to use the smart accounts later.'
    );

    // Create clients
    const basePublicClient = createPublicClient({
      chain: baseSepolia,
      transport: http(NETWORKS.baseSepolia.rpcUrl),
    }) as any;

    const userWalletClient = createWalletClient({
      account: userAccount,
      chain: baseSepolia,
      transport: http(NETWORKS.baseSepolia.rpcUrl),
    });

    const randomWalletClient = createWalletClient({
      account: randomAccount,
      chain: baseSepolia,
      transport: http(NETWORKS.baseSepolia.rpcUrl),
    });

    // Check user's USDC balance
    const userBalance = (await basePublicClient.readContract({
      address: NETWORKS.baseSepolia.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [userAccount.address],
    })) as bigint;
    console.log('💰 User USDC balance:', formatUnits(userBalance, 6), 'USDC');

    if (userBalance < TEST_CONFIG.bridgeAmount) {
      throw new Error(
        `Insufficient USDC. Need ${formatUnits(TEST_CONFIG.bridgeAmount, 6)}, have ${formatUnits(userBalance, 6)}`
      );
    }

    // ===== 2. CREATE ORCHESTRATION REQUEST =====
    console.log('\n===== 2. CREATE ORCHESTRATION REQUEST (using SDK) =====');

    // Get required state using SDK
    const requiredState = await getRequiredState({
      sourceChainId: arbitrumSepolia.id,
      moduleName: 'AUTOEARN',
    });

    // Encode AutoEarn module data using SDK helper functions
    console.log('🔧 Encoding AutoEarn module configuration...');
    const autoEarnConfig = createAutoEarnConfig(
      421614, // Arbitrum Sepolia chain ID
      NETWORKS.arbitrumSepolia.contracts.usdcToken,
      NETWORKS.arbitrumSepolia.contracts.aavePool
    );
    const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`);

    const currentState: CurrentState = {
      chainId: baseSepolia.id,
      tokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      tokenAmount: TEST_CONFIG.bridgeAmount.toString(),
      ownerAddress: randomAccount.address, // Random account owns the smart accounts
    };

    console.log('📝 User Intent:');
    console.log(
      `   Current: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC on Base`
    );
    console.log(`   Target: Invest in Aave on Arbitrum`);
    console.log(`   Owner: ${randomAccount.address}`);

    // Create orchestration data using SDK
    console.log('\n📤 Creating orchestration request...');
    const orchestrationData = await createOrchestrationData(
      currentState,
      requiredState,
      randomAccount.address,
      TEST_CONFIG.apiKey,
      encodedData as Hex
    );

    console.log('\n✅ Orchestration Created Successfully!');
    console.log('--------------------------------------');
    console.log(`📌 Request ID: ${orchestrationData.requestId}`);
    console.log(`📍 Source Chain: ${orchestrationData.sourceChainId}`);
    console.log(`📍 Destination Chain: ${orchestrationData.destinationChainId}`);
    console.log(
      `💼 Source Account: ${orchestrationData.accountAddressOnSourceChain}`
    );
    console.log(
      `💼 Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`
    );

    // ===== 3. GASLESS DEPOSIT WITH EIP-3009 =====
    console.log('\n===== 3. GASLESS DEPOSIT WITH EIP-3009 (using SDK) =====');
    console.log(
      `Amount: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC`
    );
    console.log(`Smart Account: ${orchestrationData.accountAddressOnSourceChain}`);

    console.log('\nStep 1: Transferring USDC to intermediate account...');
    console.log(`   From: ${userAccount.address}`);
    console.log(`   To: ${randomAccount.address} (intermediate)`);

    console.log('\nStep 2: Signing EIP-3009 authorization (GASLESS!)...');
    console.log(`   Intermediate account signs with ZERO ETH`);

    // Use SDK depositGasless function
    const gaslessResult: GaslessDepositResult = await depositGasless(
      randomAccount.address, // intermediate address
      orchestrationData.accountAddressOnSourceChain, // smart account address
      NETWORKS.baseSepolia.contracts.usdcToken, // token address
      TEST_CONFIG.bridgeAmount, // amount
      userWalletClient, // user wallet (pays for transfer to intermediate)
      randomWalletClient, // intermediate wallet (signs authorization, NO ETH NEEDED!)
      basePublicClient // public client
    );

    if (!gaslessResult.success || !gaslessResult.signedAuthorization) {
      throw new Error(`Gasless deposit failed: ${gaslessResult.error}`);
    }

    console.log('\n✅ Gasless deposit prepared successfully!');
    console.log(`   Transfer Hash: ${gaslessResult.txHash}`);
    console.log(
      `   Authorization From: ${gaslessResult.signedAuthorization.from}`
    );
    console.log(`   Authorization To: ${gaslessResult.signedAuthorization.to}`);
    console.log(
      `   Authorization Value: ${formatUnits(gaslessResult.signedAuthorization.value, 6)} USDC`
    );
    console.log(`   Authorization Nonce: ${gaslessResult.signedAuthorization.nonce}`);

    // Verify random account has USDC
    const randomBalance = (await basePublicClient.readContract({
      address: NETWORKS.baseSepolia.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [randomAccount.address],
    })) as bigint;
    console.log(
      `\n💰 Intermediate account USDC balance: ${formatUnits(randomBalance, 6)} USDC`
    );

    // Get transaction receipt for block number
    const receipt = await basePublicClient.waitForTransactionReceipt({
      hash: gaslessResult.txHash as Hex,
    });

    // ===== 4. NOTIFY SERVER WITH SIGNED AUTHORIZATION =====
    console.log('\n===== 4. NOTIFY SERVER WITH SIGNED AUTHORIZATION (using SDK) =====');
    console.log(`   Transfer Type: TRANSFER_WITH_AUTHORIZATION (${TransferType.TRANSFER_WITH_AUTHORIZATION})`);
    console.log(`   Request ID: ${orchestrationData.requestId}`);

    // Use SDK notifyDepositGasless function
    await notifyDepositGasless(
      orchestrationData.requestId,
      gaslessResult.txHash as Hex,
      receipt.blockNumber,
      gaslessResult.signedAuthorization
    );

    console.log('✅ Server notified successfully!');
    console.log('   Server will execute transferWithAuthorization in Multicall3 batch');

    // ===== 5. MONITOR ORCHESTRATION STATUS =====
    console.log('\n===== 5. MONITOR ORCHESTRATION STATUS (using SDK) =====');
    console.log('⏳ Server will now:');
    console.log('   1. Execute Multicall3 batch:');
    console.log(
      '      - transferWithAuthorization (move from random to smart account)'
    );
    console.log('      - Deploy smart account on source chain');
    console.log('      - Execute bridge operation');
    console.log('   2. Monitor destination chain for funds');
    console.log('   3. Deploy smart account on destination chain');
    console.log('   4. Execute AutoEarn module');
    console.log('\n⏳ Polling orchestration status...');
    console.log('   (This may take 2-3 minutes for bridge transfer)');
    console.log('   Note: Random account has ZERO ETH - completely gasless!');

    try {
      await pollOrchestrationStatus({
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
        },
        onError: (error: Error) => {
          console.log(`\n❌ Orchestration error: ${error.message}`);
        },
      });
    } catch (error) {
      console.log(`\n⚠️  Status polling completed or timed out`);
      if (error instanceof Error) {
        console.log(`   ${error.message}`);
      }
    }

    // ===== 6. FINAL SUMMARY =====
    console.log('\n' + '='.repeat(60));
    console.log('📝 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log('\n✅ SDK Functions Used:');
    console.log('   1. getRequiredState() - Get module requirements');
    console.log('   2. createAutoEarnConfig() - Create AutoEarn config');
    console.log('   3. encodeAutoEarnModuleData() - Encode module data');
    console.log('   4. createOrchestrationData() - Create orchestration request');
    console.log('   5. depositGasless() - Transfer + sign EIP-3009 authorization');
    console.log('   6. notifyDepositGasless() - Notify server with signed data');
    console.log('   7. pollOrchestrationStatus() - Monitor orchestration');
    console.log('\n✅ Key Features Demonstrated:');
    console.log('   • Random account has ZERO ETH (completely gasless)');
    console.log('   • Random account owns both smart accounts');
    console.log('   • EIP-3009 transferWithAuthorization (no gas for signing)');
    console.log('   • Server executes in Multicall3 batch (server pays gas)');
    console.log('   • All operations use SDK functions');
    console.log('\n📌 Important Info:');
    console.log(`   Random Account: ${randomAccount.address}`);
    console.log(`   Private Key: ${randomPrivateKey}`);
    console.log(
      `   Source Smart Account: ${orchestrationData.accountAddressOnSourceChain}`
    );
    console.log(
      `   Destination Smart Account: ${orchestrationData.accountAddressOnDestinationChain}`
    );
    console.log(
      `   Status URL: ${TEST_CONFIG.apiUrl}/api/v1/orchestration/status/${orchestrationData.requestId}`
    );
    console.log('\n✨ Test completed successfully!');
  } catch (error: any) {
    console.error('\n❌ Test Failed!');
    console.error('================');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('\nStack:', error.stack);
    }
    throw error;
  }
}

// Run the test
console.log('Starting EIP-3009 Gasless Deposit Test...\n');

testGaslessDepositEIP3009()
  .then(() => {
    console.log('\n👍 Script execution completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script execution failed:', error);
    process.exit(1);
  });
