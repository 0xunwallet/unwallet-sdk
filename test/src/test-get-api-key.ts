import dotenv from "dotenv";
import { createWalletClient, createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mainnet } from "viem/chains";
import { AccountConfig, getApiKey, SupportedChain } from "unwallet";
import { generatePrivateKey } from "viem/accounts";

// Simple helper to generate a random, likely-unique ENS label for testing
const generateRandomEnsName = (): string => {
  const randomSuffix = Math.random().toString(36).slice(2, 10);
  return `test-${randomSuffix}.wall8.eth`;
};

// Load environment variables
dotenv.config();

// Test getApiKey function
export const testGetApiKey = async () => {
  try {
    console.log("🔍 Testing getApiKey function...");

    // Check if private key is available
    const privateKey = generatePrivateKey();

    // Create account from private key
    const account = privateKeyToAccount(privateKey as `0x${string}`);

    // Create wallet and public clients
    const walletClient = createWalletClient({
      account,
      chain: mainnet,
      transport: http(),
    });

    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    const ens = generateRandomEnsName();

    // Test configuration
    const config = {
      walletClient,
      chainId: mainnet.id as SupportedChain,
      ens: ens,
      modules: [],
      defaultToken: "0xA0b86a33E6441b8c4C8C0C4A0b86a33E6441b8c4C" as `0x${string}`, // Dummy token for mainnet
      needPrivacy: false,
      eigenAiEnabled: false,
      publicClient,
    };

    // Agent details for the API key request
    const agentDetails = {
      email: `${ens}@wall8.eth`,
      website: `https://${ens}.wall8.eth`,
      description: "Test ENS name for API key generation",
      twitter: ens,
      github: ens,
      telegram: ens,
      discord: ens,
    };

    console.log("📋 Test parameters:", {
      ens: config.ens,
      chainId: config.chainId,
      needPrivacy: config.needPrivacy,
      eigenAiEnabled: config.eigenAiEnabled,
      agentDetails,
    });

    // Call getApiKey function
    const result = await getApiKey(config as AccountConfig, { agentDetails });

    console.log("✅ getApiKey result:", result);

    if (result) {
      console.log("📊 API key generation successful");
      console.log("Result details:", {
        apiKey: result.apiKey,
        ensCall: result.ensCall,
        signature: result.signature,
        configHash: result.configHash,
      });

      // Validate the response structure
      if (result.apiKey) {
        console.log("✅ API key received successfully");
      }

      if (result.ensCall) {
        console.log("✅ ENS call completed successfully");
        console.log("ENS call response:", result.ensCall);
      }

      if (result.signature) {
        console.log("✅ Signature generated successfully");
      }

      if (result.configHash) {
        console.log("✅ Config hash generated successfully");
      }

      console.log("🎉 getApiKey test completed successfully!");
    } else {
      console.log("⚠️  getApiKey returned null or undefined");
    }
  } catch (error) {
    console.error("❌ Test failed:", error);

    // Provide more specific error information
    if (error instanceof Error) {
      if (error.message.includes("PRIVATE_KEY")) {
        console.log("💡 Make sure to set PRIVATE_KEY environment variable for testing");
      } else if (error.message.includes("network")) {
        console.log("💡 This might be a network connectivity issue. Check your RPC connection.");
      } else if (error.message.includes("signature")) {
        console.log("💡 This might be a signature generation issue. Check your wallet configuration.");
      } else if (error.message.includes("fetch")) {
        console.log("💡 This might be a server connectivity issue. Check if the ENS server is running.");
      }
    }
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGetApiKey();
}
