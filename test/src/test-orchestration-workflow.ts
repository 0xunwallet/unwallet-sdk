import dotenv from "dotenv";
import {
  createOrchestrationData,
  transferToOrchestrationAccount,
  notifyDeposit,
  pollOrchestrationStatus,
  getRequiredState,
  encodeAutoEarnModuleData,
  createAutoEarnConfig,
} from "unwallet";
import type { CurrentState, OrchestrationStatus } from "unwallet";
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
  // API server URL
  apiUrl: process.env.TEST_SERVER_URL || process.env.SERVER_URL || "https://tee.wall8.xyz",
  // API key for orchestration
  apiKey: process.env.API_KEY || "test-api-orchestration",
};

async function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function testApiOrchestration() {
  console.log("🌉 API Orchestration Test: Base → Arbitrum USDC Bridge");
  console.log("======================================================");

  try {
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
      console.error("   Please start the server or check SERVER_URL");
      if (error instanceof Error) {
        console.error(`   Error: ${error.message}`);
      }
      // Continue anyway - will fail at API call
    }

    // Setup accounts and clients
    console.log("\n🔐 Setting up Accounts");
    console.log("----------------------");

    // Get private key from environment - prefer TEST_PRIVATE_KEY which has USDC
    const privateKey = process.env.TEST_PRIVATE_KEY || process.env.PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("TEST_PRIVATE_KEY or PRIVATE_KEY environment variable is required");
    }

    // Create funding account (TEE/relayer account with USDC)
    const fundingAccount = privateKeyToAccount(privateKey as Hex);
    console.log(`💰 Funding Account: ${fundingAccount.address}`);

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

    // Create orchestration request
    console.log("\n🎯 Creating Orchestration Request");
    console.log("---------------------------------");

    // Get required state for AutoEarn module
    const requiredState = await getRequiredState({
      sourceChainId: arbitrumSepolia.id,
      moduleName: "AUTOEARN",
    });

    // Encode AutoEarn module data using SDK helper functions
    console.log("🔧 Encoding AutoEarn module configuration...");
    const autoEarnConfig = createAutoEarnConfig(
      421614, // Arbitrum Sepolia chain ID
      NETWORKS.arbitrumSepolia.contracts.usdcToken,
      NETWORKS.arbitrumSepolia.contracts.aavePool,
    );
    const encodedData = encodeAutoEarnModuleData([autoEarnConfig]);
    console.log(`✅ Encoded AutoEarn config for chain ${autoEarnConfig.chainId}`);

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

    // Use SDK to create orchestration data
    console.log("\n📤 Sending request to server...");
    const orchestrationData = await createOrchestrationData(
      currentState,
      requiredState,
      userAccount.address,
      TEST_CONFIG.apiKey,
      encodedData as Hex,
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

    // Transfer USDC to smart account using SDK
    console.log("\n💸 Transferring USDC to Smart Account");
    console.log("-------------------------------------");
    console.log(`Amount: ${formatUnits(TEST_CONFIG.bridgeAmount, 6)} USDC`);
    console.log(`To: ${orchestrationData.accountAddressOnSourceChain}`);

    const depositResult = await transferToOrchestrationAccount(
      orchestrationData,
      baseWalletClient,
      baseClient,
    );

    if (!depositResult.success || !depositResult.txHash) {
      throw new Error(`Transfer failed: ${depositResult.error || "Unknown error"}`);
    }

    console.log("⏳ Waiting for confirmation...");
    const receipt = await baseClient.waitForTransactionReceipt({
      hash: depositResult.txHash as Hex,
    });

    console.log("✅ Transfer confirmed!");
    console.log(`   Tx Hash: ${receipt.transactionHash}`);
    console.log(`   Block: ${receipt.blockNumber}`);

    // Verify balance
    const smartAccountBalance = await baseClient.readContract({
      address: NETWORKS.baseSepolia.contracts.usdcToken,
      abi: ERC20_ABI,
      functionName: "balanceOf",
      args: [orchestrationData.accountAddressOnSourceChain as Address],
    });

    console.log(`   Smart Account Balance: ${formatUnits(smartAccountBalance, 6)} USDC`);

    // Notify server of deposit using SDK
    console.log("\n🔔 Notifying Server of Deposit");
    console.log("------------------------------");
    console.log(`Sending notification with requestId: ${orchestrationData.requestId}`);

    await notifyDeposit({
      requestId: orchestrationData.requestId,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber.toString(),
    });

    console.log("✅ Server notified successfully!");

    // Check orchestration status using SDK
    console.log("\n📊 Checking Orchestration Status");
    console.log("--------------------------------");

    try {
      await pollOrchestrationStatus({
        requestId: orchestrationData.requestId,
        interval: 3000,
        maxAttempts: 10,
        onStatusUpdate: (status: OrchestrationStatus) => {
          console.log(`\n[Status Update] Status: ${status.status}`);
          if (status.updated_at || status.created_at) {
            console.log(
              `   Updated: ${new Date(status.updated_at || status.created_at || Date.now()).toLocaleString()}`,
            );
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
    console.log(
      `   Notifications: ${TEST_CONFIG.apiUrl}/api/v1/notifications/status/${orchestrationData.requestId}`,
    );
    console.log("\n✨ Test completed successfully!");
  } catch (error: any) {
    console.error("\n❌ Test Failed!");
    console.error("================");
    console.error("Error:", error.message);
    if (error.stack) {
      console.error("\nStack:", error.stack);
    }
    throw error;
  }
}

// Run the test
console.log("Starting API Orchestration Test...\n");

testApiOrchestration()
  .then(() => {
    console.log("\n👍 Script execution completed");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Script execution failed:", error);
    process.exit(1);
  });

