import dotenv from "dotenv";
import {
  createOrchestrationData,
  notifyDeposit,
  pollOrchestrationStatus,
  transferToOrchestrationAccount,
  getRequiredState,
  buildAutoEarnModule,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from "unwallet";
import type { CurrentState, RequiredState, OrchestrationStatus } from "unwallet";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia, arbitrumSepolia } from "viem/chains";
import type { Address, Hex } from "viem";

dotenv.config();

// ERC20 ABI for USDC operations
const ERC20_ABI = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// Network configurations
const NETWORKS = {
  baseSepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    chain: baseSepolia,
    rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    contracts: {
      usdcToken: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as Address,
    },
  },
  arbitrumSepolia: {
    name: "Arbitrum Sepolia",
    chainId: 421614,
    chain: arbitrumSepolia,
    rpcUrl: process.env.ARBITRUM_SEPOLIA_RPC || "https://sepolia-rollup.arbitrum.io/rpc",
    contracts: {
      autoEarnModule: "0x42CF1b746F96D6cc59e84F87d26Ea64D3fbCa3a0" as Address,
      usdcToken: "0x75faf114eafb1bdbe2f0316df893fd58ce46aa4d" as Address,
      aavePool: "0xBfC91D59fdAA134A4ED45f7B584cAf96D7792Eff" as Address,
    },
  },
};

// Test configuration
const TEST_CONFIG = {
  // Amount to bridge (0.1 USDC)
  bridgeAmount: parseUnits("0.1", 6),
  // API server URL - defaults to production server
  apiUrl: process.env.TEST_SERVER_URL || process.env.SERVER_URL || "https://tee.wall8.xyz",
  // API key for orchestration
  apiKey: process.env.API_KEY || "test-api-orchestration",
};


