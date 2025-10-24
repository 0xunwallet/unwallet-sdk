import dotenv from "dotenv";
import { getRequiredState } from "unwallet";
import { currentChain } from "./utils/chain.js";

dotenv.config();

export const testGetRequiredState = async () => {
  try {
    console.log("🔍 Testing getRequiredState function...");

    // Test 1: Test with valid parameters using default public client
    console.log("\n1. Testing with valid parameters (default public client)...");

    const chainId = currentChain.id;
    const moduleName = "AUTOBRIDGE";

    console.log(`   Chain ID: ${chainId}`);
    console.log(`   Module Name: ${moduleName}`);

    const result1 = await getRequiredState({
      sourceChainId: chainId,
      moduleName: moduleName,
    });

    console.log("✅ Successfully fetched required state:");
    console.log("   Result:", result1);
  } catch (error) {
    console.error("❌ Error testing getRequiredState:", error);
    throw error;
  }
};

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testGetRequiredState()
    .then(() => {
      console.log("\n✅ Test completed successfully!");
      process.exit(0);
    })
    .catch((error) => {
      console.error("\n❌ Test failed:", error);
      process.exit(1);
    });
}
