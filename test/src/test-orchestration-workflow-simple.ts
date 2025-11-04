import dotenv from "dotenv";
import {
  createOrchestrationData,
  transferToOrchestrationAccount,
  notifyDeposit,
  getRequiredState,
  pollOrchestrationStatus,
} from "unwallet";
import type { CurrentState, OrchestrationStatus } from "unwallet";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  encodeAbiParameters,
  keccak256,
} from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { baseSepolia, arbitrumSepolia } from "viem/chains";
import type { Address, Hex } from "viem";

dotenv.config();

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

/**
 * Simple orchestration workflow using SDK functions
 * 
 * Usage:
 * 1. Set TEST_PRIVATE_KEY (relayer account with USDC)
 * 2. Set API_KEY (optional, defaults to test-api-key)
 * 3. Run: pnpm test:orchestration-workflow-simple
 */
async function simpleOrchestrationWorkflow() {
  console.log("🌉 Simple Orchestration Workflow");
  console.log("=================================");

  // Get relayer private key
  const privateKey = process.env.TEST_PRIVATE_KEY || process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("TEST_PRIVATE_KEY or PRIVATE_KEY environment variable is required");
  }

  // Setup accounts
  const relayerAccount = privateKeyToAccount(privateKey as Hex);
  const userAccount = privateKeyToAccount(generatePrivateKey());

  console.log(`💰 Relayer Account: ${relayerAccount.address}`);
  console.log(`👤 User Account: ${userAccount.address}`);

  // Create clients
  const baseClient = createPublicClient({
    chain: baseSepolia,
    transport: http(NETWORKS.baseSepolia.rpcUrl),
  }) as any;

  const baseWalletClient = createWalletClient({
    account: relayerAccount,
    chain: baseSepolia,
    transport: http(NETWORKS.baseSepolia.rpcUrl),
  });

  // Step 1: Get required state
  console.log("\n📊 Step 1: Getting Required State");
  const requiredState = await getRequiredState({
    sourceChainId: arbitrumSepolia.id,
    moduleName: "AUTOEARN",
  });

  // Step 2: Encode module data
  const configData = encodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "chainId", type: "uint256" },
          { name: "token", type: "address" },
          { name: "vault", type: "address" },
        ],
      },
    ],
    [
      [
        {
          chainId: BigInt(421614),
          token: NETWORKS.arbitrumSepolia.contracts.usdcToken,
          vault: NETWORKS.arbitrumSepolia.contracts.aavePool,
        },
      ],
    ],
  );
  const configHash = keccak256(configData);
  const encodedData = encodeAbiParameters([{ type: "uint256" }], [BigInt(configHash)]);

  // Step 3: Create orchestration data
  console.log("\n🎯 Step 2: Creating Orchestration");
  const bridgeAmount = parseUnits("0.1", 6);
  const currentState: CurrentState = {
    chainId: baseSepolia.id,
    tokenAddress: NETWORKS.baseSepolia.contracts.usdcToken,
    tokenAmount: bridgeAmount.toString(),
    ownerAddress: userAccount.address,
  };

  const orchestrationData = await createOrchestrationData(
    currentState,
    requiredState,
    userAccount.address,
    process.env.API_KEY || "test-api-key",
    encodedData as Hex,
  );

  console.log(`✅ Request ID: ${orchestrationData.requestId}`);
  console.log(`📍 Source Account: ${orchestrationData.accountAddressOnSourceChain}`);

  // Step 4: Transfer USDC to orchestration account
  console.log("\n💸 Step 3: Transferring USDC");
  const depositResult = await transferToOrchestrationAccount(
    orchestrationData,
    baseWalletClient,
    baseClient,
  );

  if (!depositResult.success || !depositResult.txHash) {
    throw new Error(`Transfer failed: ${depositResult.error}`);
  }

  console.log(`✅ Transfer confirmed: ${depositResult.txHash}`);

  // Get receipt for block number
  const receipt = await baseClient.waitForTransactionReceipt({
    hash: depositResult.txHash as Hex,
  });

  // Step 5: Notify server
  console.log("\n🔔 Step 4: Notifying Server");
  await notifyDeposit({
    requestId: orchestrationData.requestId,
    transactionHash: depositResult.txHash as Hex,
    blockNumber: receipt.blockNumber.toString(),
  });

  console.log("✅ Server notified!");

  // Step 6: Poll status
  console.log("\n📊 Step 5: Polling Status");
  try {
    await pollOrchestrationStatus({
      requestId: orchestrationData.requestId,
      interval: 3000,
      maxAttempts: 10,
      onStatusUpdate: (status: OrchestrationStatus) => {
        console.log(`   Status: ${status.status}`);
      },
      onComplete: (status: OrchestrationStatus) => {
        console.log("\n🎉 Orchestration completed!");
      },
    });
  } catch (error) {
    console.log(`\n⚠️  Status check: ${error instanceof Error ? error.message : "Unknown"}`);
  }

  console.log("\n✨ Workflow completed!");
}

// Run if executed directly
(async () => {
  try {
    await simpleOrchestrationWorkflow();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Failed:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
})();