export const testCreateOrchestrationData = async () => {
  try {
    console.log("🌉 API Orchestration Test: Base → Arbitrum USDC Bridge");
    console.log("======================================================");

    // Check if server is running
    console.log("\n📡 Checking Server Status...");
    console.log("-----------------------------");
    try {
      const healthResponse = await fetch(`${TEST_CONFIG.apiUrl}/api/v1/orchestration/chains`);
      if (!healthResponse.ok) {
        throw new Error(`Server not responding: ${healthResponse.status}`);
      }
      const chains = (await healthResponse.json()) as { data: Array<{ name: string }> };
      console.log("✅ Server is running");
      console.log(`   Available chains: ${chains.data.map((c) => c.name).join(", ")}`);
    } catch (error) {
      console.error("❌ Server is not running!");
      console.error("   Please start the server or check SERVER_URL_ENS");
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      // Don't exit - continue with test but it will fail at API call
    }

    // Setup accounts and clients
    console.log("\n🔐 Setting up Accounts");
    console.log("----------------------");

    // Get private key from environment - prefer TEST_PRIVATE_KEY (relayer account with USDC)
    const privateKey = process.env.TEST_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      console.log("⚠️  TEST_PRIVATE_KEY or PRIVATE_KEY not set - skipping deposit and notification steps");
      console.log("   Will only test orchestration data creation\n");
      return await testOrchestrationCreationOnly();
    }

    // Create funding account (relayer account with USDC)
    const fundingAccount = privateKeyToAccount(privateKey as Hex);
    console.log(`💰 Funding Account (Relayer): ${fundingAccount.address}`);

    // Create random user account (will own the smart accounts)
    const userPrivateKey = generatePrivateKey();
    const userAccount = privateKeyToAccount(userPrivateKey);
    console.log(`👤 User Account: ${userAccount.address}`);

    // Create blockchain clients
    const baseClient = createPublicClient({
      chain: baseSepolia,
      transport: http(NETWORKS.baseSepolia.rpcUrl),
    }) as any;

    const baseWalletClient = createWalletClient({
      account: fundingAccount,
      chain: baseSepolia,
      transport: http(NETWORKS.baseSepolia.rpcUrl),
    });

    // Check USDC balance
    console.log("\n💵 Checking USDC Balance");
    console.log("------------------------");
    const usdcBalance = await baseClient.readContract({
      address: NETWORKS.baseSepolia.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [fundingAccount.address],
    });

    console.log(`Balance: ${formatUnits(usdcBalance, 6)} USDC`);
    if (usdcBalance < TEST_CONFIG.bridgeAmount) {
      throw new Error(
        `Insufficient USDC. Need ${formatUnits(TEST_CONFIG.bridgeAmount, 6)}, have ${formatUnits(usdcBalance, 6)}`,
      );
    }

    // Get required state for AutoEarn module
    console.log("\n📊 Getting Required State");
    console.log("--------------------------");
    const requiredState = await getRequiredState({
      sourceChainId: arbitrumSepolia.id,
      moduleName: "AUTOEARN",
    });

    console.log("✅ Required state retrieved:");
    console.log(`   Chain ID: ${requiredState.chainId}`);
    console.log(`   Module: ${requiredState.moduleName}`);
    console.log(`   Module Address: ${requiredState.moduleAddress}`);
    console.log(`   Config Input Type: ${requiredState.configInputType}`);

    // Build AutoEarn module - try server API first, fallback to client-side
    let encodedData: string;
    
    try {
      // Try server-side API first (simpler - server handles encoding)
      console.log("🔧 Building AutoEarn module using server API...");
      const autoEarnModule = await buildAutoEarnModule(
        {
          chainId: arbitrumSepolia.id,
          tokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
          // vaultAddress is optional - server uses default Aave pool
        },
        {
          baseUrl: TEST_CONFIG.apiUrl,
        },
      );
      encodedData = autoEarnModule.data;
      console.log(`✅ AutoEarn module built via server API: ${autoEarnModule.address}`);
    } catch (error) {
      // Fallback to client-side encoding if server API is not available
      console.log("⚠️  Server API not available, using client-side encoding...");
      console.log(`   Error: ${error instanceof Error ? error.message : String(error)}`);
      const autoEarnConfig = createAutoEarnConfig(
        arbitrumSepolia.id,
        NETWORKS.arbitrumSepolia.contracts.usdcToken,
        NETWORKS.arbitrumSepolia.contracts.aavePool,
      );
      encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
      console.log(`✅ AutoEarn module encoded client-side: ${requiredState.moduleAddress}`);
    }

    // Create orchestration request
    console.log("\n🎯 Creating orchestration request...");
    const currentState: CurrentState = {
      chainId: baseSepolia.id,
      tokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
      tokenAmount: TEST_CONFIG.bridgeAmount.toString(),
      ownerAddress: userAccount.address,
    };

    console.log("📝 User Intent:");
    console.log(`   Current: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC on Base`);
    console.log(`   Target: Invest in Aave on Arbitrum`);
    console.log(`   User: ${userAccount.address}`);

    // Create orchestration data using the built module
    const orchestrationData = await createOrchestrationData(
      currentState,
      requiredState, // Use requiredState which has all metadata
      userAccount.address,
      TEST_CONFIG.apiKey,
      encodedData as Hex, // Use encoded data (from server or client)
    );

    console.log("\n✅ Orchestration Created Successfully!");
    console.log("--------------------------------------");
    console.log(`📌 Request ID: ${orchestrationData.requestId}`);
    console.log(`📍 Source Chain: ${orchestrationData.sourceChainId}`);
    console.log(`📍 Destination Chain: ${orchestrationData.destinationChainId}`);
    console.log(`💼 Source Account: ${orchestrationData.accountAddressOnSourceChain}`);
    console.log(`💼 Destination Account: ${orchestrationData.accountAddressOnDestinationChain}`);
    console.log(`🔧 Source Modules: ${orchestrationData.sourceChainAccountModules.join(", ")}`);
    console.log(`🔧 Destination Modules: ${orchestrationData.destinationChainAccountModules.join(", ")}`);

    // Transfer USDC to orchestration account using SDK
    console.log(`\n💸 Transferring ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC to: ${orchestrationData.accountAddressOnSourceChain}`);

    const depositResult = await transferToOrchestrationAccount(
      orchestrationData,
      baseWalletClient,
      baseClient,
    );

    if (!depositResult.success || !depositResult.txHash) {
      throw new Error(`Transfer failed: ${depositResult.error || "Unknown error"}`);
    }

    console.log(`✅ Transfer submitted: ${depositResult.txHash}`);

    // Get transaction receipt
    console.log("⏳ Waiting for transaction confirmation...");
    const receipt = await baseClient.waitForTransactionReceipt({
      hash: depositResult.txHash as Hex,
    });

    console.log(`✅ Transfer confirmed! Block: ${receipt.blockNumber}`);

    // Verify balance
    const smartAccountBalance = await baseClient.readContract({
      address: NETWORKS.baseSepolia.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [orchestrationData.accountAddressOnSourceChain as Address],
    });

    console.log(`   Smart Account Balance: ${formatUnits(smartAccountBalance, 6)} USDC`);

    // Notify server of deposit
    console.log(`\n🔔 Notifying server of deposit...`);
    console.log(`   Request ID: ${orchestrationData.requestId}`);

    await notifyDeposit({
      requestId: orchestrationData.requestId,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
    });

    console.log("✅ Server notified successfully!");

    // Check orchestration status
    console.log("\n📊 Polling orchestration status...");

    try {
      await pollOrchestrationStatus({
        requestId: orchestrationData.requestId,
        interval: 3000,
        maxAttempts: 100,
        onStatusUpdate: (status: OrchestrationStatus) => {
          console.log(`\n[Status Update] Status: ${status.status}`);
          if (status.updated_at || status.created_at) {
            console.log(`   Updated: ${new Date(status.updated_at || status.created_at || Date.now()).toLocaleString()}`);
          }
          if (status.error_message) {
            console.log(`   Error: ${status.error_message}`);
          }
        },
        onComplete: (status: OrchestrationStatus) => {
          console.log("\n🎉 Orchestration completed successfully!");
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

    // Final summary
    console.log("\n" + "=".repeat(60));
    console.log("📝 TEST SUMMARY");
    console.log("=".repeat(60));
    console.log("\n✅ Completed Steps:");
    console.log("   1. Created orchestration request");
    console.log("   2. Server generated requestId: " + orchestrationData.requestId);
    console.log("   3. Transferred USDC to smart account");
    console.log("   4. Notified server with requestId");
    console.log("   5. Server is processing orchestration");
    console.log("\n🔄 Server Orchestration Process:");
    console.log("   • Monitor source chain for deposit");
    console.log("   • Deploy account + execute bridge on Base");
    console.log("   • Monitor destination chain for funds");
    console.log("   • Deploy account + execute earn on Arbitrum");
    console.log("   • Update status to COMPLETED");
    console.log("\n📌 Important URLs:");
    console.log(`   Status: ${TEST_CONFIG.apiUrl}/api/v1/orchestration/status/${orchestrationData.requestId}`);
    console.log(`   Notifications: ${TEST_CONFIG.apiUrl}/api/v1/notifications/status/${orchestrationData.requestId}`);
    console.log("\n✨ Test completed successfully!");

    return orchestrationData;
  } catch (error) {
    console.error("\n❌ Test Failed!");
    console.error("================");
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("Error:", errorMessage);
    if (errorStack) {
      console.error("\nStack:", errorStack);
    }
    throw error;
  }
};

// Test orchestration creation only (without deposit)
async function testOrchestrationCreationOnly() {
  console.log("\n🔍 Testing createOrchestrationData function (creation only)...");

  // Get required state
  const requiredState = await getRequiredState({
    sourceChainId: arbitrumSepolia.id,
    moduleName: "AUTOEARN",
  });

  // Try server API, fallback to client-side encoding
  let encodedData: string;
  try {
    console.log("🔧 Trying server API...");
    const autoEarnModule = await buildAutoEarnModule(
      {
        chainId: arbitrumSepolia.id,
        tokenAddress: NETWORKS.arbitrumSepolia.contracts.usdcToken,
      },
      {
        baseUrl: TEST_CONFIG.apiUrl,
      },
    );
    encodedData = autoEarnModule.data;
    console.log(`✅ Module built via server API: ${autoEarnModule.address}`);
  } catch (error) {
    console.log("⚠️  Server API not available, using client-side encoding...");
    const autoEarnConfig = createAutoEarnConfig(
      arbitrumSepolia.id,
      NETWORKS.arbitrumSepolia.contracts.usdcToken,
      NETWORKS.arbitrumSepolia.contracts.aavePool,
    );
    encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ Module encoded client-side: ${requiredState.moduleAddress}`);
  }

  console.log("Required state:", {
    chainId: requiredState.chainId,
    moduleName: requiredState.moduleName,
    moduleAddress: requiredState.moduleAddress,
  });

  // Create current state
  const currentState: CurrentState = {
    chainId: baseSepolia.id,
    tokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
    tokenAmount: parseUnits("0.1", 6).toString(),
    ownerAddress: "0x1234567890123456789012345678901234567890" as Address,
  };

  const ownerAddress = "0x1234567890123456789012345678901234567890" as Address;
  const apiKey = process.env.API_KEY || "test-api-key";

  // Test the function
  const orchestrationData = await createOrchestrationData(
    currentState,
    requiredState,
    ownerAddress,
    apiKey,
    encodedData as Hex,
  );

  console.log("✅ Successfully created orchestration data:");
  console.log("Request ID:", orchestrationData.requestId);
  console.log("Source Chain ID:", orchestrationData.sourceChainId);
  console.log("Destination Chain ID:", orchestrationData.destinationChainId);
  console.log("Source Account:", orchestrationData.accountAddressOnSourceChain);
  console.log("Destination Account:", orchestrationData.accountAddressOnDestinationChain);
  console.log("Source Token Amount:", formatUnits(orchestrationData.sourceTokenAmount, 6), "USDC");

  console.log("\n✅ Test completed successfully!");
  return orchestrationData;
}

// Run the test if this file is executed directly
(async () => {
  try {
    await testCreateOrchestrationData();
    process.exit(0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error("\n❌ Test failed:");
    console.error("Error message:", errorMessage);
    if (errorStack) {
      console.error("Stack trace:", errorStack);
    }
    console.error("Full error:", error);
    process.exit(1);
  }
})();
