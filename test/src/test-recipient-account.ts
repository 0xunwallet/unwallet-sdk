import dotenv from "dotenv";
import { createPublicClient, http } from "viem";
import { mainnet } from "viem/chains";

// Load environment variables
dotenv.config();

// Test getRecipientAccountData function
export const testGetRecipientAccountData = async () => {
  try {
    console.log("🔍 Testing getRecipientAccountData function...");

    const ens = "swayam.wall8.eth";

    // Create a public client for Ethereum mainnet to resolve ENS
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: http(),
    });

    console.log("📋 Test parameters:", {
      ens,
      chainId: mainnet.id,
    });

    // Directly call getEnsAddress since getRecipientAccountData only supports specific chains
    const address = await publicClient.getEnsAddress({
      name: ens,
    });

    console.log("✅ ENS resolution result:", { address });

    if (address) {
      console.log("📊 ENS resolution successful");
      console.log("Account details:", {
        ens,
        address,
      });

      console.log("✅ ENS resolution successful - address found");
      console.log(`📍 ENS "${ens}" resolves to: ${address}`);
    } else {
      console.log("⚠️  ENS resolution returned null - ENS might not exist or not configured");
    }
  } catch (error) {
    console.error("❌ Test failed:", error);

    // Provide more specific error information
    if (error instanceof Error) {
      if (error.message.includes("ENS")) {
        console.log("💡 This might be an ENS resolution issue. Check if the ENS name exists and is properly configured.");
      } else if (error.message.includes("network")) {
        console.log("💡 This might be a network connectivity issue. Check your RPC connection.");
      }
    }
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGetRecipientAccountData();
}
